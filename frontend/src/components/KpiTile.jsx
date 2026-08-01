import { useCountUp } from "../hooks/useCountUp";

export function KpiTile({ label, sub, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-2">{children}</div>
      {sub && <p className="mt-1.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function CountUpNumber({ value, decimals = 0, suffix = "" }) {
  const shown = useCountUp(value, { decimals });
  return (
    <span className="text-3xl font-semibold tabular-nums text-slate-800">
      {shown ?? "–"}
      {suffix && <span className="text-lg text-slate-400"> {suffix}</span>}
    </span>
  );
}

// delta > 0 is shown as worse (coral), delta < 0 as better (green).
export function Delta({ value, unit = "", windowLabel = "prior 28" }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-slate-300">no prior window</span>;
  }
  if (value === 0) {
    return <span className="text-xs font-medium text-slate-400">— unchanged</span>;
  }
  const worse = value > 0;
  return (
    <span
      className={`text-xs font-semibold ${worse ? "text-coral-600" : "text-emerald-600"}`}
    >
      {worse ? "▲" : "▼"} {Math.abs(value)}
      {unit} vs {windowLabel}
    </span>
  );
}
