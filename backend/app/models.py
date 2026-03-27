from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime, timezone
import uuid

class ScoreBase(SQLModel):
    filename: str
    original_filename: str
    display_name: Optional[str] = None  # user-editable label; falls back to original_filename

class Score(ScoreBase, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    status: str = Field(default="pending")  # pending, processing, omr_done, omr_failed, ready, failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    error_message: Optional[str] = None
    parts: List["Part"] = Relationship(back_populates="score")

class Part(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    score_id: str = Field(foreign_key="score.id")
    name: str          # instrument/part name from MusicXML
    midi_filename: str # e.g. "Violin.mid"
    score: Optional[Score] = Relationship(back_populates="parts")

class ScoreRead(ScoreBase):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None

class ScoreRename(SQLModel):
    display_name: str

class PartRead(SQLModel):
    id: str
    name: str
    midi_filename: str

class ScoreDetail(ScoreRead):
    parts: List[PartRead] = []
