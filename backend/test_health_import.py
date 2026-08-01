"""Health-import tests: XML/zip parsing, per-day aggregation, endpoint merge,
and the wearable evidence stats. Point the engine at a throwaway file before
importing db (same pattern as test_db.py)."""

import io
import os
import tempfile
import zipfile

os.environ["MYGRAINE_DB_PATH"] = os.path.join(
    tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session  # noqa: E402

import analysis  # noqa: E402
from db import engine, init_db  # noqa: E402
from health_import import HealthImportError, parse_health_export  # noqa: E402
from main import app  # noqa: E402
from models import DayRecord  # noqa: E402


def _record_xml(rtype, value, start, end, source="Test Watch"):
    return (
        f'<Record type="{rtype}" sourceName="{source}" value="{value}" '
        f'startDate="{start}" endDate="{end}"/>'
    )


def _export(*records: str) -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8"?><HealthData>'
        + "".join(records)
        + "</HealthData>"
    ).encode()


def _zipped(xml: bytes) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("apple_health_export/export.xml", xml)
    return buf.getvalue()


SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
RHR = "HKQuantityTypeIdentifierRestingHeartRate"
STEPS = "HKQuantityTypeIdentifierStepCount"


def test_parse_aggregates_per_day():
    xml = _export(
        # Two asleep intervals ending on the morning of 06-02 -> summed.
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisAsleepCore",
            "2026-06-01 23:00:00 -0500",
            "2026-06-02 03:00:00 -0500",
        ),
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisAsleepREM",
            "2026-06-02 03:30:00 -0500",
            "2026-06-02 06:30:00 -0500",
        ),
        # InBed doesn't count as sleep.
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisInBed",
            "2026-06-01 22:30:00 -0500",
            "2026-06-02 06:45:00 -0500",
        ),
        _record_xml(HRV, "40", "2026-06-02 08:00:00 -0500", "2026-06-02 08:00:00 -0500"),
        _record_xml(HRV, "50", "2026-06-02 20:00:00 -0500", "2026-06-02 20:00:00 -0500"),
        _record_xml(RHR, "57", "2026-06-02 06:00:00 -0500", "2026-06-02 06:00:00 -0500"),
        _record_xml(STEPS, "4000", "2026-06-02 09:00:00 -0500", "2026-06-02 10:00:00 -0500"),
        _record_xml(STEPS, "3000", "2026-06-02 15:00:00 -0500", "2026-06-02 16:00:00 -0500"),
    )
    days = parse_health_export(xml)
    assert days == {
        "2026-06-02": {
            "sleep_hours": 7.0,
            "hrv_ms": 45.0,
            "resting_hr": 57.0,
            "steps": 7000,
        }
    }


def test_sleep_segments_spanning_midnight_join_one_night():
    # Real exports chop a night into stage segments; the pre-midnight ones
    # must roll forward to the wake date, not land on the bedtime date.
    xml = _export(
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisAsleepCore",
            "2026-06-01 22:30:00 -0500",
            "2026-06-01 23:45:00 -0500",  # ends before midnight
        ),
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisAsleepDeep",
            "2026-06-02 00:15:00 -0500",
            "2026-06-02 06:30:00 -0500",
        ),
    )
    days = parse_health_export(xml)
    assert list(days) == ["2026-06-02"]  # one night, one diary date
    assert days["2026-06-02"]["sleep_hours"] == 7.5


def test_parse_takes_largest_source_not_sum():
    # Phone and watch both log steps; totals must not be added together.
    xml = _export(
        _record_xml(STEPS, "6000", "2026-06-02 09:00:00 -0500", "2026-06-02 10:00:00 -0500", source="Watch"),
        _record_xml(STEPS, "4000", "2026-06-02 09:00:00 -0500", "2026-06-02 10:00:00 -0500", source="iPhone"),
    )
    assert parse_health_export(xml)["2026-06-02"]["steps"] == 6000


def test_parse_accepts_zip_and_rejects_junk():
    xml = _export(
        _record_xml(RHR, "60", "2026-06-02 06:00:00 -0500", "2026-06-02 06:00:00 -0500")
    )
    assert parse_health_export(_zipped(xml)) == parse_health_export(xml)
    with pytest.raises(HealthImportError):
        parse_health_export(b"not an export")
    with pytest.raises(HealthImportError):
        parse_health_export(_export())  # parses but has no signals


def _sample(day: int, **overrides) -> DayRecord:
    fields = dict(
        day=day,
        date=f"2026-06-{day:02d}",
        weekday="Wednesday",
        wellbeing_1to10=7,
        migraine=0,
        severity_0to10=0,
        phase="none",
        aura=0,
        symptoms=[],
        sleep_hours_prev_night=7.5,
        stress_1to10=3,
        cycle_day=12,
        barometric_drop=0,
        functional_impact_0to3=0,
        notes="",
    )
    fields.update(overrides)
    return DayRecord(**fields)


def test_import_endpoint_merges_by_date():
    init_db()
    with Session(engine) as session:
        # merge, not add: the suite shares one throwaway DB and another test
        # file may already have inserted this day.
        session.merge(_sample(2))
        session.commit()

    xml = _export(
        _record_xml(HRV, "38", "2026-06-02 08:00:00 -0500", "2026-06-02 08:00:00 -0500"),
        _record_xml(
            SLEEP,
            "HKCategoryValueSleepAnalysisAsleepCore",
            "2026-06-01 23:00:00 -0500",
            "2026-06-02 05:00:00 -0500",
        ),
        # A date with no diary record: counted as unmatched, not an error.
        _record_xml(RHR, "61", "2026-06-20 06:00:00 -0500", "2026-06-20 06:00:00 -0500"),
    )
    client = TestClient(app)
    resp = client.post(
        "/api/import/health",
        files={"file": ("export.zip", _zipped(xml), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["days_matched"] == 1
    assert body["days_unmatched"] == 1
    assert body["sleep_values_updated"] == 1  # 7.5 recalled -> 6.0 measured

    with Session(engine) as session:
        rec = session.get(DayRecord, 2)
        assert rec.hrv_ms == 38.0
        assert rec.sleep_hours_prev_night == 6.0
        assert rec.resting_hr is None  # unmatched date touched nothing

    resp = client.post(
        "/api/import/health", files={"file": ("junk.txt", b"hello", "text/plain")}
    )
    assert resp.status_code == 422


def test_wearable_evidence_and_summary():
    # 14 days, HRV baseline ~46; dips (30) on the days before both migraines
    # and one dip not followed by a migraine.
    rows = []
    migraine_days = {5, 11}
    dip_days = {4, 10, 13}
    for day in range(1, 15):
        rows.append(
            _sample(
                day,
                migraine=1 if day in migraine_days else 0,
                hrv_ms=30.0 if day in dip_days else 46.0,
                resting_hr=58.0,
            ).model_dump()
        )

    summary = analysis.wearable_summary(rows)
    assert summary["days_with_data"] == 14
    assert summary["hrv_baseline_ms"] == 46.0
    assert summary["migraines_with_prior_day_data"] == 2
    assert summary["migraines_preceded_by_hrv_dip"] == 2

    rows_by_factor = {r["factor"]: r for r in summary["evidence"]}
    hrv_row = next(v for k, v in rows_by_factor.items() if k.startswith("hrv_dip"))
    # Exposed: dip days 4, 10, 13 all have a next day recorded -> 3, of which
    # days 5 and 11 are migraines.
    assert hrv_row["n_exposed"] == 3
    assert hrv_row["n_followed_by_migraine"] == 2

    # Without wearable data no wearable rows appear (and evidence still works).
    bare = [_sample(d).model_dump() for d in range(1, 10)]
    assert analysis.compute_wearable_evidence(bare) == []
    assert not any(
        r["factor"].startswith(("hrv_", "elevated_resting"))
        for r in analysis.compute_evidence(bare)
    )
