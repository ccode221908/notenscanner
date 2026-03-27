import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session, select

from app.models import Score, Part
from app.services.storage import score_output_dir, parts_dir

router = APIRouter(prefix="/scores", tags=["files"])

SSE_MAX_SECONDS = 300  # 5 minutes


def _get_engine():
    """Lazy import to avoid circular import with app.main."""
    from app.main import engine
    return engine


@router.get("/{score_id}/status")
async def score_status_sse(score_id: str):
    """Server-Sent Events stream for processing status."""

    async def event_generator():
        elapsed = 0
        while elapsed < SSE_MAX_SECONDS:
            with Session(_get_engine()) as db:
                score = db.get(Score, score_id)
                if not score:
                    yield "data: not_found\n\n"
                    return
                status = score.status

            yield f"data: {status}\n\n"

            if status in ("ready", "failed"):
                return

            await asyncio.sleep(1)
            elapsed += 1

        # Max time reached — send a final timeout message
        yield "data: timeout\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{score_id}/musicxml")
def get_musicxml(score_id: str):
    output_dir = score_output_dir(score_id)
    xml_files = list(output_dir.glob("*.xml"))
    if not xml_files:
        raise HTTPException(status_code=404, detail="MusicXML file not found")
    return FileResponse(path=str(xml_files[0]), media_type="application/xml")


@router.get("/{score_id}/pdf")
def get_pdf(score_id: str):
    output_dir = score_output_dir(score_id)
    # Only files directly in output_dir, not in parts subdir
    pdf_files = [f for f in output_dir.glob("*.pdf") if f.parent == output_dir]
    if not pdf_files:
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path=str(pdf_files[0]))


@router.get("/{score_id}/midi")
def get_midi(score_id: str):
    output_dir = score_output_dir(score_id)
    # Only files directly in output_dir, not in parts subdir
    midi_files = [f for f in output_dir.glob("*.mid") if f.parent == output_dir]
    if not midi_files:
        raise HTTPException(status_code=404, detail="MIDI file not found")
    return FileResponse(path=str(midi_files[0]), media_type="audio/midi")


@router.get("/{score_id}/parts/{part_name}/midi")
def get_part_midi(score_id: str, part_name: str):
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
