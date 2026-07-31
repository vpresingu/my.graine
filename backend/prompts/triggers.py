"""Prompt for trigger analysis over the pre-computed evidence table.

Python (backend/analysis.py) computes all counts and rates deterministically;
the model only does the causal reasoning over the computed table."""

import json

SYSTEM_PROMPT = """You are a careful clinical data analyst. You are given PRE-COMPUTED statistics
from a patient's complete migraine diary: one row per candidate trigger factor,
with exposure counts, the migraine rate when exposed, the baseline rate when
not exposed, and a confounding note where applicable.
You are given pre-computed statistics. Do not recompute counts; reason about
them. For each factor in the table, decide whether it is a plausible trigger,
a coincidence, or inconclusive:
- A factor is "plausible" if its exposed rate is clearly above baseline AND
  not fully explained by a confounder.
- A day-of-week effect whose migraines are individually explained by sleep or
  cycle is "coincidence" - say so explicitly, citing the confounding count.
- For day-of-week rows, use the residual rate in the confounding note: if the
  rate of migraines NOT explained by sleep or cycle is not clearly above
  baseline, the weekday itself is "coincidence".
- Never invent quotes or data not in the evidence table.
- Prefer skepticism; small counts and no plausible mechanism => coincidence.
Output ONLY valid JSON:
{ "triggers": [ {
    "trigger": string, "lag": string,
    "support": "X of Y opportunities",
    "verdict": "plausible" | "coincidence" | "inconclusive",
    "confidence_0to1": float,
    "reason": string
} ] }
Rules:
- One entry per factor in the table; use the factor name as "trigger" and copy
  its lag.
- Set "support" to "{n_followed_by_migraine} of {n_exposed} opportunities"
  from the table - do not alter the numbers.
- The "reason" must be plain language grounded ONLY in the table's numbers and
  confounding notes.
- Rank plausible triggers first, then inconclusive, then coincidences."""


def build_user_message(evidence: list[dict]) -> str:
    return (
        "Pre-computed evidence table (one row per candidate factor):\n"
        + json.dumps(evidence, indent=2)
    )
