"""Apple Health export parser — the wearable bridge that keeps My-Graine
fully offline.

The Health app's "Export All Health Data" produces export.zip containing
export.xml. The user drops that file on the app; this module stream-parses it
(the XML is routinely hundreds of MB, so iterparse + element clearing, never a
DOM load) and aggregates the migraine-relevant signals per calendar day:

- sleep_hours:  HKCategoryTypeIdentifierSleepAnalysis "Asleep*" intervals,
                summed per night and attributed to the wake-up date — matching
                the diary's sleep_hours_prev_night semantics.
- hrv_ms:       HKQuantityTypeIdentifierHeartRateVariabilitySDNN, daily mean.
- resting_hr:   HKQuantityTypeIdentifierRestingHeartRate, daily mean.
- steps:        HKQuantityTypeIdentifierStepCount, summed per day.

Phone and watch both record sleep and steps; summing across sources would
double-count. Totals are kept per (day, source) and the largest source wins.

Everything happens in-process on this device. Nothing is uploaded anywhere.
"""

import zipfile
from collections import defaultdict
from datetime import datetime, timedelta
from io import BytesIO
from xml.etree.ElementTree import iterparse

SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis"
HRV_TYPE = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
RHR_TYPE = "HKQuantityTypeIdentifierRestingHeartRate"
STEPS_TYPE = "HKQuantityTypeIdentifierStepCount"
RELEVANT_TYPES = {SLEEP_TYPE, HRV_TYPE, RHR_TYPE, STEPS_TYPE}


class HealthImportError(ValueError):
    """The uploaded file isn't a readable Apple Health export."""


def _local_date(stamp: str) -> str:
    """Apple stamps records like '2026-07-31 23:04:00 -0500' — the datetime
    part is already device-local, so the date is just the first 10 chars."""
    return stamp[:10]


def _wake_date(end_stamp: str) -> str:
    """The diary date a sleep segment belongs to. Real exports chop one night
    into many stage segments, and the ones ending before midnight would land
    on the bedtime date — so a segment counts toward the date 12h after it
    ends: evening segments roll to the next morning, morning ones stay."""
    end = datetime.strptime(end_stamp[:19], "%Y-%m-%d %H:%M:%S")
    return (end + timedelta(hours=12)).strftime("%Y-%m-%d")


def _interval_hours(start: str, end: str) -> float:
    """Duration in hours between two Apple-format stamps, ignoring the UTC
    offset (both ends of one sleep session carry the same device offset)."""
    fmt = "%Y-%m-%d %H:%M:%S"
    delta = datetime.strptime(end[:19], fmt) - datetime.strptime(start[:19], fmt)
    return delta.total_seconds() / 3600


def _open_export_xml(payload):
    """Accept the export.zip or a bare export.xml, as bytes or as a seekable
    file object. Real exports run to hundreds of MB, so the file-object path
    (used by the upload endpoint) never copies the payload into memory."""
    stream = BytesIO(payload) if isinstance(payload, (bytes, bytearray)) else payload
    stream.seek(0)
    if zipfile.is_zipfile(stream):
        stream.seek(0)
        zf = zipfile.ZipFile(stream)
        xml_names = [
            n for n in zf.namelist()
            if n.endswith("export.xml") and "cda" not in n.lower()
        ]
        if not xml_names:
            raise HealthImportError(
                "The zip doesn't contain an export.xml — is this really an "
                "Apple Health export?"
            )
        return zf.open(xml_names[0])
    stream.seek(0)
    head = stream.read(64).lstrip()[:1]
    stream.seek(0)
    if head == b"<":
        return stream
    raise HealthImportError(
        "Unrecognized file. Upload the export.zip from the Health app "
        "(profile picture → Export All Health Data) or the export.xml inside it."
    )


def parse_health_export(payload) -> dict[str, dict]:
    """Aggregate an Apple Health export (bytes or seekable file object) into
    per-day signals.

    Returns {iso_date: {sleep_hours, hrv_ms, resting_hr, steps}} where each
    key is present only if that signal had data for that day.
    """
    # (date, source) -> total, so multi-device double counting can be resolved.
    sleep_by_source: dict[tuple, float] = defaultdict(float)
    steps_by_source: dict[tuple, float] = defaultdict(float)
    hrv_values: dict[str, list] = defaultdict(list)
    rhr_values: dict[str, list] = defaultdict(list)

    stream = _open_export_xml(payload)
    try:
        # Canonical flat-memory iterparse: hold the root, clear it after each
        # processed element — otherwise the root keeps a reference to every
        # (emptied) Record and memory still grows with file size.
        context = iterparse(stream, events=("start", "end"))
        _, root = next(context)
        for event, elem in context:
            if event != "end":
                continue
            if elem.tag == "Record":
                rtype = elem.get("type")
                if rtype in RELEVANT_TYPES:
                    start = elem.get("startDate", "")
                    end = elem.get("endDate", "")
                    source = elem.get("sourceName", "")
                    value = elem.get("value", "")

                    if rtype == SLEEP_TYPE:
                        # Only actual sleep counts — InBed/Awake don't.
                        if "Asleep" in value and start and end:
                            sleep_by_source[(_wake_date(end), source)] += (
                                _interval_hours(start, end)
                            )
                    elif rtype == STEPS_TYPE:
                        try:
                            steps_by_source[(_local_date(start), source)] += float(
                                value
                            )
                        except ValueError:
                            pass
                    else:
                        try:
                            (hrv_values if rtype == HRV_TYPE else rhr_values)[
                                _local_date(start)
                            ].append(float(value))
                        except ValueError:
                            pass
            root.clear()
    except Exception as exc:  # malformed XML, truncated zip member, ...
        raise HealthImportError(f"Could not parse the export: {exc}") from exc

    days: dict[str, dict] = defaultdict(dict)

    def _best_per_day(by_source: dict[tuple, float]) -> dict[str, float]:
        best: dict[str, float] = {}
        for (date, _source), total in by_source.items():
            best[date] = max(best.get(date, 0.0), total)
        return best

    for date, hours in _best_per_day(sleep_by_source).items():
        days[date]["sleep_hours"] = round(hours, 1)
    for date, steps in _best_per_day(steps_by_source).items():
        days[date]["steps"] = int(steps)
    for date, values in hrv_values.items():
        days[date]["hrv_ms"] = round(sum(values) / len(values), 1)
    for date, values in rhr_values.items():
        days[date]["resting_hr"] = round(sum(values) / len(values), 1)

    if not days:
        raise HealthImportError(
            "The export parsed, but contained no sleep, HRV, resting heart "
            "rate, or step data."
        )
    return dict(days)
