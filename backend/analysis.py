"""Deterministic evidence computation for trigger analysis. No LLM here —
Python computes the statistics; Gemma only reasons about the computed table."""

SHORT_SLEEP_HOURS = 5.5
HIGH_STRESS = 7
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _rate(hits: int, n: int) -> float:
    return round(hits / n, 3) if n else 0.0


def _is_short_sleep(r: dict) -> bool:
    return (
        r["sleep_hours_prev_night"] is not None
        and r["sleep_hours_prev_night"] < SHORT_SLEEP_HOURS
    )


def _is_perimenstrual(r: dict) -> bool:
    return r["cycle_day"] >= 26 or r["cycle_day"] <= 2


def _row(factor, lag, exposed, unexposed, hits_exposed, hits_unexposed, note=""):
    return {
        "factor": factor,
        "lag": lag,
        "n_exposed": exposed,
        "n_followed_by_migraine": hits_exposed,
        "rate_exposed": _rate(hits_exposed, exposed),
        "rate_baseline": _rate(hits_unexposed, unexposed),
        "confounding_note": note,
    }


def compute_evidence(records: list[dict]) -> list[dict]:
    """Evidence table over the full record set (list of DayRecord dicts,
    any order; sorted here by day)."""
    recs = sorted(records, key=lambda r: r["day"])
    by_day = {r["day"]: r for r in recs}
    evidence: list[dict] = []

    # Prior-night sleep < 5.5h -> migraine on the day after that night.
    # (sleep_hours_prev_night on day d describes the night leading into day d,
    # so the "next day" after a short night is day d itself.)
    exposed = [r for r in recs if _is_short_sleep(r)]
    unexposed = [r for r in recs if not _is_short_sleep(r)]
    evidence.append(
        _row(
            "short_sleep_prior_night(<5.5h)",
            "~24h (migraine on the day following the short night)",
            len(exposed),
            len(unexposed),
            sum(r["migraine"] for r in exposed),
            sum(r["migraine"] for r in unexposed),
        )
    )

    # Perimenstrual window (cycle day >=26 or <=2) -> migraine same day.
    exposed = [r for r in recs if _is_perimenstrual(r)]
    unexposed = [r for r in recs if not _is_perimenstrual(r)]
    evidence.append(
        _row(
            "perimenstrual_window(cycle_day>=26_or<=2)",
            "0h (same day)",
            len(exposed),
            len(unexposed),
            sum(r["migraine"] for r in exposed),
            sum(r["migraine"] for r in unexposed),
        )
    )

    # Day-of-week -> migraine same day, with the confounding check: how many of
    # that weekday's migraines are already explained by sleep or cycle.
    for weekday in WEEKDAYS:
        days = [r for r in recs if r["weekday"] == weekday]
        if not days:
            continue
        others = [r for r in recs if r["weekday"] != weekday]
        migraine_days = [r for r in days if r["migraine"]]
        explained = [
            r for r in migraine_days if _is_short_sleep(r) or _is_perimenstrual(r)
        ]
        residual = len(migraine_days) - len(explained)
        baseline = _rate(sum(r["migraine"] for r in others), len(others))
        note = (
            f"{len(explained)} of {len(migraine_days)} {weekday} migraines are "
            "individually explained by short prior-night sleep or the "
            "perimenstrual window; excluding those, the residual rate is "
            f"{_rate(residual, len(days))} vs baseline {baseline}"
            if migraine_days
            else "no migraines on this weekday"
        )
        evidence.append(
            _row(
                f"day_of_week_{weekday}",
                "0h (same day)",
                len(days),
                len(others),
                len(migraine_days),
                sum(r["migraine"] for r in others),
                note,
            )
        )

    # Barometric pressure drop -> migraine same day.
    exposed = [r for r in recs if r["barometric_drop"]]
    unexposed = [r for r in recs if not r["barometric_drop"]]
    evidence.append(
        _row(
            "barometric_drop",
            "0h (same day)",
            len(exposed),
            len(unexposed),
            sum(r["migraine"] for r in exposed),
            sum(r["migraine"] for r in unexposed),
        )
    )

    # High stress (>=7) -> migraine the NEXT day. Only days with a recorded
    # next day count as opportunities.
    exposed = [r for r in recs if r["stress_1to10"] >= HIGH_STRESS and r["day"] + 1 in by_day]
    unexposed = [r for r in recs if r["stress_1to10"] < HIGH_STRESS and r["day"] + 1 in by_day]
    evidence.append(
        _row(
            f"high_stress(>= {HIGH_STRESS})_prev_day",
            "~24h (migraine on the following day)",
            len(exposed),
            len(unexposed),
            sum(by_day[r["day"] + 1]["migraine"] for r in exposed),
            sum(by_day[r["day"] + 1]["migraine"] for r in unexposed),
        )
    )

    return evidence
