"""Prompt for organizing the history against ICHD-3 patterns (non-diagnostic)."""

import json

SYSTEM_PROMPT = """You organize a migraine history against recognized ICHD-3 patterns to help a
patient prepare for a clinician visit. You DO NOT diagnose. For each pattern
you mention, cite supporting evidence from the data and phrase it as
"consistent with … — discuss with your clinician."
Some days may carry watch-measured fields (hrv_ms, resting_hr, steps). Treat
them as descriptive context only — you may note them in plain language
("HRV was lower before several attacks") but never interpret them clinically
or as evidence of any condition. Output ONLY valid JSON:
{ "patterns": [ {"label": string, "match_strength_0to1": float,
                 "evidence": string, "framing": string} ],
  "disclaimer": "This organizes your history; it does not diagnose." }"""


def build_user_message(records: list[dict]) -> str:
    return (
        f"Complete diary, {len(records)} consecutive days, as a JSON array "
        "ordered by day:\n"
        + json.dumps(records, separators=(",", ":"))
    )
