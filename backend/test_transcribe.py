"""Transcription endpoint tests. The Whisper model itself is mocked so these
run fast and without the model download (e.g. in CI)."""

import os
import tempfile

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

from fastapi.testclient import TestClient  # noqa: E402

import transcribe as transcribe_module  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def test_transcribe_returns_text(monkeypatch):
    monkeypatch.setattr(
        transcribe_module, "transcribe", lambda audio: "Woke up with a headache."
    )
    resp = client.post(
        "/api/transcribe", files={"file": ("note.webm", b"fake-audio", "audio/webm")}
    )
    assert resp.status_code == 200
    assert resp.json() == {"text": "Woke up with a headache."}


def test_transcribe_silence_is_422(monkeypatch):
    monkeypatch.setattr(transcribe_module, "transcribe", lambda audio: "")
    resp = client.post(
        "/api/transcribe", files={"file": ("note.webm", b"fake-audio", "audio/webm")}
    )
    assert resp.status_code == 422


def test_transcribe_error_is_422(monkeypatch):
    def boom(audio):
        raise transcribe_module.TranscribeError("Could not transcribe the recording.")

    monkeypatch.setattr(transcribe_module, "transcribe", boom)
    resp = client.post(
        "/api/transcribe", files={"file": ("note.webm", b"junk", "audio/webm")}
    )
    assert resp.status_code == 422
