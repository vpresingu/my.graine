"""Deterministic evidence computation for trigger analysis. No LLM here —
Python computes the statistics; Gemma only reasons about the computed table."""

from statistics import median

SHORT_SLEEP_HOURS = 5.5
HIGH_STRESS = 7
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Wearable deviation thresholds, relative to the user's own baseline (median).
# Autonomic prodrome signals: HRV dips and resting-HR rises before attacks.
HRV_DIP_FRACTION = 0.85  # a day counts as an HRV dip below 85% of baseline
RHR_RISE_BPM = 3.0  # a day counts as elevated at baseline + 3 bpm


def _median(values: list[float]) -> float:
    return float(median(values))


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

    # Wearable-derived rows only exist once watch data has been imported.
    evidence.extend(compute_wearable_evidence(recs))

    return evidence


def _wearable_next_day_row(recs, by_day, metric, is_deviant, factor, note):
    """Deviant metric on day d -> migraine on day d+1, mirroring the
    high-stress row: only days with data and a recorded next day count."""
    with_data = [
        r for r in recs if r.get(metric) is not None and r["day"] + 1 in by_day
    ]
    exposed = [r for r in with_data if is_deviant(r[metric])]
    unexposed = [r for r in with_data if not is_deviant(r[metric])]
    return _row(
        factor,
        "~24h (migraine on the following day)",
        len(exposed),
        len(unexposed),
        sum(by_day[r["day"] + 1]["migraine"] for r in exposed),
        sum(by_day[r["day"] + 1]["migraine"] for r in unexposed),
        note,
    )


def compute_wearable_evidence(records: list[dict]) -> list[dict]:
    """Evidence rows for imported wearable signals, empty if none imported.
    Deviations are measured against this user's own baseline (median), so the
    rows describe *their* pattern — no population norms, no diagnosis."""
    recs = sorted(records, key=lambda r: r["day"])
    by_day = {r["day"]: r for r in recs}
    evidence: list[dict] = []

    hrv_all = [r["hrv_ms"] for r in recs if r.get("hrv_ms") is not None]
    if len(hrv_all) >= 7:
        baseline = round(_median(hrv_all), 1)
        threshold = round(baseline * HRV_DIP_FRACTION, 1)
        evidence.append(
            _wearable_next_day_row(
                recs,
                by_day,
                "hrv_ms",
                lambda v: v < threshold,
                f"hrv_dip_prev_day(<{threshold}ms)",
                f"watch-measured; dip = below {int(HRV_DIP_FRACTION * 100)}% of "
                f"this user's median HRV ({baseline}ms)",
            )
        )

    rhr_all = [r["resting_hr"] for r in recs if r.get("resting_hr") is not None]
    if len(rhr_all) >= 7:
        baseline = round(_median(rhr_all), 1)
        threshold = round(baseline + RHR_RISE_BPM, 1)
        evidence.append(
            _wearable_next_day_row(
                recs,
                by_day,
                "resting_hr",
                lambda v: v > threshold,
                f"elevated_resting_hr_prev_day(>{threshold}bpm)",
                f"watch-measured; elevated = more than {RHR_RISE_BPM:g}bpm above "
                f"this user's median resting HR ({baseline}bpm)",
            )
        )

    return evidence


def wearable_summary(records: list[dict]) -> dict:
    """Headline numbers for the Body Signals screen. Deterministic — the
    'your watch saw it coming' stat is countable by hand from the diary."""
    recs = sorted(records, key=lambda r: r["day"])
    by_day = {r["day"]: r for r in recs}

    hrv_all = [r["hrv_ms"] for r in recs if r.get("hrv_ms") is not None]
    rhr_all = [r["resting_hr"] for r in recs if r.get("resting_hr") is not None]
    days_with_data = sum(
        1
        for r in recs
        if any(r.get(k) is not None for k in ("hrv_ms", "resting_hr", "steps"))
    )

    summary = {
        "days_with_data": days_with_data,
        "hrv_baseline_ms": round(_median(hrv_all), 1) if hrv_all else None,
        "rhr_baseline_bpm": round(_median(rhr_all), 1) if rhr_all else None,
        "hrv_dip_threshold_ms": None,
        "migraines_with_prior_day_data": 0,
        "migraines_preceded_by_hrv_dip": 0,
        "evidence": compute_wearable_evidence(recs),
    }

    # Of the migraines whose previous day has HRV data, how many followed a dip?
    if len(hrv_all) >= 7:
        threshold = round(_median(hrv_all) * HRV_DIP_FRACTION, 1)
        summary["hrv_dip_threshold_ms"] = threshold
        for r in recs:
            if not r["migraine"]:
                continue
            prev = by_day.get(r["day"] - 1)
            if prev is None or prev.get("hrv_ms") is None:
                continue
            summary["migraines_with_prior_day_data"] += 1
            if prev["hrv_ms"] < threshold:
                summary["migraines_preceded_by_hrv_dip"] += 1

    return summary
