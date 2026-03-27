"""Audiveris OMR service — subprocess wrapper."""
from pathlib import Path

async def run_omr(input_file: Path, output_dir: Path) -> Path:
    """Run Audiveris OMR on input_file, return path to MusicXML file."""
    raise NotImplementedError("To be implemented in Task 3")
