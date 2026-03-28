from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel
from sqlalchemy import create_engine
from app.config import settings
import app.models  # noqa: F401 — must import before create_all to register table metadata
from app.api.routes import scores, files

# Ensure data dirs exist
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
settings.scores_dir.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{settings.data_dir}/db.sqlite"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

def create_db():
    SQLModel.metadata.create_all(engine)

app = FastAPI(title="Sheet Music Web", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://notes.m8u.de"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db()
    from sqlalchemy import text
    from sqlmodel import Session, select
    from app.models import Score
    from datetime import datetime, timezone

    with engine.connect() as conn:
        # Auto-migrate: add display_name column if missing
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(score)")).fetchall()]
        if "display_name" not in cols:
            conn.execute(text("ALTER TABLE score ADD COLUMN display_name TEXT"))
            conn.commit()

    # On every startup: any score still in an in-progress state was interrupted
    # by a previous server shutdown. Mark them failed so users can re-upload.
    in_progress = {'pending', 'preparing', 'transcribing', 'typesetting',
                   'processing', 'omr_done'}
    with Session(engine) as db:
        stuck = db.exec(select(Score).where(Score.status.in_(in_progress))).all()
        for score in stuck:
            score.status = 'failed'
            score.error_message = 'Verarbeitung unterbrochen (Server-Neustart) — bitte erneut hochladen'
            score.updated_at = datetime.now(timezone.utc)
            db.add(score)
        if stuck:
            db.commit()
            import logging
            logging.getLogger(__name__).warning(
                "Reset %d interrupted score(s) to failed on startup", len(stuck)
            )

app.include_router(scores.router, prefix="/api")
app.include_router(files.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}
