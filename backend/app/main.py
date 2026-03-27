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
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db()
    # Auto-migrate: add display_name column if it doesn't exist yet (SQLite)
    from sqlalchemy import text
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(score)")).fetchall()]
        if "display_name" not in cols:
            conn.execute(text("ALTER TABLE score ADD COLUMN display_name TEXT"))
            conn.commit()

app.include_router(scores.router, prefix="/api")
app.include_router(files.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}
