"""Database models for My-Graine."""

from typing import Literal, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

ALLOWED_SYMPTOMS = {"nausea", "photophobia", "phonophobia", "dizziness", "neck_pain"}


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
    suspected_triggers_mentioned: list[str] = []
    functional_impact_0to3: int
    risk_flags: list[str] = []

    @field_validator("symptoms", mode="before")
    @classmethod
    def keep_known_symptoms(cls, v):
        # The model occasionally invents symptom labels; drop them instead of
        # failing the whole extraction.
        if isinstance(v, list):
            return [s for s in v if s in ALLOWED_SYMPTOMS]
        return v


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
