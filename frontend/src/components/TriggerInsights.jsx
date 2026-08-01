import { useEffect, useState } from "react";
import { analysisStartedAt, fetchAnalysis } from "../lib/analysisStore";
import { pct, rateLift } from "../lib/metrics";
import ModelLoading from "./ModelLoading";
import SleepScatter from "./SleepScatter";

const VERDICTS = {
  plausible: { label: "Likely trigger", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  coincidence: { label: "Coincidence", pill: "bg-bone-100 text-stone-500", bar: "bg-bone-300" },
  inconclusive: { label: "Inconclusive", pill: "bg-amber-50 text-amber-700", bar: "bg-amber-400" },
};

// Friendly names + support phrasing per computed factor.
function factorMeta(trigger) {
  const t = trigger.toLowerCase();
  if (t.includes("sleep"))
    return {
      name: "Poor sleep (< 5.5h)",
      lag: "→ migraine, ~24h later",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} short nights were followed by a migraine`,
    };
  if (t.includes("perimenstrual"))
    return {
      name: "Perimenstrual window",
      lag: "→ migraine, same day",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} perimenstrual days had a migraine`,
    };
  if (t.includes("day_of_week")) {
    const day = trigger.replace(/^day_of_week_/i, "");
    return {
      name: `${day}s`,
      lag: "→ migraine, same day",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} ${day}s had a migraine`,
      weekday: true,
    };
  }
  if (t.includes("barometric"))
    return {
      name: "Barometric pressure drop",
      lag: "→ migraine, same day",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} pressure-drop days had a migraine`,
    };
  if (t.includes("stress"))
    return {
      name: "High stress (≥ 7)",
      lag: "→ migraine, ~24h later",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} high-stress days were followed by a migraine`,
    };
  if (t.includes("hrv"))
    return {
      name: "HRV dip (watch)",
      lag: "→ migraine, ~24h later",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} low-HRV days were followed by a migraine`,
    };
  if (t.includes("resting_hr") || t.includes("resting hr"))
    return {
      name: "Elevated resting HR (watch)",
      lag: "→ migraine, ~24h later",
      support: (e) => `${e.n_followed_by_migraine} of ${e.n_exposed} elevated-HR days were followed by a migraine`,
    };
  return { name: trigger, lag: "", support: null };
}

function TriggerCard({ t, evidence }) {
  const meta = factorMeta(t.trigger);
  const ev = evidence.find((e) => e.factor === t.trigger);
  const v = VERDICTS[t.verdict];
  // "Reasoned rejection": a coincidence whose raw rate looks elevated — the
  // system actively threw out a false pattern. Give it the deliberate look.
  const rejected =
    t.verdict === "coincidence" && ev && ev.rate_exposed > ev.rate_baseline * 1.3;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        rejected
          ? "border-dashed border-bone-300 bg-bone-50"
          : "border-bone-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-stone-800">
            {meta.name}{" "}
            <span className="font-normal text-stone-400">{meta.lag}</span>
          </h3>
          {ev && meta.support ? (
            <p className="mt-0.5 text-sm text-stone-500">{meta.support(ev)}</p>
          ) : (
            <p className="mt-0.5 text-sm text-stone-500">{t.support}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${v.pill}`}>
          {v.label}
        </span>
      </div>

      {rejected && ev && (
        <div className="mt-3 rounded-xl border border-bone-200 bg-white p-3">
          <p className="text-sm text-stone-600">
            <span className="font-semibold text-stone-800">
              Raw signal looks strong: {pct(ev.rate_exposed)} migraine rate vs{" "}
              {pct(ev.rate_baseline)} baseline
            </span>{" "}
            — {rateLift(ev.rate_exposed, ev.rate_baseline).toFixed(1)}× elevated.
          </p>
          <p className="mt-1.5 border-l-2 border-sky-400 pl-2.5 text-sm font-medium text-stone-700">
            ✕ Rejected: {t.reason}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bone-100">
          <div
            className={`h-full rounded-full ${v.bar} transition-all duration-700`}
            style={{ width: `${Math.round(t.confidence_0to1 * 100)}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-stone-400">
          {t.confidence_0to1.toFixed(2)}
        </span>
      </div>

      {!rejected && (
        <p className="mt-3 text-sm leading-relaxed text-stone-500">{t.reason}</p>
      )}
    </div>
  );
}

export default function TriggerInsights({ records }) {
  const [state, setState] = useState({ status: "loading" });
  const [evidence, setEvidence] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAnalysis("evidence", "/api/triggers/evidence")
      .then((d) => !cancelled && setEvidence(d.evidence || []))
      .catch(() => {});
    fetchAnalysis("triggers", "/api/triggers", { method: "POST" })
      .then((d) => !cancelled && setState({ status: "ok", triggers: d.triggers }))
      .catch(
        (e) =>
          !cancelled &&
          setState({
            status: "error",
            message: e.message.includes("Ollama")
              ? "The on-device model isn't running."
              : e.message,
          })
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg font-bold text-stone-800">
        Trigger Insights
        <span className="text-xs font-normal text-stone-400">
          statistics computed locally · causal reasoning by the on-device model
        </span>
      </h2>

      {state.status === "loading" && (
        <ModelLoading
          message="reasoning locally over your diary…"
          since={analysisStartedAt("triggers")}
        />
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
          {state.message}
        </div>
      )}

      {state.status === "ok" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {state.triggers.map((t) => (
            <TriggerCard key={t.trigger} t={t} evidence={evidence} />
          ))}
        </div>
      )}

      {/* Deterministic sections — rendered immediately, no model needed. */}
      <>
          <section className="rounded-2xl border border-bone-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-stone-700">
              Sleep → next-day severity
            </h3>
            <p className="mb-4 text-xs text-stone-400">
              Every recorded day: the night before (x) against that day's severity
              (y). The migraine cluster sits in the shaded short-sleep region.
            </p>
            <SleepScatter records={records} />
          </section>

          <section className="rounded-2xl border border-bone-200 bg-white p-5 shadow-sm">
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="text-sm font-semibold text-stone-700 transition-colors hover:text-sky-600"
            >
              {showAudit ? "▾" : "▸"} Audit the numbers
              <span className="ml-2 text-xs font-normal text-stone-400">
                the exact evidence table the model reasoned over
              </span>
            </button>
            {showAudit && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-bone-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-bone-200 bg-bone-50 text-stone-500">
                      <th className="px-3 py-2 font-semibold">factor</th>
                      <th className="px-3 py-2 font-semibold">exposed</th>
                      <th className="px-3 py-2 font-semibold">migraines</th>
                      <th className="px-3 py-2 font-semibold">rate</th>
                      <th className="px-3 py-2 font-semibold">baseline</th>
                      <th className="px-3 py-2 font-semibold">confounding</th>
                    </tr>
                  </thead>
                  <tbody className="text-stone-700">
                    {evidence.map((e) => (
                      <tr key={e.factor} className="border-b border-bone-100 last:border-b-0">
                        <td className="px-3 py-2 font-mono">{e.factor}</td>
                        <td className="px-3 py-2 tabular-nums">{e.n_exposed}</td>
                        <td className="px-3 py-2 tabular-nums">{e.n_followed_by_migraine}</td>
                        <td className="px-3 py-2 tabular-nums">{e.rate_exposed}</td>
                        <td className="px-3 py-2 tabular-nums">{e.rate_baseline}</td>
                        <td className="px-3 py-2 text-stone-500">{e.confounding_note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
      </>
    </div>
  );
}
