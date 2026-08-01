import { useMemo, useState } from "react";
import CalendarHeatmap from "./CalendarHeatmap";
import DisabilityGauge from "./DisabilityGauge";
import FrequencyTrend from "./FrequencyTrend";
import WellbeingChart from "./WellbeingChart";
import { CountUpNumber, Delta, KpiTile } from "./KpiTile";
import {
  avgSeverityOnAttackDays,
  formatDate,
  migraineDayCount,
  scopeRecords,
} from "../lib/metrics";

const SCOPES = ["30", "90", "all"];

function Card({ title, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function ResponderTile({ progress }) {
  if (progress.state === "loading") {
    return (
      <span className="inline-block animate-pulse rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
        Analyzing on-device…
      </span>
    );
  }
  if (progress.state === "error") {
    return (
      <span className="inline-block rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
        Unavailable — {progress.message}
      </span>
    );
  }
  const { responder, pct_change } = progress.data;
  return responder ? (
    <span className="inline-block rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
      Responding — {Math.abs(Math.round(pct_change))}% fewer
    </span>
  ) : (
    <span className="inline-block rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-500">
      Not yet responding ({Math.round(pct_change)}%)
    </span>
  );
}

export default function Dashboard({ records, stats, progress }) {
  const [scope, setScope] = useState("all");
  const [selectedDay, setSelectedDay] = useState(null);

  const scoped = useMemo(() => scopeRecords(records, scope), [records, scope]);
  // KPI window follows the scope; delta compares the equally-sized window
  // immediately before it (null when the diary isn't long enough).
  const win = scoped.length;
  const prior = useMemo(
    () => records.slice(-2 * win, -win),
    [records, win]
  );
  const currentCount = migraineDayCount(scoped);
  const priorCount = prior.length === win ? migraineDayCount(prior) : null;
  const severityNow = avgSeverityOnAttackDays(scoped);
  const severityPrior =
    prior.length === win ? avgSeverityOnAttackDays(prior) : null;
  const severityDelta =
    severityNow !== null && severityPrior !== null
      ? +(severityNow - severityPrior).toFixed(1)
      : null;
  const selected = records.find((r) => r.day === selectedDay);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          Dashboard
          <span className="ml-2 text-sm font-normal text-slate-400">
            {stats ? `${stats.total_days} days · ${stats.migraine_days} migraine days total` : ""}
          </span>
        </h2>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${
                scope === s
                  ? "bg-coral-500 text-white"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "all" ? "All" : `${s}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          label={`Migraine days · last ${win} recorded`}
          sub={<Delta value={priorCount !== null ? currentCount - priorCount : null} windowLabel={`prior ${win}`} />}
        >
          <CountUpNumber value={currentCount} />
        </KpiTile>
        <KpiTile
          label="Avg severity on attack days"
          sub={
            severityDelta === null ? (
              <span className="text-xs text-slate-300">no prior window</span>
            ) : (
              <Delta value={severityDelta} unit=" pts" windowLabel={`prior ${win}`} />
            )
          }
        >
          <CountUpNumber value={severityNow} decimals={1} suffix="/10" />
        </KpiTile>
        <KpiTile label="Preventive response" sub="from on-device analysis of the full diary">
          <ResponderTile progress={progress} />
        </KpiTile>
      </div>

      <Card title="Migraine calendar — full record, colored by severity">
        <div className="overflow-x-auto pb-1">
          <CalendarHeatmap
            records={scoped}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </div>
        {selected && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-700">
              {formatDate(selected.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}{" "}
              <span className="font-normal text-slate-400">· day {selected.day}</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-slate-600 sm:grid-cols-4">
              <span>
                {selected.migraine
                  ? `Migraine · ${selected.severity_0to10}/10 · ${selected.phase}`
                  : "No migraine"}
              </span>
              <span>Wellbeing {selected.wellbeing_1to10}/10</span>
              <span>Slept {selected.sleep_hours_prev_night}h</span>
              <span>Stress {selected.stress_1to10}/10</span>
            </div>
            {selected.symptoms.length > 0 && (
              <p className="mt-1.5 text-slate-500">
                Symptoms: {selected.symptoms.join(", ")}
              </p>
            )}
            {(selected.meds_acute || selected.meds_preventive) && (
              <p className="mt-0.5 text-slate-500">
                Meds: {[selected.meds_acute, selected.meds_preventive].filter(Boolean).join(" · ")}
              </p>
            )}
            {selected.notes && (
              <p className="mt-1.5 italic text-slate-400">“{selected.notes}”</p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Migraine frequency — trailing 28 days">
          <FrequencyTrend records={scoped} fullRecords={records} />
        </Card>
        <Card title="Daily wellbeing (migraine days marked)">
          <WellbeingChart records={scoped} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Disability" className="lg:col-span-1">
          <DisabilityGauge records={scoped} />
        </Card>
        <Card title="About these numbers" className="lg:col-span-2">
          <p className="text-sm leading-relaxed text-slate-500">
            Everything on this screen is computed locally from your {records.length}
            -day diary. The 30 / 90 / All control rescopes the whole screen: the
            KPIs cover the last {win} recorded days and compare against the
            equally-sized window before them, and the calendar and charts redraw
            to match. The preventive-response badge comes from the on-device model
            comparing migraine frequency before and after your preventive
            medication started — it organizes your data and is not medical advice.
          </p>
        </Card>
      </div>
    </div>
  );
}
