"""PUT /api/records/{day} — the edit path behind 'edit today's log'."""

import os
import tempfile

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session  # noqa: E402

from db import engine, init_db  # noqa: E402
from main import app  # noqa: E402
from models import DayRecord  # noqa: E402


def test_update_preserves_unsent_fields():
    init_db()
    with Session(engine) as session:
        session.merge(
            DayRecord(
                day=500,
                date="2026-06-30",
                weekday="Tuesday",
                wellbeing_1to10=6,
                migraine=0,
                severity_0to10=0,
                phase="none",
                aura=0,
                symptoms=[],
                sleep_hours_prev_night=7.0,
                stress_1to10=4,
                cycle_day=12,
                barometric_drop=0,
                functional_impact_0to3=0,
                notes="original",
                hrv_ms=44.5,  # imported wearable data must survive edits
            )
        )
        session.commit()

    client = TestClient(app)
    payload = {
            "date": "2026-06-30",
            "weekday": "Tuesday",
            "wellbeing_1to10": 4,
            "migraine": 1,
            "severity_0to10": 6,
            "phase": "headache",
            "aura": 0,
            "symptoms": ["nausea"],
            "sleep_hours_prev_night": 7.0,
            "stress_1to10": 8,
            "cycle_day": 12,
            "barometric_drop": 0,
        "functional_impact_0to3": 2,
        "notes": "edited: it was actually a migraine day",
    }
    resp = client.put("/api/records/500", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["migraine"] == 1
    assert body["severity_0to10"] == 6

    with Session(engine) as session:
        rec = session.get(DayRecord, 500)
        assert rec.notes.startswith("edited")
        assert rec.stress_1to10 == 8
        assert rec.hrv_ms == 44.5  # untouched by the edit payload

    assert client.put("/api/records/9999", json=payload).status_code == 404
