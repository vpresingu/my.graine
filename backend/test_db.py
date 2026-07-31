"""Data-layer tests. Point the engine at a throwaway file before importing db."""

import os
import tempfile

os.environ["MYGRAINE_DB_PATH"] = os.path.join(
    tempfile.mkdtemp(prefix="mygraine-test-"), "test.db"
)

from sqlmodel import Session, select  # noqa: E402

from db import engine, init_db  # noqa: E402
from models import DayRecord  # noqa: E402


def _sample(day: int, **overrides) -> DayRecord:
    fields = dict(
        day=day,
        date=f"2026-07-{day:02d}",
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
        meds_acute=None,
        meds_preventive="magnesium 400mg",
        functional_impact_0to3=0,
        notes="",
    )
    fields.update(overrides)
    return DayRecord(**fields)


def test_insert_and_query_roundtrip():
    init_db()

    with Session(engine) as session:
        session.add(_sample(1))
        session.add(
            _sample(
                2,
                migraine=1,
                severity_0to10=6,
                phase="aura+headache",
                aura=1,
                symptoms=["photophobia", "nausea", "visual aura"],
                meds_acute="sumatriptan 50mg",
                functional_impact_0to3=2,
                notes="Started mid-morning.",
            )
        )
        session.commit()

    with Session(engine) as session:
        records = session.exec(select(DayRecord).order_by(DayRecord.day)).all()
        assert [r.day for r in records] == [1, 2]
        assert records[0].migraine == 0

        migraine_day = records[1]
        assert isinstance(migraine_day.symptoms, list)
        assert migraine_day.symptoms == ["photophobia", "nausea", "visual aura"]
        assert migraine_day.phase == "aura+headache"

        assert session.get(DayRecord, 2).sleep_hours_prev_night == 7.5
