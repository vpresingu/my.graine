import { useCallback, useEffect, useState } from "react";
import DailyLog from "./components/DailyLog";
import Dashboard from "./components/Dashboard";
import PatientHistory from "./components/PatientHistory";
import Phenotype from "./components/Phenotype";
import Progress from "./components/Progress";
import RecordsLog from "./components/RecordsLog";
import TriggerInsights from "./components/TriggerInsights";
import { formatDateRange } from "./lib/metrics";

const SCREENS = [
  "Dashboard",
  "Daily Log",
  "Trigger Insights",
  "Progress",
  "Phenotype",
  "Patient History",
  "Records",
];

export default function App() {
  const [health, setHealth] = useState("checking");
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [screen, setScreen] = useState("Dashboard");
  const [progress, setProgress] = useState({ state: "loading" });
  const [resetState, setResetState] = useState(null);

  const loadData = useCallback(() => {
    fetch("/api/records")
      .then((r) => r.json())
      .then(setRecords)
      .catch(() => setRecords([]));
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.status === "ok" ? "ok" : "down"))
      .catch(() => setHealth("down"));
    loadData();
    // Model-backed; slow (local inference) — fetched once, shown when ready.
    fetch("/api/progress", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => setProgress({ state: "ok", data }))
      .catch((e) =>
        setProgress({
          state: "error",
          message: e.message.includes("Ollama") ? "model offline" : e.message,
        })
      );
  }, [loadData]);

  // Rehearsal helper, not part of the demo: restore the original seed data.
  async function resetDemoData() {
    if (resetState === "working") return;
    if (!window.confirm("Reset to the original seeded demo data?")) return;
    setResetState("working");
    try {
      const r = await fetch("/api/admin/reset", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      loadData();
      setResetState(`✓ ${d.rows} days restored`);
    } catch {
      setResetState("reset failed");
    }
    setTimeout(() => setResetState(null), 3000);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            My<span className="text-coral-500">-</span>Graine
          </h1>
          <span className="text-sm text-slate-400">{formatDateRange(records)}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={resetDemoData}
            title="Wipe and re-seed the original demo data (rehearsal only)"
            className="text-xs text-slate-300 transition-colors hover:text-slate-500"
          >
            {resetState === "working" ? "resetting…" : (resetState ?? "Reset demo data")}
          </button>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                health === "ok"
                  ? "bg-emerald-500"
                  : health === "checking"
                    ? "bg-amber-400"
                    : "bg-red-500"
              }`}
            />
            <span className="text-sm font-semibold text-slate-700">
              On-device · offline
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-52 shrink-0 border-r border-slate-200 bg-white p-3">
          <ul className="space-y-1">
            {SCREENS.map((name) => (
              <li key={name}>
                <button
                  onClick={() => setScreen(name)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    screen === name
                      ? "bg-coral-50 text-coral-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  {name}
                  {name === "Records" && records.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
                      {records.length} days logged
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 overflow-x-hidden p-6">
          {screen === "Dashboard" ? (
            records.length ? (
              <Dashboard records={records} stats={stats} progress={progress} />
            ) : (
              <div className="flex h-64 items-center justify-center text-slate-400">
                No records yet — seed the database, then reload.
              </div>
            )
          ) : screen === "Daily Log" ? (
            <DailyLog onSaved={loadData} />
          ) : screen === "Trigger Insights" ? (
            <TriggerInsights records={records} />
          ) : screen === "Progress" ? (
            <Progress records={records} />
          ) : screen === "Phenotype" ? (
            <Phenotype />
          ) : screen === "Patient History" ? (
            <PatientHistory recordCount={records.length} />
          ) : (
            <RecordsLog records={records} />
          )}
        </main>
      </div>
    </div>
  );
}
