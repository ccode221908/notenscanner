"""Audiveris OMR service — subprocess wrapper."""
import asyncio
import logging
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIVERIS_BIN = "/opt/audiveris/bin/Audiveris"
TIMEOUT_SECONDS = 300


def _extract_mxl(mxl_path: Path) -> Path:
    """Extract a .mxl (compressed MusicXML) to a .xml file next to it."""
    xml_path = mxl_path.with_suffix(".xml")
    with zipfile.ZipFile(mxl_path) as z:
        # MXL contains a rootfile entry in META-INF/container.xml, or simply
        # the first non-meta .xml file is the score.
        score_entry = None
        for name in z.namelist():
            if name.endswith(".xml") and not name.startswith("META-INF"):
                score_entry = name
                break
        if score_entry is None:
            raise RuntimeError(f"No XML found inside {mxl_path}")
        xml_path.write_bytes(z.read(score_entry))
    logger.info("Extracted %s -> %s", mxl_path, xml_path)
    return xml_path


async def run_omr(input_file: Path, output_dir: Path) -> Path:
    """
    Run Audiveris OMR on input_file.
    Returns path to the generated MusicXML file.
    Raises RuntimeError if OMR fails.
    """
    cmd = [
        AUDIVERIS_BIN,
        "-batch",
        "-export",
        "-output", str(output_dir),
        "--",
        str(input_file),
    ]
    logger.info("Running Audiveris: %s", " ".join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
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
            f"Audiveris timed out after {TIMEOUT_SECONDS}s on {input_file}"
        )

    stdout_text = stdout.decode(errors="replace")
    stderr_text = stderr.decode(errors="replace")
    logger.debug("Audiveris stdout: %s", stdout_text)
    logger.debug("Audiveris stderr: %s", stderr_text)

    # Audiveris may produce .xml or .mxl (compressed MusicXML)
    xml_files = list(output_dir.glob("*.xml"))
    mxl_files = list(output_dir.glob("*.mxl"))

    if proc.returncode != 0 or (not xml_files and not mxl_files):
        raise RuntimeError(
            f"Audiveris failed (rc={proc.returncode}): {stderr_text}"
        )

    if xml_files:
        logger.info("Audiveris produced XML: %s", xml_files[0])
        return xml_files[0]

    # Extract the first .mxl to .xml
    mxl_files.sort()
    logger.info("Audiveris produced MXL: %s — extracting", mxl_files[0])
    return _extract_mxl(mxl_files[0])
