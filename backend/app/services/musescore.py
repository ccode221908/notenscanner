"""MuseScore CLI service — typesetting and MIDI export."""
from pathlib import Path
from typing import List

async def export_all(musicxml_file: Path, output_dir: Path) -> List[str]:
    """Export PDF, full MIDI, and per-part MIDIs. Returns list of part names."""
    raise NotImplementedError("To be implemented in Task 3")
