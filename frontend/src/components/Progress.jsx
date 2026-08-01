import { useEffect, useMemo, useState } from "react";
import { fetchAnalysis } from "../lib/analysisStore";
import ModelLoading from "./ModelLoading";

// Local before/after stats so the bars update instantly while dragging the
// change point; the model call (summary/responder) follows debounced.
function splitStats(records, cp) {
  const stat = (recs) => {
    const attacks = recs.filter((r) => r.migraine);
    return {
      days: recs.length,
      migraine: attacks.length,
      avgSev: attacks.length
        ? attacks.reduce((s, r) => s + r.severity_0to10, 0) / attacks.length
        : 0,
      disabled: recs.filter((r) => r.functional_impact_0to3 >= 2).length,
    };
  };
  return {
    before: stat(records.filter((r) => r.day < cp)),
    after: stat(records.filter((r) => r.day >= cp)),
  };
}

// % change on per-day rates, so unequal windows compare fairly.
function ratePct(bVal, bDays, aVal, aDays) {
  if (!bDays || !aDays) return null;
  const rb = bVal / bDays;
  if (!rb) return null;
  return ((aVal / aDays - rb) / rb) * 100;
}

function PctChip({ pct }) {
  if (pct === null) return null;
  const better = pct < 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        better ? "bg-emerald-50 text-emerald-700" : "bg-coral-50 text-coral-700"
      }`}
    >
      {pct > 0 ? "+" : ""}
      {Math.round(pct)}%
    </span>
  );
}

function PairedBar({ label, before, after, beforeDays, afterDays, unit, pct, decimals = 0 }) {
  // Normalize count bars to per-28-days so unequal windows read fairly.
  const nb = beforeDays ? (before / beforeDays) * 28 : before;
  const na = afterDays ? (after / afterDays) * 28 : after;
  const max = Math.max(nb, na, 0.001);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <PctChip pct={pct} />
      </div>
      {[
        { v: before, n: nb, cls: "bg-slate-300", tag: `before (${beforeDays}d)` },
        { v: after, n: na, cls: "bg-coral-500", tag: `after (${afterDays}d)` },
      ].map(({ v, n, cls, tag }) => (
        <div key={tag} className="mb-1 flex items-center gap-2">
          <span className="w-24 shrink-0 text-right text-xs text-slate-400">{tag}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className={`h-full rounded-md ${cls} transition-all duration-500`}
              style={{ width: `${Math.max((n / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-700">
            {decimals ? v.toFixed(decimals) : v}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Progress({ records }) {
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [error, setError] = useState(null);
  const [cp, setCp] = useState(null); // slider position (day)

  async function fetchProgress(day) {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await fetchAnalysis(
        `progress:${day ?? "default"}`,
        "/api/progress",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(day !== null ? { change_point_day: day } : {}),
        }
      );
      setResult(data);
      setCp(data.change_point_day);
    } catch (e) {
      setError(
        e.message.includes("Ollama") ? "The on-device model isn't running." : e.message
      );
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    fetchProgress(null); // backend defaults to the first preventive-med day
  }, []);

  // Debounced re-analysis when the marker moves off the analyzed day.
  useEffect(() => {
    if (cp === null || result === null || cp === result.change_point_day) return;
    const id = setTimeout(() => fetchProgress(cp), 800);
    return () => clearTimeout(id);
  }, [cp, result]);

  const stats = useMemo(
    () => (cp !== null && records.length ? splitStats(records, cp) : null),
    [records, cp]
  );

  if (!records.length) return null;
  const firstDay = records[0].day;
  const lastDay = records[records.length - 1].day;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">
          Progress
          <span className="ml-2 text-sm font-normal text-slate-400">
            before vs after the change point
          </span>
        </h2>
        {result &&
          (result.responder ? (
            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
              ✓ Responding — {Math.abs(Math.round(result.pct_change))}% fewer migraines
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
              Not yet responding ({Math.round(result.pct_change)}%)
            </span>
          ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-coral-200 bg-coral-50 p-5 text-sm text-coral-700">
          {error}
        </div>
      )}

      {!result && !error && (
        <ModelLoading message="comparing before and after on-device…" />
      )}

      {result && stats && (
        <>
          {/* change-point timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Change point: day {cp}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  drag to compare any split — default is the first preventive-med day
                </span>
              </h3>
              {analyzing && (
                <span className="animate-pulse text-xs font-medium text-coral-600">
                  re-analyzing on-device…
                </span>
              )}
            </div>
            {/* migraine-day tick strip aligned with the slider */}
            <svg viewBox={`0 0 ${lastDay - firstDay + 1} 14`} preserveAspectRatio="none" className="h-4 w-full">
              {records
                .filter((r) => r.migraine)
                .map((r) => (
                  <rect key={r.day} x={r.day - firstDay} y={2} width={1} height={10} fill="#f2543f" opacity={0.7} />
                ))}
              <rect x={cp - firstDay} y={0} width={0.6} height={14} fill="#0f172a" />
            </svg>
            <input
              type="range"
              min={firstDay + 1}
              max={lastDay}
              value={cp}
              onChange={(e) => setCp(Number(e.target.value))}
              className="w-full accent-coral-500"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>day {firstDay}</span>
              <span>day {lastDay}</span>
            </div>
          </section>

          {/* paired bars */}
          <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <PairedBar
              label="Migraine days"
              before={stats.before.migraine}
              after={stats.after.migraine}
              beforeDays={stats.before.days}
              afterDays={stats.after.days}
              pct={ratePct(stats.before.migraine, stats.before.days, stats.after.migraine, stats.after.days)}
            />
            <PairedBar
              label="Avg severity on attack days"
              before={stats.before.avgSev}
              after={stats.after.avgSev}
              beforeDays={0}
              afterDays={0}
              decimals={1}
              pct={
                stats.before.avgSev
                  ? ((stats.after.avgSev - stats.before.avgSev) / stats.before.avgSev) * 100
                  : null
              }
            />
            <PairedBar
              label="Disabled days (impact ≥ 2)"
              before={stats.before.disabled}
              after={stats.after.disabled}
              beforeDays={stats.before.days}
              afterDays={stats.after.days}
              pct={ratePct(stats.before.disabled, stats.before.days, stats.after.disabled, stats.after.days)}
            />
            <p className="text-xs text-slate-400">
              Bars are normalized per 28 days so unequal windows compare fairly;
              numbers show raw counts with each window's length. Computed locally —
              drag the marker for instant comparison.
            </p>
          </section>

          {/* model narrative */}
          <section
            className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-opacity ${analyzing ? "opacity-50" : ""}`}
          >
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              On-device summary
              <span className="ml-2 text-xs font-normal text-slate-400">
                severity trend: {result.severity_trend}
              </span>
            </h3>
            <p className="text-sm leading-relaxed text-slate-600">{result.summary}</p>
            <p className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-relaxed text-slate-400">
              {result.caveats}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
