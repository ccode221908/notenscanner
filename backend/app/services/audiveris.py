"""Audiveris OMR service — subprocess wrapper."""
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIVERIS_BIN = "/opt/audiveris/bin/Audiveris"
TIMEOUT_SECONDS = 300


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

    xml_files = list(output_dir.glob("*.xml"))

    if proc.returncode != 0 or not xml_files:
        raise RuntimeError(
            f"Audiveris failed (rc={proc.returncode}): {stderr_text}"
        )

    logger.info("Audiveris produced: %s", xml_files[0])
    return xml_files[0]
