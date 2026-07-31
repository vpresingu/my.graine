import { useMemo, useState } from "react";
import { formatDate } from "../lib/metrics";

const CELL = 15;
const GAP = 3;
const STEP = CELL + GAP;
const NO_MIGRAINE = "#e2e8f0";
// Deepening coral by severity bucket (1-2, 3-4, 5-6, 7-8, 9-10).
const SEVERITY_COLORS = ["#ffc9c2", "#ffa396", "#fb7a68", "#f2543f", "#b92e1c"];
const WEEKDAY_LABELS = ["Mon", "Wed", "Fri"];

function cellColor(rec) {
  if (!rec.migraine) return NO_MIGRAINE;
  const bucket = Math.min(Math.ceil(Math.max(rec.severity_0to10, 1) / 2), 5) - 1;
  return SEVERITY_COLORS[bucket];
}

export default function CalendarHeatmap({ records, selectedDay, onSelectDay }) {
  const [hover, setHover] = useState(null);

  const cells = useMemo(() => {
    if (!records.length) return [];
    const firstDate = new Date(records[0].date + "T00:00:00");
    const firstRow = (firstDate.getDay() + 6) % 7; // Monday = row 0
    return records.map((rec) => {
      const d = new Date(rec.date + "T00:00:00");
      const offset = Math.round((d - firstDate) / 86400000);
      const row = (firstRow + offset) % 7;
      const col = Math.floor((firstRow + offset) / 7);
      return { rec, row, col };
    });
  }, [records]);

  const cols = cells.length ? Math.max(...cells.map((c) => c.col)) + 1 : 0;
  const width = cols * STEP + 34;
  const height = 7 * STEP;

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label="Migraine calendar heatmap">
        {WEEKDAY_LABELS.map((label, i) => (
          <text
            key={label}
            x={0}
            y={i * 2 * STEP + CELL - 3}
            className="fill-slate-400"
            fontSize={10}
          >
            {label}
          </text>
        ))}
        {cells.map(({ rec, row, col }) => (
          <rect
            key={rec.day}
            x={34 + col * STEP}
            y={row * STEP}
            width={CELL}
            height={CELL}
            rx={3}
            fill={cellColor(rec)}
            stroke={selectedDay === rec.day ? "#0f172a" : "none"}
            strokeWidth={selectedDay === rec.day ? 2 : 0}
            className="cursor-pointer"
            onMouseEnter={() => setHover({ rec, x: 34 + col * STEP, y: row * STEP })}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectDay(selectedDay === rec.day ? null : rec.day)}
          />
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
          style={{
            left: Math.min(hover.x + STEP, width - 210),
            top: hover.y + STEP + 4,
          }}
        >
          <p className="font-semibold text-slate-700">
            {formatDate(hover.rec.date, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            <span className="ml-1 font-normal text-slate-400">day {hover.rec.day}</span>
          </p>
          {hover.rec.migraine ? (
            <p className="mt-1 text-slate-600">
              Migraine · severity {hover.rec.severity_0to10}/10 · {hover.rec.phase}
              {hover.rec.aura ? " · aura" : ""}
            </p>
          ) : (
            <p className="mt-1 text-slate-500">No migraine</p>
          )}
          <p className="mt-0.5 text-slate-400">
            wellbeing {hover.rec.wellbeing_1to10}/10 · slept{" "}
            {hover.rec.sleep_hours_prev_night}h
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <span className="mr-1">No migraine</span>
        <span className="h-3 w-3 rounded-sm" style={{ background: NO_MIGRAINE }} />
        {SEVERITY_COLORS.map((c) => (
          <span key={c} className="h-3 w-3 rounded-sm" style={{ background: c }} />
        ))}
        <span className="ml-1">Severe</span>
      </div>
    </div>
  );
}
