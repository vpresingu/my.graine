"""Deterministic tests for the evidence computation — no model, no DB."""

from analysis import compute_evidence


def _day(day, weekday, migraine=0, sleep=7.5, cycle=10, baro=0, stress=3):
    return {
        "day": day,
        "date": f"2026-07-{day:02d}",
        "weekday": weekday,
        "wellbeing_1to10": 7,
        "migraine": migraine,
        "severity_0to10": 5 if migraine else 0,
        "phase": "headache" if migraine else "none",
        "aura": 0,
        "symptoms": [],
        "sleep_hours_prev_night": sleep,
        "stress_1to10": stress,
        "cycle_day": cycle,
        "barometric_drop": baro,
        "meds_acute": None,
        "meds_preventive": None,
        "functional_impact_0to3": 2 if migraine else 0,
        "notes": "",
    }


def _by_factor(evidence, needle):
    matches = [row for row in evidence if needle in row["factor"]]
    assert len(matches) == 1, f"expected one {needle!r} row, got {matches}"
    return matches[0]


def test_short_sleep_rates():
    records = [
        _day(1, "Monday", sleep=5.0, migraine=1),   # short night -> migraine
        _day(2, "Tuesday", sleep=5.4, migraine=1),  # short night -> migraine
        _day(3, "Wednesday", sleep=5.0, migraine=0),  # short night -> no migraine
        _day(4, "Thursday", sleep=8.0, migraine=0),
        _day(5, "Friday", sleep=8.0, migraine=1),   # migraine without short night
        _day(6, "Saturday", sleep=8.0, migraine=0),
    ]
    row = _by_factor(compute_evidence(records), "short_sleep")
    assert row["n_exposed"] == 3
    assert row["n_followed_by_migraine"] == 2
    assert row["rate_exposed"] == round(2 / 3, 3)
    assert row["rate_baseline"] == round(1 / 3, 3)


def test_weekday_confounding_note_counts_explained_migraines():
    records = [
        # Tuesday migraines: one explained by short sleep, one by cycle, one by neither
        _day(1, "Tuesday", migraine=1, sleep=4.5),
        _day(8, "Tuesday", migraine=1, cycle=27),
        _day(15, "Tuesday", migraine=1),
        _day(2, "Wednesday", migraine=0),
        _day(3, "Thursday", migraine=0),
    ]
    row = _by_factor(compute_evidence(records), "day_of_week_Tuesday")
    assert row["n_exposed"] == 3
    assert row["n_followed_by_migraine"] == 3
    assert "2 of 3 Tuesday migraines" in row["confounding_note"]


def test_high_stress_uses_next_day_and_skips_last_day():
    records = [
        _day(1, "Monday", stress=8),               # next day migraine
        _day(2, "Tuesday", migraine=1, stress=3),
        _day(3, "Wednesday", stress=8),            # next day no migraine
        _day(4, "Thursday", migraine=0, stress=3),
        _day(5, "Friday", stress=9),               # no next day -> not an opportunity
    ]
    row = _by_factor(compute_evidence(records), "high_stress")
    assert row["n_exposed"] == 2
    assert row["n_followed_by_migraine"] == 1
    assert row["rate_exposed"] == 0.5


def test_perimenstrual_and_barometric_same_day():
    records = [
        _day(1, "Monday", cycle=26, migraine=1),
        _day(2, "Tuesday", cycle=1, migraine=0),
        _day(3, "Wednesday", cycle=14, migraine=0, baro=1),
        _day(4, "Thursday", cycle=15, migraine=1, baro=1),
    ]
    evidence = compute_evidence(records)
    peri = _by_factor(evidence, "perimenstrual")
    assert peri["n_exposed"] == 2
    assert peri["n_followed_by_migraine"] == 1
    baro = _by_factor(evidence, "barometric")
    assert baro["n_exposed"] == 2
    assert baro["n_followed_by_migraine"] == 1
