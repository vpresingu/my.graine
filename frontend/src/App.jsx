import { useCallback, useEffect, useState } from "react";
import BodySignals from "./components/BodySignals";
import DailyLog from "./components/DailyLog";
import Dashboard from "./components/Dashboard";
import PatientHistory from "./components/PatientHistory";
import Phenotype from "./components/Phenotype";
import Progress from "./components/Progress";
import RecordsLog from "./components/RecordsLog";
import TriggerInsights from "./components/TriggerInsights";
import { fetchAnalysis, invalidateAnalyses } from "./lib/analysisStore";
import { formatDateRange } from "./lib/metrics";

const SCREENS = [
  "Dashboard",
  "Daily Log",
  "Body Signals",
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
  const [lastSavedDay, setLastSavedDay] = useState(null);
  const [navOpen, setNavOpen] = useState(true);

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

  // Model-backed; slow (local inference) — deduped and unmount-proof via the
  // analysis store, shown when ready.
  const loadProgress = useCallback(() => {
    setProgress({ state: "loading" });
    fetchAnalysis("progress:default", "/api/progress", { method: "POST" })
      .then((data) => setProgress({ state: "ok", data }))
      .catch((e) =>
        setProgress({
          state: "error",
          message: e.message.includes("Ollama") ? "model offline" : e.message,
        })
      );
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.status === "ok" ? "ok" : "down"))
      .catch(() => setHealth("down"));
    loadData();
    loadProgress();
  }, [loadData, loadProgress]);

  // The timeline changed (day saved): stale analyses must not survive.
  const handleSaved = useCallback(
    (day) => {
      setLastSavedDay(day ?? null);
      loadData();
      invalidateAnalyses();
      loadProgress();
    },
    [loadData, loadProgress]
  );

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
      invalidateAnalyses(); // server cache was cleared; drop client copies too
      loadProgress();
      setResetState(`✓ ${d.rows} days restored`);
    } catch {
      setResetState("reset failed");
    }
    setTimeout(() => setResetState(null), 4000);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bone-100 text-stone-900">
      <header className="relative flex items-center justify-between border-b border-bone-200 bg-bone-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Toggle navigation"
            title="Toggle navigation"
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-lg transition-colors hover:bg-bone-200"
          >
            <span className="h-[2px] w-[18px] rounded-full bg-stone-700" />
            <span className="h-[2px] w-[18px] rounded-full bg-stone-700" />
            <span className="h-[2px] w-[18px] rounded-full bg-stone-700" />
          </button>
          <span className="hidden text-sm text-stone-400 sm:inline">
            {formatDateRange(records)}
          </span>
        </div>

        <h1 className="absolute left-1/2 -translate-x-1/2 font-display text-2xl font-extrabold tracking-tight text-stone-900">
          My<span className="text-sky-500">-</span>Graine
        </h1>

        <div className="flex items-center gap-4">
          <button
            onClick={resetDemoData}
            title="Wipe and re-seed the original demo data (rehearsal only)"
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              resetState?.startsWith("✓")
                ? "text-emerald-700"
                : resetState === "reset failed"
                  ? "text-rose-700"
                  : "text-stone-400 hover:bg-bone-200 hover:text-stone-600"
            }`}
          >
            {resetState === "working" ? "resetting…" : (resetState ?? "Reset demo data")}
          </button>
          <div
            className="flex items-center gap-1.5 text-xs font-medium"
            title="No cloud, no accounts, no network calls — the model runs on this machine"
          >
            {health === "down" ? (
              <span className="font-semibold text-rose-600">backend offline</span>
            ) : (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="text-stone-400"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <span className="text-stone-500">nothing leaves this machine</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <nav
          className={`shrink-0 overflow-hidden transition-all duration-200 ${
            navOpen ? "w-56 border-r border-bone-200 p-3" : "w-0 p-0"
          }`}
        >
          <ul className="space-y-0.5">
            {SCREENS.map((name, i) => {
              const active = screen === name;
              return (
                <li key={name}>
                  <button
                    onClick={() => setScreen(name)}
                    className={`group flex w-full items-baseline gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      active
                        ? "bg-white text-stone-900 shadow-sm"
                        : "text-stone-500 hover:bg-bone-50 hover:text-stone-800"
                    }`}
                  >
                    <span
                      className={`text-[10px] tabular-nums [font-family:ui-monospace,Consolas,monospace] ${
                        active
                          ? "font-bold text-sky-500"
                          : "text-bone-300 group-hover:text-stone-400"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{name}</span>
                    {name === "Records" && records.length > 0 && (
                      <span className="rounded-full bg-bone-200 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-stone-500">
                        {records.length}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
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
            <DailyLog onSaved={handleSaved} records={records} />
          ) : screen === "Body Signals" ? (
            <BodySignals records={records} onImported={handleSaved} />
          ) : screen === "Trigger Insights" ? (
            <TriggerInsights records={records} />
          ) : screen === "Progress" ? (
            <Progress records={records} />
          ) : screen === "Phenotype" ? (
            <Phenotype />
          ) : screen === "Patient History" ? (
            <PatientHistory recordCount={records.length} />
          ) : (
            <RecordsLog records={records} lastSavedDay={lastSavedDay} />
          )}
        </main>
      </div>
    </div>
  );
}
