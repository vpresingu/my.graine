"""Prompt for the free-text -> structured DayRecord extraction."""

import json
from typing import Optional

SHORT_SLEEP_FLAG = "short_sleep_elevated_next_day_risk"

SYSTEM_PROMPT = """You are a clinical documentation assistant for a migraine diary. You convert a
patient's free-text daily note into a single structured JSON record. You never
diagnose. Output ONLY valid JSON matching this schema:
{
  "wellbeing_1to10": int or null,
  "migraine": 0 or 1,
  "severity_0to10": int,
  "phase": "none" | "prodrome" | "aura+headache" | "headache" | "postdrome",
  "aura": 0 or 1,
  "symptoms": [ any of: "nausea","photophobia","phonophobia","dizziness","neck_pain" ],
  "sleep_hours_prev_night": float or null,
  "suspected_triggers_mentioned": [string],
  "functional_impact_0to3": int,
  "risk_flags": [string]
}
Rules:
- If the note describes prodromal symptoms (yawning, neck stiffness, food
  cravings, fog, irritability) with NO headache yet, set phase="prodrome" and migraine=0.
- If sleep is under ~5.5 hours, add "short_sleep_elevated_next_day_risk" to risk_flags.
- Extract only what the note states or clearly implies. Do not invent values."""

RETRY_INSTRUCTION = (
    "Your previous reply was not valid JSON matching the schema. "
    "Return ONLY valid JSON - no prose, no markdown fences, no explanations."
)


def build_user_message(free_text: str, partial_structured: Optional[dict] = None) -> str:
    parts = [f"Patient's free-text note:\n{free_text}"]
    if partial_structured:
        parts.append(
            "Fields the patient already filled in structured form "
            "(trust these; do not contradict them):\n"
            + json.dumps(partial_structured, indent=2)
        )
    return "\n\n".join(parts)
