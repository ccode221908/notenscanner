import asyncio
import logging
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session, select

from app.models import Score, Part
from app.services.storage import score_output_dir, parts_dir

router = APIRouter(prefix="/scores", tags=["files"])
logger = logging.getLogger(__name__)

SSE_MAX_SECONDS = 300  # 5 minutes
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


def _get_engine():
    """Lazy import to avoid circular import with app.main."""
    from app.main import engine
    return engine


def _validate_score_id(score_id: str) -> None:
    """Raise 400 if score_id is not a valid UUID (prevents path traversal)."""
    if not _UUID_RE.match(score_id):
        raise HTTPException(status_code=400, detail="Invalid score ID")


def _require_score(db: Session, score_id: str) -> Score:
    """Raise 404 if score does not exist in DB."""
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    return score


@router.get("/{score_id}/status")
async def score_status_sse(score_id: str):
    """Server-Sent Events stream for processing status."""
    _validate_score_id(score_id)

    async def event_generator():
        elapsed = 0
        # Single session for the lifetime of this SSE connection
        with Session(_get_engine()) as db:
            while elapsed < SSE_MAX_SECONDS:
                score = db.get(Score, score_id)
                if not score:
                    yield "data: not_found\n\n"
                    return
                # Expire cached attributes to get fresh data on each poll
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
def get_musicxml(score_id: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_score(db, score_id)
    output_dir = score_output_dir(score_id)
    xml_files = [f for f in output_dir.glob("*.xml") if f.parent == output_dir]
    if not xml_files:
        raise HTTPException(status_code=404, detail="MusicXML file not found")
    return FileResponse(path=str(xml_files[0]), media_type="application/xml")


@router.get("/{score_id}/pdf")
def get_pdf(score_id: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_score(db, score_id)
    output_dir = score_output_dir(score_id)
    pdf_files = [f for f in output_dir.glob("*.pdf") if f.parent == output_dir]
    if not pdf_files:
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path=str(pdf_files[0]))


@router.get("/{score_id}/midi")
def get_midi(score_id: str):
    _validate_score_id(score_id)
    with Session(_get_engine()) as db:
        _require_score(db, score_id)
    output_dir = score_output_dir(score_id)
    midi_files = [f for f in output_dir.glob("*.mid") if f.parent == output_dir]
    if not midi_files:
        raise HTTPException(status_code=404, detail="MIDI file not found")
    return FileResponse(path=str(midi_files[0]), media_type="audio/midi")


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

        return FileResponse(path=str(midi_path), media_type="audio/midi")
