"""Database models for My-Graine."""

import re
from typing import Literal, Optional

from pydantic import BaseModel
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

# Clinically grounded base vocabulary (ICHD-3 criteria + phase model),
# grouped for the UI. Users extend it with their own labels (UserSymptom).
SYMPTOM_GROUPS = {
    "prodrome": ["yawning", "brain_fog", "fatigue", "food_cravings", "irritability"],
    "aura": ["visual_aura", "sensory_aura", "speech_difficulty"],
    "attack": [
        "nausea",
        "vomiting",
        "photophobia",
        "phonophobia",
        "dizziness",
        "neck_pain",
        "throbbing_pain",
        "one_sided_pain",
        "worse_with_movement",
        "osmophobia",
        "allodynia",
    ],
}
BASE_SYMPTOMS = {s for group in SYMPTOM_GROUPS.values() for s in group}


def normalize_symptom(name: str) -> str:
    """Canonical snake_case form so 'Brain fog', 'brain-fog' and 'brain_fog'
    are the same symptom."""
    return re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")


class UserSymptom(SQLModel, table=True):
    """A symptom label this user added to their personal vocabulary."""

    name: str = Field(primary_key=True)


class DayRecord(SQLModel, table=True):
    """One journaled day. `day` is a 1-based running day number."""

    day: Optional[int] = Field(default=None, primary_key=True)
    date: str  # ISO date, e.g. "2026-07-31"
    weekday: str
    wellbeing_1to10: int
    migraine: int  # 0/1
    severity_0to10: int
    phase: str  # none | prodrome | aura+headache | headache | postdrome
    aura: int  # 0/1
    symptoms: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    sleep_hours_prev_night: float
    stress_1to10: int
    cycle_day: int
    barometric_drop: int  # 0/1
    meds_acute: Optional[str] = None
    meds_preventive: Optional[str] = None
    functional_impact_0to3: int
    notes: str = ""
    # Objective signals imported from a wearable (Apple Health export etc.).
    # Null on days the import didn't cover; never required for manual logging.
    hrv_ms: Optional[float] = None  # daily mean HRV (SDNN)
    resting_hr: Optional[float] = None  # daily resting heart rate, bpm
    steps: Optional[int] = None  # daily step count


class ExtractionResult(BaseModel):
    """Validated shape of the model's free-text extraction (DayRecord-shaped
    plus risk_flags). This is what POST /api/extract returns."""

    wellbeing_1to10: Optional[int] = None
    migraine: int
    severity_0to10: int
    phase: Literal["none", "prodrome", "aura+headache", "headache", "postdrome"]
    aura: int
    symptoms: list[str] = []
    sleep_hours_prev_night: Optional[float] = None
    # Null means "the note didn't say" — the voice-first log uses these nulls
    # to ask targeted follow-up questions instead of showing the whole form.
    stress_1to10: Optional[int] = None
    meds_acute: Optional[str] = None
    meds_preventive: Optional[str] = None
    suspected_triggers_mentioned: list[str] = []
    functional_impact_0to3: int
    risk_flags: list[str] = []
    # Labels the model found in the note that aren't in the user's vocabulary
    # yet — offered in the UI as "add to your symptoms?" (filled in by the
    # endpoint, not the model).
    suggested_new_symptoms: list[str] = []


class TriggerFinding(BaseModel):
    trigger: str
    lag: str
    support: str
    verdict: Literal["plausible", "coincidence", "inconclusive"]
    confidence_0to1: float
    reason: str


class TriggersResult(BaseModel):
    triggers: list[TriggerFinding]


class PhenotypePattern(BaseModel):
    label: str
    match_strength_0to1: float
    evidence: str
    framing: str


class PhenotypeResult(BaseModel):
    patterns: list[PhenotypePattern]
    disclaimer: str = "This organizes your history; it does not diagnose."


class ProgressResult(BaseModel):
    change_point_day: int
    migraine_days_before: int
    migraine_days_after: int
    pct_change: float
    severity_trend: str
    responder: bool
    summary: str
    caveats: str
