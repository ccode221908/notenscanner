import asyncio
import logging
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session, select

from app.models import Score, Part
from app.services.storage import score_output_dir, parts_dir
from app.services.musescore import _run_musescore

router = APIRouter(prefix="/scores", tags=["files"])
logger = logging.getLogger(__name__)

SSE_MAX_SECONDS = 300
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

# On-demand export formats: extension -> (media_type, description)
EXPORT_FORMATS = {
    "mxl":  ("application/vnd.recordare.musicxml", "MusicXML compressed"),
    "mscz": ("application/octet-stream",           "MuseScore native"),
    "ly":   ("text/x-lilypond",                    "LilyPond"),
    "mp3":  ("audio/mpeg",                         "MP3 audio"),
}


def _get_engine():
    from app.main import engine
    return engine


def _validate_score_id(score_id: str) -> None:
    if not _UUID_RE.match(score_id):
        raise HTTPException(status_code=400, detail="Invalid score ID")


def _require_ready_score(db: Session, score_id: str) -> Score:
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    if score.status != "ready":
        raise HTTPException(status_code=409, detail="Score is not ready yet")
    return score


def _find_musicxml(score_id: str):
    """Return path to the extracted MusicXML file for a score."""
    output_dir = score_output_dir(score_id)
    xml_files = [f for f in output_dir.glob("*.xml") if f.parent == output_dir]
    if not xml_files:
        raise HTTPException(status_code=404, detail="MusicXML source file not found")
    return xml_files[0]


@router.get("/{score_id}/status")
async def score_status_sse(score_id: str):
    _validate_score_id(score_id)

    async def event_generator():
        elapsed = 0
        with Session(_get_engine()) as db:
            while elapsed < SSE_MAX_SECONDS:
                score = db.get(Score, score_id)
                if not score:
                    yield "data: not_found\n\n"
                    return
                db.expire(score)
                score = db.get(Score, score_id)
                status = score.status

                yield f"data: {status}\n\n"

                if status in ("ready", "failed"):
                    return

                await asyncio.sleep(1)
                elapsed += 1

        yield "data: timeout\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{score_id}/musicxml")
async def get_musicxml(score_id: str):
    """Serve a MuseScore-normalised MusicXML for OSMD rendering.

    Audiveris XML can contain structures that crash OSMD internally.
    Running it through MuseScore first produces clean, standard XML.
    The result is cached next to the source file as {stem}.ms.musicxml.
    Falls back to the raw Audiveris XML if MuseScore conversion fails.
    """
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_ready_score(db, score_id)

    xml_path = _find_musicxml(score_id)
    clean_path = xml_path.with_suffix(".ms.musicxml")

    if not clean_path.exists():
        try:
            await _run_musescore(xml_path, clean_path)
        except Exception as exc:
            logger.warning("MuseScore normalisation failed, falling back to raw XML: %s", exc)
            clean_path = xml_path

    serve_path = clean_path if clean_path.exists() else xml_path
    return FileResponse(
        path=str(serve_path),
        media_type="application/xml",
        filename=serve_path.name,
    )


@router.get("/{score_id}/pdf")
def get_pdf(score_id: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_ready_score(db, score_id)
    output_dir = score_output_dir(score_id)
    pdf_files = [f for f in output_dir.glob("*.pdf") if f.parent == output_dir]
    if not pdf_files:
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path=str(pdf_files[0]), filename=pdf_files[0].name)


@router.get("/{score_id}/midi")
def get_midi(score_id: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_ready_score(db, score_id)
    output_dir = score_output_dir(score_id)
    midi_files = [f for f in output_dir.glob("*.mid") if f.parent == output_dir]
    if not midi_files:
        raise HTTPException(status_code=404, detail="MIDI file not found")
    return FileResponse(path=str(midi_files[0]), media_type="audio/midi", filename=midi_files[0].name)


@router.get("/{score_id}/parts/{part_name}/midi")
def get_part_midi(score_id: str, part_name: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        statement = select(Part).where(
            Part.score_id == score_id,
            Part.name == part_name,
        )
        part = db.exec(statement).first()
        if not part:
            raise HTTPException(status_code=404, detail="Part not found")

        midi_path = parts_dir(score_id) / part.midi_filename
        if not midi_path.exists():
            raise HTTPException(status_code=404, detail="Part MIDI file not found")

        return FileResponse(path=str(midi_path), media_type="audio/midi", filename=part.midi_filename)


@router.get("/{score_id}/export/{fmt}")
async def export_format(score_id: str, fmt: str):
    """On-demand export: generate file with MuseScore if not already cached."""
    _validate_score_id(score_id)
    if fmt not in EXPORT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unknown format '{fmt}'. Supported: {', '.join(EXPORT_FORMATS)}")

    with Session(_get_engine()) as db:
        _require_ready_score(db, score_id)

    media_type, _ = EXPORT_FORMATS[fmt]
    xml_path = _find_musicxml(score_id)
    output_path = score_output_dir(score_id) / f"{xml_path.stem}.{fmt}"

    if not output_path.exists():
        logger.info("Generating %s export for %s", fmt, score_id)
        await _run_musescore(xml_path, output_path)

    if not output_path.exists():
        raise HTTPException(status_code=500, detail=f"Export to {fmt} failed")

    return FileResponse(path=str(output_path), media_type=media_type, filename=output_path.name)
