"""Local speech-to-text for voice journaling.

Runs OpenAI's open-source Whisper weights on this machine via faster-whisper
(CPU, int8). Like gemma.py, this is on-device only: after the one-time model
download (pre-fetch with `python transcribe.py`), no network is involved.

The browser records mic audio (webm/opus from MediaRecorder); faster-whisper
decodes it directly, so no ffmpeg install is needed.
"""

import os
import threading
from io import BytesIO

# English-only base model: ~145MB, transcribes a 30s note in a few seconds on
# CPU. Override with e.g. MYGRAINE_WHISPER_MODEL=small for better accuracy.
MODEL_NAME = os.environ.get("MYGRAINE_WHISPER_MODEL", "base.en")

_model = None
_model_lock = threading.Lock()


class TranscribeError(RuntimeError):
    pass


def _get_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        return _model


def transcribe(audio: bytes) -> str:
    """Audio bytes (webm/ogg/wav/mp4) -> plain transcript text."""
    if not audio:
        raise TranscribeError("Empty recording.")
    try:
        segments, _info = _get_model().transcribe(
            BytesIO(audio), language="en", vad_filter=True
        )
        return " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as exc:
        raise TranscribeError(f"Could not transcribe the recording: {exc}") from exc


if __name__ == "__main__":
    # Pre-download the model so demo day needs no network.
    _get_model()
    print(f"Whisper model '{MODEL_NAME}' is downloaded and ready.")
