"""SQLite engine setup for My-Graine.

The database is a plain local file under backend/data/ — it never leaves
this device. MYGRAINE_DB_PATH overrides the location (used by tests).
"""

import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = Path(os.environ.get("MYGRAINE_DB_PATH", DATA_DIR / "mygraine.db"))

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


def _migrate() -> None:
    """create_all() never alters existing tables, so columns added to the
    models after a database was created are ALTER TABLE'd in here. Derived
    from the model metadata — adding a column to models.py is enough."""
    with engine.connect() as conn:
        for table in SQLModel.metadata.tables.values():
            existing = {
                row[1]
                for row in conn.exec_driver_sql(f"PRAGMA table_info({table.name})")
            }
            if not existing:  # table doesn't exist yet; create_all handles it
                continue
            for column in table.columns:
                if column.name not in existing:
                    if not column.nullable:
                        raise RuntimeError(
                            f"Cannot auto-add non-nullable column "
                            f"{table.name}.{column.name} to an existing database"
                        )
                    sql_type = column.type.compile(engine.dialect)
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table.name} ADD COLUMN {column.name} {sql_type}"
                    )
        conn.commit()


def init_db() -> None:
    """Create the data directory and all tables if they don't exist."""
    import models  # noqa: F401  (register tables with SQLModel.metadata)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _migrate()
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency yielding a database session."""
    with Session(engine) as session:
        yield session
