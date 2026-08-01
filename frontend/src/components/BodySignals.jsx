import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pct, rateLift } from "../lib/metrics";
import { KpiTile, CountUpNumber } from "./KpiTile";

// Body Signals: objective wearable data (Apple Health export) joined to the
// diary. The import happens entirely on this device — the file is parsed in
// memory by the backend and only per-day numbers are kept.

function ImportZone({ onImported, compact }) {
  const [state, setState] = useState(null); // null | "uploading" | {summary} | {error}
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const upload = useCallback(
    async (file) => {
      if (!file) return;
      setState("uploading");
      const body = new FormData();
      body.append("file", file);
      try {
        const r = await fetch("/api/import/health", { method: "POST", body });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
        setState({ summary: data });
        onImported();
      } catch (e) {
        setState({ error: e.message });
      }
    },
    [onImported]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        upload(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed text-center transition-colors ${
        compact ? "p-5" : "p-10"
      } ${
        dragOver
          ? "border-sky-400 bg-sky-50"
          : "border-bone-300 bg-white hover:border-stone-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.xml"
        className="hidden"
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = ""; // else re-picking the same file fires no event
        }}
      />
      {state === "uploading" ? (
        <p className="text-sm font-medium text-stone-500">Parsing on this device…</p>
      ) : state?.summary ? (
        <div className="text-sm text-stone-600">
          <p className="font-semibold text-emerald-700">
            ✓ Imported {state.summary.days_matched} days
          </p>
          <p className="mt-1 text-stone-500">
            sleep ×{state.summary.signals.sleep} · HRV ×{state.summary.signals.hrv} ·
            resting HR ×{state.summary.signals.resting_hr} · steps ×
            {state.summary.signals.steps}
            {state.summary.days_unmatched > 0 &&
              ` · ${state.summary.days_unmatched} days outside the diary skipped`}
          </p>
        </div>
      ) : (
        <>
          <p className={`font-semibold text-stone-700 ${compact ? "text-sm" : ""}`}>
            {state?.error ? (
              <span className="text-sky-600">{state.error}</span>
            ) : (
              "Drop your Apple Health export here"
            )}
          </p>
          <p className="mt-1.5 text-sm text-stone-400">
            Health app → profile picture → Export All Health Data → drop the
            export.zip. Parsed locally; nothing leaves this device.
          </p>
        </>
      )}
    </div>
  );
}

// One wearable evidence row as a card: watch signal -> next-day migraine rate
// vs baseline, with the definition of the deviation spelled out.
function SignalCard({ row }) {
  const isHrv = row.factor.startsWith("hrv");
  const lift = rateLift(row.rate_exposed, row.rate_baseline);
  return (
    <div className="rounded-2xl border border-bone-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-stone-800">
        {isHrv ? "HRV dip" : "Elevated resting heart rate"}{" "}
        <span className="font-normal text-stone-400">→ migraine, ~24h later</span>
      </h3>
      <p className="mt-0.5 text-sm text-stone-500">
        {row.n_followed_by_migraine} of {row.n_exposed}{" "}
        {isHrv ? "low-HRV days" : "elevated-HR days"} were followed by a migraine
      </p>
      <div className="mt-4 space-y-2">
        {[
          ["after this signal", row.rate_exposed, "bg-sky-500"],
          ["all other days", row.rate_baseline, "bg-bone-300"],
        ].map(([label, rate, color]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-stone-400">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-bone-100">
              <div
                className={`h-full rounded-full ${color} transition-all duration-700`}
                style={{ width: pct(rate) }}
              />
            </div>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-stone-600">
              {pct(rate)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-stone-500">
        {lift >= 2 && (
          <span className="font-semibold text-stone-700">
            {lift.toFixed(1)}× the baseline rate.{" "}
          </span>
        )}
        {row.confounding_note}
      </p>
    </div>
  );
}

function HrvChart({ records, threshold }) {
  const data = records
    .filter((r) => r.hrv_ms !== null && r.hrv_ms !== undefined)
    .map((r) => ({
      day: r.day,
      hrv: r.hrv_ms,
      migraineHrv: r.migraine ? r.hrv_ms : null,
      date: r.date,
    }));
  if (data.length < 2) return null;

  return (
    <div className="rounded-2xl border border-bone-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-stone-800">Heart-rate variability, day by day</h3>
      <p className="mb-3 mt-0.5 text-sm text-stone-500">
        Watch-measured daily HRV; migraine days highlighted in blue. Dips below
        your personal threshold tend to come first.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eae5db" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#a8a29e" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            tickLine={false}
            axisLine={false}
            unit="ms"
            domain={["dataMin - 4", "dataMax + 4"]}
          />
          <Tooltip
            formatter={(v, name) => [
              `${v} ms`,
              name === "migraineHrv" ? "HRV (migraine day)" : "HRV",
            ]}
            labelFormatter={(day) => `Day ${day}`}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#eae5db" }}
          />
          {threshold && (
            <ReferenceLine
              y={threshold}
              stroke="#0ea5e9"
              strokeDasharray="4 4"
              label={<ThresholdLabel text={`dip threshold ${threshold}ms`} />}
            />
          )}
          <Line
            type="monotone"
            dataKey="hrv"
            stroke="#78716c"
            strokeWidth={1.5}
            dot={false}
          />
          <Scatter dataKey="migraineHrv" fill="#0ea5e9" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// White-backed threshold caption pinned just above its dashed line — plain
// inline labels collide with the data (same trick as FrequencyTrend's
// change-point label).
function ThresholdLabel({ viewBox, text }) {
  const x = viewBox.x + 10;
  const y = viewBox.y - 9;
  return (
    <g>
      <rect
        x={x - 5}
        y={y - 11}
        width={text.length * 6.1 + 10}
        height={16}
        rx={4}
        fill="#ffffff"
        opacity={0.92}
      />
      <text x={x} y={y + 1} fontSize={11} fill="#0284c7">
        {text}
      </text>
    </g>
  );
}

function SleepChart({ records }) {
  const data = records
    .filter((r) => r.sleep_hours_prev_night !== null && r.sleep_hours_prev_night !== undefined)
    .map((r) => ({
      day: r.day,
      sleep: r.sleep_hours_prev_night,
      migraine: r.migraine,
    }));
  if (data.length < 2) return null;

  return (
    <div className="rounded-2xl border border-bone-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-stone-800">Sleep, night by night</h3>
      <p className="mb-3 mt-0.5 text-sm text-stone-500">
        Measured sleep per night — blue bars are nights that led into a migraine
        day. Short nights fall under the dashed 5.5h line.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eae5db" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#a8a29e" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            tickLine={false}
            axisLine={false}
            unit="h"
            domain={[0, "dataMax + 1"]}
          />
          <Tooltip
            formatter={(v, _name, item) => [
              `${v} h${item?.payload?.migraine ? " · migraine day" : ""}`,
              "slept",
            ]}
            labelFormatter={(day) => `Day ${day}`}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#eae5db" }}
          />
          <ReferenceLine
            y={5.5}
            stroke="#0ea5e9"
            strokeDasharray="4 4"
            label={<ThresholdLabel text="short sleep < 5.5h" />}
          />
          <Bar dataKey="sleep" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.day} fill={d.migraine ? "#0ea5e9" : "#d8d1c2"} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function BodySignals({ records, onImported }) {
  const [summary, setSummary] = useState(null);
  // Any wearable signal counts — a phone-only export has steps/sleep but no
  // HRV (that needs a watch), and must still unlock the screen.
  const hasData = records.some(
    (r) => r.hrv_ms != null || r.resting_hr != null || r.steps != null
  );

  const loadSummary = useCallback(() => {
    fetch("/api/wearables/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    if (hasData) loadSummary();
  }, [hasData, records, loadSummary]);

  const handleImported = useCallback(() => {
    onImported();
    loadSummary();
  }, [onImported, loadSummary]);

  if (!hasData) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-lg font-bold text-stone-800">Body Signals</h2>
          <p className="mt-1 text-sm text-stone-500">
            Your watch has been recording sleep, heart-rate variability, and
            resting heart rate all along. Import it once and the diary gains an
            objective layer — no extra logging, ever.
          </p>
        </div>
        <ImportZone onImported={handleImported} />
      </div>
    );
  }

  const sawItComing =
    summary && summary.migraines_with_prior_day_data > 0
      ? `${summary.migraines_preceded_by_hrv_dip} of ${summary.migraines_with_prior_day_data}`
      : null;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-800">Body Signals</h2>
          <p className="mt-1 text-sm text-stone-500">
            Objective watch data joined to your diary, compared against your own
            baselines. Patterns in your history — not a diagnosis.
          </p>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile
            label="Your watch saw it coming"
            sub="migraines preceded by an HRV dip the day before"
          >
            <span className="text-3xl font-semibold tabular-nums text-stone-800">
              {sawItComing ?? "–"}
            </span>
          </KpiTile>
          <KpiTile label="HRV baseline" sub="your median daily HRV (SDNN)">
            <CountUpNumber value={summary.hrv_baseline_ms} decimals={1} suffix="ms" />
          </KpiTile>
          <KpiTile label="Resting HR baseline" sub="your median resting heart rate">
            <CountUpNumber value={summary.rhr_baseline_bpm} decimals={1} suffix="bpm" />
          </KpiTile>
          <KpiTile label="Days with watch data" sub="of the diary covered">
            <CountUpNumber value={summary.days_with_data} />
          </KpiTile>
        </div>
      )}

      <HrvChart records={records} threshold={summary?.hrv_dip_threshold_ms} />
      <SleepChart records={records} />

      {summary?.evidence?.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.evidence.map((row) => (
            <SignalCard key={row.factor} row={row} />
          ))}
        </div>
      )}

      <ImportZone onImported={handleImported} compact />
    </div>
  );
}
