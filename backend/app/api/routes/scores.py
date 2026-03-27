import logging
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from sqlmodel import Session, select
from typing import List
from datetime import datetime, timezone
from pathlib import Path

from app.models import Score, Part, ScoreRead, PartRead, ScoreDetail
from app.services.storage import score_upload_dir, score_output_dir
from app.services.audiveris import run_omr
from app.services.musescore import export_score

router = APIRouter(prefix="/scores", tags=["scores"])
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".pdf"}


def _get_engine():
    """Lazy import to avoid circular import with app.main."""
    from app.main import engine
    return engine


async def process_score(score_id: str):
    """Background task: runs OMR then MuseScore export. Opens its own DB session."""
    with Session(_get_engine()) as db:
        # 1. Load score from DB
        score = db.get(Score, score_id)
        if not score:
            return

        try:
            # 2. Set status to "processing"
            score.status = "processing"
            score.updated_at = datetime.now(timezone.utc)
            db.add(score)
            db.commit()
            db.refresh(score)

            # 3. Find the input file
            upload_dir = score_upload_dir(score_id)
            input_files = list(upload_dir.glob("input.*"))
            if not input_files:
                raise FileNotFoundError(f"No input file found in {upload_dir}")
            input_file = input_files[0]

            # 4. Get output dir
            output_dir = score_output_dir(score_id)

            # 5. Run OMR
            musicxml_path = await run_omr(input_file, output_dir)

            # 6. Set status to "omr_done"
            score.status = "omr_done"
            score.updated_at = datetime.now(timezone.utc)
            db.add(score)
            db.commit()

            # 7. Export score via MuseScore
            result = await export_score(musicxml_path, output_dir)

            # 8. Create Part records
            for part in result["parts"]:
                db_part = Part(
                    score_id=score_id,
                    name=part["name"],
                    midi_filename=part["midi"].name,
                )
                db.add(db_part)

            # 9. Set status to "ready"
            score.status = "ready"
            score.updated_at = datetime.now(timezone.utc)
            db.add(score)
            db.commit()

        except Exception as e:
            logger.exception("Processing failed for score %s: %s", score_id, e)
            try:
                score.status = "failed"
                score.error_message = str(e)
                score.updated_at = datetime.now(timezone.utc)
                db.add(score)
                db.commit()
            except Exception as commit_err:
                logger.exception("Failed to persist error state for score %s: %s", score_id, commit_err)


@router.post("", response_model=ScoreRead, status_code=201)
async def upload_score(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    with Session(_get_engine()) as db:
        # Create score record
        score = Score(
            filename=f"input{suffix}",
            original_filename=file.filename,
            status="pending",
        )
        db.add(score)
        db.commit()
        db.refresh(score)

        # Save file to upload dir
        upload_dir = score_upload_dir(score.id)
        dest = upload_dir / f"input{suffix}"
        content = await file.read()
        dest.write_bytes(content)

        # Start background processing (opens its own session)
        background_tasks.add_task(process_score, score.id)

        return ScoreRead.model_validate(score)


@router.get("", response_model=List[ScoreRead])
def list_scores():
    with Session(_get_engine()) as db:
        statement = select(Score).order_by(Score.created_at.desc())
        scores = db.exec(statement).all()
        return [ScoreRead.model_validate(s) for s in scores]


@router.get("/{score_id}", response_model=ScoreDetail)
def get_score(score_id: str):
    with Session(_get_engine()) as db:
        score = db.get(Score, score_id)
        if not score:
            raise HTTPException(status_code=404, detail="Score not found")

        parts_statement = select(Part).where(Part.score_id == score_id)
        parts = db.exec(parts_statement).all()

        detail = ScoreDetail.model_validate(score)
        detail.parts = [PartRead.model_validate(p) for p in parts]
        return detail
