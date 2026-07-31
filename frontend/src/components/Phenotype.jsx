import { useEffect, useState } from "react";

export default function Phenotype() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/phenotype", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => !cancelled && setState({ status: "ok", data: d }))
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
      {/* Scope-safety strip — deliberately prominent and always visible. */}
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-xl border-l-4 border-coral-500 bg-slate-800 px-5 py-3.5 text-white shadow-md">
        <span className="text-xl">⚕</span>
        <p className="text-sm font-semibold leading-snug">
          My-Graine organizes your history against known patterns.{" "}
          <span className="text-coral-300">It does not diagnose.</span>
        </p>
      </div>

      <h2 className="text-lg font-semibold text-slate-800">
        Phenotype
        <span className="ml-2 text-sm font-normal text-slate-400">
          your history organized against ICHD-3 patterns, for your next visit
        </span>
      </h2>

      {state.status === "loading" && (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-coral-200 border-t-coral-500" />
          <p className="animate-pulse text-sm text-slate-400">reasoning locally…</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-2xl border border-coral-200 bg-coral-50 p-5 text-sm text-coral-700">
          {state.message}
        </div>
      )}

      {state.status === "ok" && (
        <div className="space-y-4">
          {state.data.patterns.map((p) => (
            <section
              key={p.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold text-slate-800">{p.label}</h3>
                <div className="flex w-44 shrink-0 items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-coral-500 transition-all duration-700"
                      style={{ width: `${Math.round(p.match_strength_0to1 * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-slate-400">
                    {p.match_strength_0to1.toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.evidence}</p>
              <p className="mt-2 border-l-2 border-slate-200 pl-3 text-sm italic text-slate-500">
                {p.framing}
              </p>
            </section>
          ))}
          <p className="px-1 text-xs text-slate-400">{state.data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
