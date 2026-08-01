import { useEffect, useState } from "react";
import { fetchAnalysis } from "../lib/analysisStore";
import ModelLoading from "./ModelLoading";
import SleepScatter from "./SleepScatter";

const VERDICTS = {
  plausible: { label: "Likely trigger", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  coincidence: { label: "Coincidence", pill: "bg-slate-100 text-slate-500", bar: "bg-slate-300" },
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
  return { name: trigger, lag: "", support: null };
}

const pct = (r) => `${Math.round(r * 100)}%`;

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
          ? "border-dashed border-slate-300 bg-slate-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">
            {meta.name}{" "}
            <span className="font-normal text-slate-400">{meta.lag}</span>
          </h3>
          {ev && meta.support ? (
            <p className="mt-0.5 text-sm text-slate-500">{meta.support(ev)}</p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-500">{t.support}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${v.pill}`}>
          {v.label}
        </span>
      </div>

      {rejected && ev && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              Raw signal looks strong: {pct(ev.rate_exposed)} migraine rate vs{" "}
              {pct(ev.rate_baseline)} baseline
            </span>{" "}
            — {(ev.rate_exposed / Math.max(ev.rate_baseline, 0.001)).toFixed(1)}×
            elevated.
          </p>
          <p className="mt-1.5 border-l-2 border-coral-400 pl-2.5 text-sm font-medium text-slate-700">
            ✕ Rejected: {t.reason}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${v.bar} transition-all duration-700`}
            style={{ width: `${Math.round(t.confidence_0to1 * 100)}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-slate-400">
          {t.confidence_0to1.toFixed(2)}
        </span>
      </div>

      {!rejected && <p className="mt-3 text-sm leading-relaxed text-slate-500">{t.reason}</p>}
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
      <h2 className="text-lg font-semibold text-slate-800">
        Trigger Insights
        <span className="ml-2 text-sm font-normal text-slate-400">
          statistics computed locally · causal reasoning by the on-device model
        </span>
      </h2>

      {state.status === "loading" && (
        <ModelLoading message="reasoning locally over your diary…" />
      )}

      {state.status === "error" && (
        <div className="rounded-2xl border border-coral-200 bg-coral-50 p-5 text-sm text-coral-700">
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">
              Sleep → next-day severity
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              Every recorded day: the night before (x) against that day's severity
              (y). The migraine cluster sits in the shaded short-sleep region.
            </p>
            <SleepScatter records={records} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="text-sm font-semibold text-slate-700 hover:text-coral-600"
            >
              {showAudit ? "▾" : "▸"} Audit the numbers
              <span className="ml-2 text-xs font-normal text-slate-400">
                the exact evidence table the model reasoned over
              </span>
            </button>
            {showAudit && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="py-2 pr-4 font-medium">factor</th>
                      <th className="py-2 pr-4 font-medium">exposed</th>
                      <th className="py-2 pr-4 font-medium">migraines</th>
                      <th className="py-2 pr-4 font-medium">rate</th>
                      <th className="py-2 pr-4 font-medium">baseline</th>
                      <th className="py-2 font-medium">confounding</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    {evidence.map((e) => (
                      <tr key={e.factor} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-mono">{e.factor}</td>
                        <td className="py-2 pr-4 tabular-nums">{e.n_exposed}</td>
                        <td className="py-2 pr-4 tabular-nums">{e.n_followed_by_migraine}</td>
                        <td className="py-2 pr-4 tabular-nums">{e.rate_exposed}</td>
                        <td className="py-2 pr-4 tabular-nums">{e.rate_baseline}</td>
                        <td className="py-2 text-slate-400">{e.confounding_note || "—"}</td>
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
