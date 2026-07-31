"""SQLite engine setup for My-Graine.

The database is a plain local file under backend/data/ — it never leaves
this device. MYGRAINE_DB_PATH overrides the location (used by tests).
"""

# TODO: encrypt at rest

import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = Path(os.environ.get("MYGRAINE_DB_PATH", DATA_DIR / "mygraine.db"))

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create the data directory and all tables if they don't exist."""
    import models  # noqa: F401  (register tables with SQLModel.metadata)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency yielding a database session."""
    with Session(engine) as session:
        yield session
