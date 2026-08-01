"""Prompt for the free-text -> structured DayRecord extraction."""

import json
from typing import Optional

SHORT_SLEEP_FLAG = "short_sleep_elevated_next_day_risk"

# __SYMPTOM_LIST__ is substituted per request with the user's personal
# vocabulary (base clinical set + labels they've added), so extraction adapts
# to each user. Substituted via replace(), not format() — the JSON braces
# would break format().
_SYSTEM_TEMPLATE = """You are a clinical documentation assistant for a migraine diary. You convert a
patient's free-text daily note into a single structured JSON record. You never
diagnose. Output ONLY valid JSON matching this schema:
{
  "wellbeing_1to10": int or null,
  "migraine": 0 or 1,
  "severity_0to10": int,
  "phase": "none" | "prodrome" | "aura+headache" | "headache" | "postdrome",
  "aura": 0 or 1,
  "symptoms": [ any of: __SYMPTOM_LIST__ ],
  "sleep_hours_prev_night": float or null,
  "stress_1to10": int or null,
  "meds_acute": string or null,
  "meds_preventive": string or null,
  "suspected_triggers_mentioned": [string],
  "functional_impact_0to3": int,
  "risk_flags": [string]
}
Rules:
- sleep_hours_prev_night, stress_1to10, meds_acute and meds_preventive are
  null unless the note actually mentions them. Never guess a default.
- meds_acute is medication taken for an attack (e.g. "sumatriptan 50mg", even
  if the name is garbled by speech-to-text); meds_preventive is a daily
  preventive. Include the dose when stated.
- If the note describes prodromal symptoms (yawning, neck stiffness, food
  cravings, fog, irritability) with NO headache yet, set phase="prodrome" and migraine=0.
- If sleep is under ~5.5 hours, add "__SHORT_SLEEP_FLAG__" to risk_flags.
- risk_flags may ONLY contain "__SHORT_SLEEP_FLAG__" or be empty. Never
  invent other flags.
- Prefer the listed symptom labels. If the note clearly describes a symptom
  none of them covers, you may add one new snake_case label for it.
- Extract only what the note states or clearly implies. Do not invent values."""


def build_system_prompt(allowed_symptoms: list[str]) -> str:
    symptom_list = ",".join(f'"{s}"' for s in allowed_symptoms)
    return _SYSTEM_TEMPLATE.replace("__SYMPTOM_LIST__", symptom_list).replace(
        "__SHORT_SLEEP_FLAG__", SHORT_SLEEP_FLAG
    )

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
