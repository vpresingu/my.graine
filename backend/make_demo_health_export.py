"""Generate a realistic Apple Health export.zip for demo rehearsal.

Builds backend/data/demo_health_export.zip from data/migraine_log.json so the
watch-import demo works without a real Apple Watch on stage: sleep sessions
match the diary, and the autonomic signals carry the pattern the research
describes — HRV dips and resting HR rises on the day *before* a migraine.

Deterministic (fixed RNG seed) so rehearsals look the same every run.
The importer treats this file exactly like a real export; nothing is faked
downstream of the XML.

Usage: python make_demo_health_export.py
"""

import json
import random
import zipfile
from datetime import datetime, timedelta
from xml.sax.saxutils import quoteattr

from db import DATA_DIR

SEED_FILE = DATA_DIR / "migraine_log.json"
OUT_FILE = DATA_DIR / "demo_health_export.zip"

HRV_BASELINE = 46.0  # ms, typical adult SDNN
RHR_BASELINE = 58.0  # bpm
STEPS_BASELINE = 8500

rng = random.Random(20260503)


def _record(rtype: str, unit: str, value, start: str, end: str) -> str:
    attrs = {
        "type": rtype,
        "sourceName": "Demo Watch",
        "unit": unit,
        "value": str(value),
        "startDate": start,
        "endDate": end,
        "creationDate": end,
    }
    inner = " ".join(f"{k}={quoteattr(v)}" for k, v in attrs.items())
    return f"  <Record {inner}/>\n"


def _stamp(date: str, hour: int, minute: int) -> str:
    return f"{date} {hour:02d}:{minute:02d}:00 -0500"


def build_xml(rows: list[dict]) -> str:
    next_day_migraine = {
        r["day"]: any(n["day"] == r["day"] + 1 and n["migraine"] for n in rows)
        for r in rows
    }
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        '<HealthData locale="en_US">\n',
        '  <ExportDate value="2026-08-01 09:00:00 -0500"/>\n',
    ]

    for row in rows:
        date = row["date"]
        prodrome_tomorrow = next_day_migraine[row["day"]]

        # Sleep: one session ending this morning, matching the diary's
        # sleep_hours_prev_night so the imported values line up on stage.
        hours = row["sleep_hours_prev_night"]
        wake = datetime.strptime(date, "%Y-%m-%d").replace(
            hour=7, minute=rng.randint(0, 40)
        )
        fell_asleep = wake - timedelta(hours=hours)
        parts.append(
            _record(
                "HKCategoryTypeIdentifierSleepAnalysis",
                "",
                "HKCategoryValueSleepAnalysisAsleepUnspecified",
                fell_asleep.strftime("%Y-%m-%d %H:%M:%S -0500"),
                wake.strftime("%Y-%m-%d %H:%M:%S -0500"),
            )
        )

        # HRV: several readings a day; usually a clear dip the day before a
        # migraine, a milder one on the migraine day itself. Deliberately
        # imperfect — some attacks arrive without a warning dip and some dips
        # lead nowhere, so the stats look like physiology, not a script.
        if prodrome_tomorrow and rng.random() < 0.78:
            day_mean = HRV_BASELINE * rng.uniform(0.62, 0.78)
        elif row["migraine"]:
            day_mean = HRV_BASELINE * rng.uniform(0.78, 0.95)
        elif not prodrome_tomorrow and rng.random() < 0.07:
            day_mean = HRV_BASELINE * rng.uniform(0.70, 0.82)  # dip, no migraine
        else:
            day_mean = HRV_BASELINE * rng.uniform(0.92, 1.12)
        for _ in range(rng.randint(2, 4)):
            reading = max(12.0, rng.gauss(day_mean, 2.5))
            h, m = rng.randint(6, 22), rng.randint(0, 59)
            parts.append(
                _record(
                    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
                    "ms",
                    round(reading, 1),
                    _stamp(date, h, m),
                    _stamp(date, h, m),
                )
            )

        # Resting HR: one value a day, elevated before/during attacks.
        if prodrome_tomorrow:
            rhr = RHR_BASELINE + rng.uniform(4.0, 7.0)
        elif row["migraine"]:
            rhr = RHR_BASELINE + rng.uniform(2.0, 5.0)
        else:
            rhr = RHR_BASELINE + rng.uniform(-2.5, 2.5)
        parts.append(
            _record(
                "HKQuantityTypeIdentifierRestingHeartRate",
                "count/min",
                round(rhr, 0),
                _stamp(date, 6, 30),
                _stamp(date, 6, 30),
            )
        )

        # Steps: hourly chunks; severe days collapse toward the couch.
        activity = 1.0 - 0.25 * row["functional_impact_0to3"]
        total = max(900, rng.gauss(STEPS_BASELINE * activity, 900))
        remaining = total
        for h in range(8, 21, 2):
            chunk = remaining * rng.uniform(0.1, 0.25)
            remaining -= chunk
            parts.append(
                _record(
                    "HKQuantityTypeIdentifierStepCount",
                    "count",
                    int(chunk),
                    _stamp(date, h, 0),
                    _stamp(date, h, 55),
                )
            )

    parts.append("</HealthData>\n")
    return "".join(parts)


def main() -> None:
    rows = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    xml = build_xml(rows)
    with zipfile.ZipFile(OUT_FILE, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("apple_health_export/export.xml", xml)
    print(f"Wrote {OUT_FILE} ({len(rows)} days, {OUT_FILE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
