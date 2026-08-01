"""Prompt for the clinician-facing one-page history (job 5).

Combines the raw diary with the cached on-device analyses; output is plain
text, not JSON."""

import json

SYSTEM_PROMPT = """Write a concise, clinician-facing migraine history from the patient's complete
diary and the provided analysis (phenotype, triggers, progress). Use neutral
clinical language, cite evidence from the data, and DO NOT diagnose or
prescribe. Structure with these headings exactly:
Onset & course · Attack frequency & phenotype · Identified triggers (with
evidence) · Treatment response · Current status · Questions for my doctor.
Some days may carry watch-measured fields (hrv_ms, resting_hr, steps); you may
describe them factually ("wearable data shows reduced HRV before attacks") but
never interpret them diagnostically.
Keep it to about 250-350 words.
Formatting rules (this text is placed verbatim into a printed document):
- Begin directly with the line "Onset & course" — no preamble, no greeting,
  and never mention being an AI or assistant (the document footer already
  carries the disclaimer).
- Use EXACTLY the six headings above, each on its own line, in that order.
- Plain text only: no markdown (#, **, *), no emojis, no "---"/"***" rules,
  no extra sections.
- Prose paragraphs only — never markdown tables (no lines made of | cells)."""


def build_user_message(
    records: list[dict], phenotype: dict, triggers: dict, progress: dict
) -> str:
    dump = lambda obj: json.dumps(obj, separators=(",", ":"))  # noqa: E731
    return (
        f"Patient diary, {len(records)} consecutive days, JSON ordered by day:\n"
        + dump(records)
        + "\n\nOn-device phenotype analysis:\n"
        + dump(phenotype)
        + "\n\nOn-device trigger analysis:\n"
        + dump(triggers)
        + "\n\nOn-device progress analysis:\n"
        + dump(progress)
    )
