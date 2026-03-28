"""MuseScore CLI service — typesetting and MIDI export."""
import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any

from app.services.xml_parser import get_parts, extract_part_xml

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 120


def _musescore_env() -> dict:
    display = os.environ.get("XVFB_DISPLAY", ":99")
    return {**os.environ, "DISPLAY": display, "QT_QPA_PLATFORM": "xcb"}


def _musescore_cmd() -> str:
    return os.environ.get("MUSESCORE_BIN", "musescore3")


async def _run_musescore(input_file: Path, output_path: Path) -> None:
    """Run MuseScore to convert input_file to output_path."""
    env = _musescore_env()
    cmd = [_musescore_cmd(), "-o", str(output_path), str(input_file)]
    logger.info("Running MuseScore: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise asyncio.TimeoutError(
            f"MuseScore timed out after {TIMEOUT_SECONDS}s converting {input_file} -> {output_path}"
        )

    stdout_text = stdout.decode(errors="replace")
    stderr_text = stderr.decode(errors="replace")
    logger.debug("MuseScore stdout: %s", stdout_text)
    logger.debug("MuseScore stderr: %s", stderr_text)

    if proc.returncode != 0:
        raise RuntimeError(
            f"MuseScore failed (rc={proc.returncode}): {stderr_text}"
        )


async def export_score(musicxml_file: Path, output_dir: Path) -> Dict[str, Any]:
    """
    Export a MusicXML file to PDF and MIDI using MuseScore.
    Also exports per-part MIDI files.
    Returns:
        {
            "pdf": Path,          # path to typeset PDF
            "midi_full": Path,    # path to full-score MIDI
            "parts": [            # list of per-part info
                {"name": str, "midi": Path},
                ...
            ]
        }
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    stem = musicxml_file.stem

    # 1a. Export MuseScore-normalised MusicXML (used by the browser viewer)
    clean_xml_path = output_dir / f"{stem}.ms.musicxml"
    await _run_musescore(musicxml_file, clean_xml_path)
    logger.info("Exported clean MusicXML: %s", clean_xml_path)

    # 1b. Export full PDF
    pdf_path = output_dir / f"{stem}.pdf"
    await _run_musescore(musicxml_file, pdf_path)
    logger.info("Exported PDF: %s", pdf_path)

    # 2. Export full MIDI
    midi_full_path = output_dir / f"{stem}.mid"
    await _run_musescore(musicxml_file, midi_full_path)
    logger.info("Exported full MIDI: %s", midi_full_path)

    # 3. Parse parts from MusicXML
    parts_info = get_parts(musicxml_file)
    logger.info("Found %d part(s): %s", len(parts_info), parts_info)

    # 4. For each part, extract single-part MusicXML then export MIDI
    parts_dir = output_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    parts_result = []
    for part_id, part_name in parts_info:
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in part_name)
        part_xml_path = parts_dir / f"{stem}_{safe_name}.xml"
        part_midi_path = parts_dir / f"{stem}_{safe_name}.mid"

        extract_part_xml(musicxml_file, part_id, part_xml_path)

        await _run_musescore(part_xml_path, part_midi_path)
        logger.info("Exported part MIDI: %s", part_midi_path)
        parts_result.append({"name": part_name, "midi": part_midi_path})

    return {
        "pdf": pdf_path,
        "midi_full": midi_full_path,
        "parts": parts_result,
    }
