"""Seed the database from backend/data/migraine_log.json.

Idempotent: rows are upserted by their `day` primary key, so running this
twice (or after adding new rows to the JSON) is safe.
"""

import json
import sys

from sqlmodel import Session

from db import DATA_DIR, engine, init_db
from models import DayRecord

SEED_FILE = DATA_DIR / "migraine_log.json"


def seed() -> int:
    """Upsert all rows from the seed file. Returns the number of rows seeded."""
    init_db()

    if not SEED_FILE.exists():
        print(f"Seed file not found: {SEED_FILE}")
        print("Nothing seeded - the app will run with an empty database.")
        print(f"Add migraine_log.json to {DATA_DIR} and rerun: python seed.py")
        return 0

    try:
        rows = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Seed file is not valid JSON ({SEED_FILE}): {exc}")
        return 0

    with Session(engine) as session:
        for row in rows:
            session.merge(DayRecord(**row))
        session.commit()

    print(f"Seeded {len(rows)} rows from {SEED_FILE.name} into {engine.url.database}")
    return len(rows)


if __name__ == "__main__":
    sys.exit(0 if seed() >= 0 else 1)
