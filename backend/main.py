"""My-Graine backend — local-only FastAPI app.

Serves the API under /api and, when a production build exists, the built
frontend from frontend/dist. Listens on localhost only; never talks to
anything beyond this device.
"""

import hashlib
import json
import re
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from sqlalchemy import delete as sqla_delete
from sqlmodel import Session, func, select

import analysis
import gemma
import seed as seed_module
from db import get_session, init_db
from models import (
    BASE_SYMPTOMS,
    SYMPTOM_GROUPS,
    DayRecord,
    ExtractionResult,
    PhenotypeResult,
    ProgressResult,
    TriggersResult,
    UserSymptom,
    normalize_symptom,
)
from prompts import extract as extract_prompt
from prompts import history as history_prompt
from prompts import phenotype as phenotype_prompt
from prompts import progress as progress_prompt
from prompts import triggers as triggers_prompt
from prompts.extract import RETRY_INSTRUCTION, SHORT_SLEEP_FLAG

# Context window for full-timeline reasoning calls; the whole diary is sent
# in one prompt by design — never summarized or chunked.
TIMELINE_NUM_CTX = 16384
TIMELINE_TIMEOUT = 300.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="My-Graine",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/records")
def list_records(session: Session = Depends(get_session)) -> list[DayRecord]:
    return session.exec(select(DayRecord).order_by(DayRecord.day)).all()


@app.get("/api/records/{day}")
def get_record(day: int, session: Session = Depends(get_session)) -> DayRecord:
    record = session.get(DayRecord, day)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No record for day {day}")
    return record


@app.post("/api/records")
def create_record(
    record: DayRecord, session: Session = Depends(get_session)
) -> DayRecord:
    if record.day is None:
        max_day = session.exec(select(func.max(DayRecord.day))).one()
        record.day = (max_day or 0) + 1
    elif session.get(DayRecord, record.day) is not None:
        raise HTTPException(
            status_code=409, detail=f"Day {record.day} already exists"
        )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@app.delete("/api/records/{day}")
def delete_record(day: int, session: Session = Depends(get_session)) -> dict:
    record = session.get(DayRecord, day)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No record for day {day}")
    session.delete(record)
    session.commit()
    _MODEL_CACHE.clear()  # timeline changed; model results are stale
    return {"deleted": day}


@app.post("/api/admin/reset")
def admin_reset(session: Session = Depends(get_session)) -> dict:
    """Demo-rehearsal helper: wipe the database and restore the original
    seeded state from backend/data/migraine_log.json. Local-only."""
    if not seed_module.SEED_FILE.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Seed file missing: {seed_module.SEED_FILE} — cannot reset.",
        )
    session.execute(sqla_delete(DayRecord))
    session.commit()
    rows = seed_module.seed()
    _MODEL_CACHE.clear()
    return {"rows": rows}


@app.get("/api/stats")
def stats(session: Session = Depends(get_session)) -> dict:
    records = session.exec(select(DayRecord).order_by(DayRecord.day)).all()
    total = len(records)
    date_span: Optional[dict] = (
        {"start": records[0].date, "end": records[-1].date} if records else None
    )
    last_28 = records[-28:]
    return {
        "total_days": total,
        "migraine_days": sum(r.migraine for r in records),
        "date_span": date_span,
        "last_28_days": {
            "recorded_days": len(last_28),
            "migraine_days": sum(r.migraine for r in last_28),
        },
    }


class ExtractRequest(BaseModel):
    free_text: str
    partial_structured: Optional[dict] = None


class ProgressRequest(BaseModel):
    change_point_day: Optional[int] = None


def _parse_json_as(raw: str, model_cls):
    # Strip markdown fences the model sometimes wraps JSON in.
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    return model_cls.model_validate(json.loads(text))


def _gemma_json(messages: list[dict], model_cls, num_ctx=None, timeout=gemma.DEFAULT_TIMEOUT):
    """Call the local model in JSON mode and validate; re-prompt once on bad
    JSON, 502 on repeated failure, 503 if Ollama is down. Never remote."""
    kwargs = dict(format="json", temperature=0.2, num_ctx=num_ctx, timeout=timeout)
    try:
        raw = gemma.chat(messages, **kwargs)
        try:
            return _parse_json_as(raw, model_cls)
        except (json.JSONDecodeError, ValidationError):
            retry = messages + [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": RETRY_INSTRUCTION},
            ]
            raw = gemma.chat(retry, **kwargs)
            try:
                return _parse_json_as(raw, model_cls)
            except (json.JSONDecodeError, ValidationError):
                raise HTTPException(
                    status_code=502,
                    detail="The local model returned invalid JSON twice. "
                    "Try again or check the model with: ollama run gemma4",
                )
    except gemma.OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# In-memory cache for the expensive model calls (triggers/phenotype/progress —
# extend to /api/history when it exists). Keyed by endpoint (+ params) and
# invalidated automatically when the records change, via a fingerprint of the
# full timeline. Memory only: no disk, no network. Force with ?refresh=1.
_MODEL_CACHE: dict[str, tuple[str, object]] = {}
# Per-key locks: concurrent identical requests (e.g. React StrictMode firing
# effects twice in dev) share one model run instead of both hitting Ollama.
_CACHE_LOCKS: dict[str, threading.Lock] = {}
_CACHE_LOCKS_GUARD = threading.Lock()


def _cached_model_call(key: str, timeline: list[dict], refresh: bool, compute):
    fingerprint = hashlib.md5(
        json.dumps(timeline, sort_keys=True, default=str).encode()
    ).hexdigest()
    with _CACHE_LOCKS_GUARD:
        lock = _CACHE_LOCKS.setdefault(key, threading.Lock())
    with lock:
        cached = _MODEL_CACHE.get(key)
        if not refresh and cached is not None and cached[0] == fingerprint:
            return cached[1]
        result = compute()  # HTTPExceptions propagate; errors are never cached
        _MODEL_CACHE[key] = (fingerprint, result)
        return result


def _load_timeline(session: Session) -> list[dict]:
    """Full record set as plain dicts, ordered by day — sent to the model
    whole, never summarized or chunked."""
    records = session.exec(select(DayRecord).order_by(DayRecord.day)).all()
    if not records:
        raise HTTPException(
            status_code=400,
            detail="No records in the database. Add data first (python seed.py).",
        )
    return [r.model_dump() for r in records]


class SymptomRequest(BaseModel):
    name: str


def _custom_symptoms(session: Session) -> list[str]:
    return [
        s.name
        for s in session.exec(select(UserSymptom).order_by(UserSymptom.name)).all()
    ]


@app.get("/api/symptoms")
def list_symptoms(session: Session = Depends(get_session)) -> dict:
    """The user's symptom vocabulary: the clinical base set (grouped by
    phase) plus their own added labels."""
    return {"groups": SYMPTOM_GROUPS, "custom": _custom_symptoms(session)}


@app.post("/api/symptoms")
def add_symptom(req: SymptomRequest, session: Session = Depends(get_session)) -> dict:
    name = normalize_symptom(req.name)
    if not name:
        raise HTTPException(status_code=422, detail="Symptom name is empty")
    if name not in BASE_SYMPTOMS and session.get(UserSymptom, name) is None:
        session.add(UserSymptom(name=name))
        session.commit()
    return {"added": name, "custom": _custom_symptoms(session)}


@app.delete("/api/symptoms/{name}")
def delete_symptom(name: str, session: Session = Depends(get_session)) -> dict:
    record = session.get(UserSymptom, normalize_symptom(name))
    if record is None:
        raise HTTPException(status_code=404, detail=f"No custom symptom {name!r}")
    session.delete(record)
    session.commit()
    return {"deleted": record.name, "custom": _custom_symptoms(session)}


@app.post("/api/extract")
def extract(
    req: ExtractRequest, session: Session = Depends(get_session)
) -> ExtractionResult:
    # The prompt adapts to this user: their custom labels extend the schema.
    allowed = BASE_SYMPTOMS | set(_custom_symptoms(session))
    messages = [
        {"role": "system", "content": extract_prompt.build_system_prompt(sorted(allowed))},
        {
            "role": "user",
            "content": extract_prompt.build_user_message(
                req.free_text, req.partial_structured
            ),
        },
    ]
    result = _gemma_json(messages, ExtractionResult)

    # Split the model's labels: known ones stay; clearly-described new ones
    # become suggestions the user can adopt into their vocabulary.
    known, suggested = [], []
    for raw in result.symptoms:
        name = normalize_symptom(raw)
        if not name:
            continue
        (known if name in allowed else suggested).append(name)
    result.symptoms = list(dict.fromkeys(known))
    result.suggested_new_symptoms = list(dict.fromkeys(suggested))

    # Deterministic backstop for the short-sleep rule, independent of the model.
    if (
        result.sleep_hours_prev_night is not None
        and result.sleep_hours_prev_night < 5.5
        and SHORT_SLEEP_FLAG not in result.risk_flags
    ):
        result.risk_flags.append(SHORT_SLEEP_FLAG)
    return result


@app.get("/api/triggers/evidence")
def triggers_evidence(session: Session = Depends(get_session)) -> dict:
    """The deterministic evidence table /api/triggers reasons over — exposed
    for inspection so the numbers can be verified independently of the model."""
    return {"evidence": analysis.compute_evidence(_load_timeline(session))}


@app.post("/api/triggers")
def analyze_triggers(
    refresh: bool = False, session: Session = Depends(get_session)
) -> TriggersResult:
    timeline = _load_timeline(session)

    def compute():
        evidence = analysis.compute_evidence(timeline)
        messages = [
            {"role": "system", "content": triggers_prompt.SYSTEM_PROMPT},
            {"role": "user", "content": triggers_prompt.build_user_message(evidence)},
        ]
        # num_ctx: Ollama's default window truncates the ~2.5k-token JSON reply.
        result = _gemma_json(
            messages, TriggersResult, num_ctx=8192, timeout=TIMELINE_TIMEOUT
        )
        # Deterministic backstop for the ranking rule.
        rank = {"plausible": 0, "inconclusive": 1, "coincidence": 2}
        result.triggers.sort(key=lambda t: (rank[t.verdict], -t.confidence_0to1))
        return result

    return _cached_model_call("triggers", timeline, refresh, compute)


@app.post("/api/phenotype")
def analyze_phenotype(
    refresh: bool = False, session: Session = Depends(get_session)
) -> PhenotypeResult:
    timeline = _load_timeline(session)

    def compute():
        messages = [
            {"role": "system", "content": phenotype_prompt.SYSTEM_PROMPT},
            {"role": "user", "content": phenotype_prompt.build_user_message(timeline)},
        ]
        return _gemma_json(
            messages, PhenotypeResult, num_ctx=TIMELINE_NUM_CTX, timeout=TIMELINE_TIMEOUT
        )

    return _cached_model_call("phenotype", timeline, refresh, compute)


@app.post("/api/progress")
def analyze_progress(
    req: Optional[ProgressRequest] = None,
    refresh: bool = False,
    session: Session = Depends(get_session),
) -> ProgressResult:
    timeline = _load_timeline(session)

    change_point = req.change_point_day if req else None
    if change_point is not None:
        reason = "provided by the user"
    else:
        change_point = next(
            (r["day"] for r in timeline if r["meds_preventive"]), None
        )
        if change_point is not None:
            reason = "first day a preventive medication appears in the diary"
        else:
            change_point = timeline[len(timeline) // 2]["day"]
            reason = "no preventive medication found; midpoint of the diary"

    def compute():
        messages = [
            {"role": "system", "content": progress_prompt.SYSTEM_PROMPT},
            {
                "role": "user",
                "content": progress_prompt.build_user_message(
                    timeline, change_point, reason
                ),
            },
        ]
        return _gemma_json(
            messages, ProgressResult, num_ctx=TIMELINE_NUM_CTX, timeout=TIMELINE_TIMEOUT
        )

    return _cached_model_call(f"progress:{change_point}", timeline, refresh, compute)


@app.post("/api/history")
def patient_history(
    refresh: bool = False, session: Session = Depends(get_session)
) -> dict:
    """Clinician-facing one-pager from the diary plus the (cached) phenotype,
    trigger, and progress analyses. Plain text; cached like the others."""
    timeline = _load_timeline(session)

    def compute():
        # These reuse their own caches; only cold ones actually hit the model.
        triggers = analyze_triggers(session=session)
        phenotype = analyze_phenotype(session=session)
        progress = analyze_progress(session=session)
        messages = [
            {"role": "system", "content": history_prompt.SYSTEM_PROMPT},
            {
                "role": "user",
                "content": history_prompt.build_user_message(
                    timeline,
                    phenotype.model_dump(),
                    triggers.model_dump(),
                    progress.model_dump(),
                ),
            },
        ]
        try:
            text = gemma.chat(
                messages,
                temperature=0.2,
                num_ctx=TIMELINE_NUM_CTX,
                timeout=TIMELINE_TIMEOUT,
            )
        except gemma.OllamaError as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        if not text.strip():
            raise HTTPException(
                status_code=502, detail="The local model returned an empty history."
            )
        return {"history": text.strip(), "days": len(timeline)}

    return _cached_model_call("history", timeline, refresh, compute)


# In production the built frontend is served by this app. Mounted last so it
# never shadows /api routes; in dev the Vite server handles the UI instead.
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")

