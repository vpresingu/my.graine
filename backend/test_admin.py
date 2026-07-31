"""Tests for DELETE /api/records/{day} and POST /api/admin/reset."""

import os
import tempfile
from pathlib import Path

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete as sqla_delete  # noqa: E402
from sqlmodel import Session  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402
from models import DayRecord  # noqa: E402

SEED_FILE = Path(__file__).resolve().parent / "data" / "migraine_log.json"

SAMPLE = {
    "date": "2026-07-31",
    "weekday": "Friday",
    "wellbeing_1to10": 6,
    "migraine": 0,
    "severity_0to10": 0,
    "phase": "none",
    "aura": 0,
    "symptoms": [],
    "sleep_hours_prev_night": 7.0,
    "stress_1to10": 4,
    "cycle_day": 10,
    "barometric_drop": 0,
    "meds_acute": None,
    "meds_preventive": None,
    "functional_impact_0to3": 0,
    "notes": "",
}


def _wipe():
    with Session(db.engine) as s:
        s.execute(sqla_delete(DayRecord))
        s.commit()


def test_delete_record_and_404():
    with TestClient(main.app) as client:
        day = client.post("/api/records", json=SAMPLE).json()["day"]
        assert client.get(f"/api/records/{day}").status_code == 200

        resp = client.delete(f"/api/records/{day}")
        assert resp.status_code == 200
        assert resp.json() == {"deleted": day}

        assert client.get(f"/api/records/{day}").status_code == 404
        assert client.delete(f"/api/records/{day}").status_code == 404


@pytest.mark.skipif(not SEED_FILE.exists(), reason=f"seed data missing: {SEED_FILE}")
def test_admin_reset_restores_seed():
    with TestClient(main.app) as client:
        # Dirty the DB, then reset.
        client.post("/api/records", json=SAMPLE)
        resp = client.post("/api/admin/reset")
        assert resp.status_code == 200
        rows = resp.json()["rows"]
        assert rows > 0

        records = client.get("/api/records").json()
        assert len(records) == rows
        # Resetting twice is idempotent.
        assert client.post("/api/admin/reset").json()["rows"] == rows
    # Leave the shared per-process test DB empty for other test modules.
    _wipe()
