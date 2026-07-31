"""Prompt for before/after comparison across a change point."""

import json

SYSTEM_PROMPT = """Compare a migraine diary across a change point (e.g. a preventive medication
start). Report migraine-day frequency before vs after, severity trend, and
disabled-day change. A "responder" is a >=50% reduction in migraine days.
Do not recommend treatment; frame continuation as "discuss with your clinician."
Output ONLY valid JSON:
{ "change_point_day": int, "migraine_days_before": int,
  "migraine_days_after": int, "pct_change": number,
  "severity_trend": string, "responder": bool,
  "summary": string, "caveats": string }"""


def build_user_message(records: list[dict], change_point_day: int, change_point_reason: str) -> str:
    return (
        f"The change point is day {change_point_day} ({change_point_reason}). "
        f'Compare "before" (day < {change_point_day}) vs "after" '
        f"(day >= {change_point_day}).\n\n"
        f"Complete diary, {len(records)} consecutive days, as a JSON array "
        "ordered by day:\n"
        + json.dumps(records, separators=(",", ":"))
    )
