"""Tests for the personal symptom vocabulary and adaptive extraction."""

import os
import tempfile

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

import json  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete as sqla_delete  # noqa: E402
from sqlmodel import Session  # noqa: E402

import db  # noqa: E402
import gemma  # noqa: E402
import main  # noqa: E402
from models import UserSymptom  # noqa: E402

EXTRACTION = {
    "wellbeing_1to10": 5,
    "migraine": 1,
    "severity_0to10": 6,
    "phase": "headache",
    "aura": 0,
    "symptoms": ["nausea", "Jaw Tension", "nausea"],
    "sleep_hours_prev_night": 7.0,
    "suspected_triggers_mentioned": [],
    "functional_impact_0to3": 2,
    "risk_flags": [],
}


def _wipe_custom():
    with Session(db.engine) as s:
        s.execute(sqla_delete(UserSymptom))
        s.commit()


def test_symptom_vocabulary_crud():
    with TestClient(main.app) as client:
        base = client.get("/api/symptoms").json()
        assert "yawning" in base["groups"]["prodrome"]
        assert "visual_aura" in base["groups"]["aura"]
        assert base["custom"] == []

        added = client.post("/api/symptoms", json={"name": " Jaw Tension! "}).json()
        assert added["added"] == "jaw_tension"
        assert client.get("/api/symptoms").json()["custom"] == ["jaw_tension"]
        # idempotent; base symptoms are never duplicated into custom
        client.post("/api/symptoms", json={"name": "jaw_tension"})
        client.post("/api/symptoms", json={"name": "nausea"})
        assert client.get("/api/symptoms").json()["custom"] == ["jaw_tension"]

        assert client.delete("/api/symptoms/jaw_tension").status_code == 200
        assert client.delete("/api/symptoms/jaw_tension").status_code == 404
    _wipe_custom()


def test_extract_splits_unknown_symptoms_into_suggestions(monkeypatch):
    monkeypatch.setattr(gemma, "chat", lambda *a, **k: json.dumps(EXTRACTION))
    with TestClient(main.app) as client:
        data = client.post("/api/extract", json={"free_text": "note"}).json()
    assert data["symptoms"] == ["nausea"]  # deduped, known only
    assert data["suggested_new_symptoms"] == ["jaw_tension"]


def test_extract_uses_personal_vocabulary(monkeypatch):
    captured = {}

    def fake_chat(messages, **kwargs):
        captured["system"] = messages[0]["content"]
        return json.dumps(EXTRACTION)

    monkeypatch.setattr(gemma, "chat", fake_chat)
    with TestClient(main.app) as client:
        client.post("/api/symptoms", json={"name": "jaw_tension"})
        data = client.post("/api/extract", json={"free_text": "note"}).json()
    assert '"jaw_tension"' in captured["system"]  # prompt adapted to the user
    assert data["symptoms"] == ["nausea", "jaw_tension"]  # now a known label
    assert data["suggested_new_symptoms"] == []
    _wipe_custom()
