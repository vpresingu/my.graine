"""Tests for POST /api/extract.

By default gemma.chat is mocked so these run without Ollama (e.g. in CI).
To run against the real local model, start Ollama (`ollama serve`, with the
gemma4 model pulled) and run:

    MYGRAINE_LIVE_MODEL=1 pytest test_extract.py            (bash)
    $env:MYGRAINE_LIVE_MODEL="1"; pytest test_extract.py    (PowerShell)
"""

import os
import tempfile

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

import json  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import gemma  # noqa: E402
import main  # noqa: E402
from prompts.extract import SHORT_SLEEP_FLAG  # noqa: E402

PRODROME_NOTE = (
    "Only got about 5 hours last night. Woke up yawning and my neck's tight, "
    "feeling kind of foggy and off. No headache yet but I know this feeling."
)

MOCK_PRODROME = json.dumps(
    {
        "wellbeing_1to10": 5,
        "migraine": 0,
        "severity_0to10": 0,
        "phase": "prodrome",
        "aura": 0,
        "symptoms": ["neck_pain"],
        "sleep_hours_prev_night": 5.0,
        "suspected_triggers_mentioned": ["short sleep"],
        "functional_impact_0to3": 0,
        "risk_flags": [SHORT_SLEEP_FLAG],
    }
)


def _mock_chat(response_texts):
    """Return a gemma.chat stand-in that yields each response in turn."""
    responses = list(response_texts)

    def fake_chat(messages, **kwargs):
        return responses.pop(0)

    return fake_chat


def test_extract_prodrome(monkeypatch):
    monkeypatch.setattr(gemma, "chat", _mock_chat([MOCK_PRODROME]))
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "prodrome"
    assert data["migraine"] == 0
    assert SHORT_SLEEP_FLAG in data["risk_flags"]


def test_short_sleep_flag_added_even_if_model_forgets(monkeypatch):
    forgot = json.loads(MOCK_PRODROME)
    forgot["risk_flags"] = []
    monkeypatch.setattr(gemma, "chat", _mock_chat([json.dumps(forgot)]))
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert SHORT_SLEEP_FLAG in resp.json()["risk_flags"]


def test_extract_retries_once_on_bad_json(monkeypatch):
    monkeypatch.setattr(
        gemma, "chat", _mock_chat(["Sure! Here is the record you asked for.", MOCK_PRODROME])
    )
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert resp.status_code == 200
    assert resp.json()["phase"] == "prodrome"


def test_extract_502_when_json_invalid_twice(monkeypatch):
    monkeypatch.setattr(gemma, "chat", _mock_chat(["not json", "still not json"]))
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert resp.status_code == 502


def test_extract_503_when_ollama_down(monkeypatch):
    def raise_down(*args, **kwargs):
        raise gemma.OllamaError("Cannot reach Ollama at http://localhost:11434/api/chat.")

    monkeypatch.setattr(gemma, "chat", raise_down)
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert resp.status_code == 503
    assert "Ollama" in resp.json()["detail"]


@pytest.mark.skipif(
    not os.environ.get("MYGRAINE_LIVE_MODEL"),
    reason="Set MYGRAINE_LIVE_MODEL=1 (with Ollama running) to test the real model",
)
def test_extract_live_model():
    with TestClient(main.app) as client:
        resp = client.post("/api/extract", json={"free_text": PRODROME_NOTE})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["phase"] == "prodrome"
    assert data["migraine"] == 0
    assert SHORT_SLEEP_FLAG in data["risk_flags"]
