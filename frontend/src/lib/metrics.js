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

// A MIDAS-style score and its I-IV grading ("Moderate disability", "Severe
// disability") used to live here. Assigning the user a disability grade is a
// clinical judgement about them, not an organization of what they recorded,
// which is the line this app promises not to cross. Removed deliberately —
// don't reintroduce it. Progress compares functional impact before and after a
// change point without grading the person.

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
