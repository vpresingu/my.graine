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
Keep it to about 250-350 words. Output plain text with those headings."""


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
