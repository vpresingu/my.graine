// Pure derivations over the record set. Records are DayRecord objects from
// /api/records, already ordered by day.

export function scopeRecords(records, scope) {
  if (scope === "all") return records;
  return records.slice(-Number(scope));
}

export function migraineDayCount(records) {
  return records.filter((r) => r.migraine === 1).length;
}

// Last 28 recorded days vs the 28 before that (within the given records).
export function last28Split(records) {
  const current = records.slice(-28);
  const prior = records.slice(-56, -28);
  return {
    current: migraineDayCount(current),
    prior: prior.length === 28 ? migraineDayCount(prior) : null,
  };
}

export function avgSeverityOnAttackDays(records) {
  const attacks = records.filter((r) => r.migraine === 1);
  if (!attacks.length) return null;
  return attacks.reduce((s, r) => s + r.severity_0to10, 0) / attacks.length;
}

// Trailing-28-day migraine count, one point per recorded day (needs at least
// a 28-day run-up, so the series starts at the 28th record).
export function trailing28Series(records) {
  const out = [];
  for (let i = 27; i < records.length; i++) {
    const window = records.slice(i - 27, i + 1);
    out.push({
      day: records[i].day,
      date: records[i].date,
      count: migraineDayCount(window),
    });
  }
  return out;
}

export function firstPreventiveDay(records) {
  const r = records.find((rec) => rec.meds_preventive);
  return r ? r.day : null;
}

// MIDAS-style disability score: sum of functional impact over (up to) the
// last 90 recorded days — MIDAS is defined over a 3-month window.
export function midasScore(records) {
  const window = records.slice(-90);
  const score = window.reduce((s, r) => s + r.functional_impact_0to3, 0);
  return { score, maxPossible: window.length * 3, windowDays: window.length };
}

export function midasGrade(score) {
  if (score <= 5) return { grade: "I", label: "Little or no disability" };
  if (score <= 10) return { grade: "II", label: "Mild disability" };
  if (score <= 20) return { grade: "III", label: "Moderate disability" };
  return { grade: "IV", label: "Severe disability" };
}

// Average functional impact per day before vs after the preventive started.
export function beforeAfterImpact(records) {
  const cp = firstPreventiveDay(records);
  if (cp === null) return null;
  const before = records.filter((r) => r.day < cp);
  const after = records.filter((r) => r.day >= cp);
  if (!before.length || !after.length) return null;
  const avg = (recs) =>
    recs.reduce((s, r) => s + r.functional_impact_0to3, 0) / recs.length;
  return { before: avg(before), after: avg(after), changePointDay: cp };
}

const MONTHS = "short";

export function formatDate(iso, opts = { month: MONTHS, day: "numeric" }) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", opts);
}

export function formatDateRange(records) {
  if (!records.length) return "no data";
  const first = records[0].date;
  const last = records[records.length - 1].date;
  return (
    formatDate(first) +
    " – " +
    formatDate(last, { month: "short", day: "numeric", year: "numeric" }) +
    ` · ${records.length} days`
  );
}
