"""Live tests for the three Gemma reasoning endpoints.

These need BOTH a real model and real data, so they are skipped unless:
  1. MYGRAINE_LIVE_MODEL=1 is set (with Ollama running and gemma4 pulled), and
  2. backend/data/migraine_log.json exists (it seeds a throwaway test DB).

Run live (PowerShell):  $env:MYGRAINE_LIVE_MODEL="1"; pytest test_reasoning.py -v
"""

import os
import tempfile
from pathlib import Path

os.environ.setdefault(
    "MYGRAINE_DB_PATH",
    os.path.join(tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"),
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

SEED_FILE = Path(__file__).resolve().parent / "data" / "migraine_log.json"

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("MYGRAINE_LIVE_MODEL"),
        reason="Set MYGRAINE_LIVE_MODEL=1 (with Ollama running) to run live",
    ),
    pytest.mark.skipif(
        not SEED_FILE.exists(),
        reason=f"Seed data missing: {SEED_FILE}",
    ),
]


@pytest.fixture(scope="module")
def seeded_client():
    import main
    import seed

    assert seed.seed() > 0, "seed file present but no rows were loaded"
    with TestClient(main.app) as client:
        yield client


def test_triggers_sleep_plausible_tuesday_coincidence(seeded_client):
    resp = seeded_client.post("/api/triggers")
    assert resp.status_code == 200, resp.text
    triggers = resp.json()["triggers"]
    assert triggers, "model returned no triggers"

    sleep = [t for t in triggers if "sleep" in t["trigger"].lower()]
    assert any(t["verdict"] == "plausible" for t in sleep), (
        f"expected a plausible sleep trigger, got: {triggers}"
    )

    tuesday = [t for t in triggers if "tuesday" in t["trigger"].lower()]
    coincidences = [t for t in tuesday if t["verdict"] == "coincidence"]
    assert coincidences, f"expected Tuesday to be labeled coincidence, got: {triggers}"
    assert any(
        any(k in t["reason"].lower() for k in ("confound", "explain", "sleep", "cycle"))
        for t in coincidences
    ), f"expected the Tuesday reason to mention confounding, got: {coincidences}"


def test_phenotype_returns_patterns_without_diagnosing(seeded_client):
    resp = seeded_client.post("/api/phenotype")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["patterns"], "model returned no patterns"
    assert data["disclaimer"]


def test_progress_responder(seeded_client):
    resp = seeded_client.post("/api/progress", json={})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["responder"] is True, data
