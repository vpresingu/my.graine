import { useMemo, useState } from "react";
import { formatDate } from "../lib/metrics";

const CELL = 20;
const GAP = 5; // roomy enough for the month divider line to breathe
const STEP = CELL + GAP;
const LEFT = 38; // month label gutter
const TOP = 16; // weekday label row
const NO_MIGRAINE = "#e2e8f0";
// Deepening coral by severity bucket (1-2, 3-4, 5-6, 7-8, 9-10).
const SEVERITY_COLORS = ["#ffc9c2", "#ffa396", "#fb7a68", "#f2543f", "#b92e1c"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cellColor(rec) {
  if (!rec.migraine) return NO_MIGRAINE;
  const bucket = Math.min(Math.ceil(Math.max(rec.severity_0to10, 1) / 2), 5) - 1;
  return SEVERITY_COLORS[bucket];
}

export default function CalendarHeatmap({ records, selectedDay, onSelectDay }) {
  const [hover, setHover] = useState(null);

  const { cells, monthLabels, monthStarts, rows } = useMemo(() => {
    if (!records.length)
      return { cells: [], monthLabels: [], monthStarts: [], rows: 0 };
    const firstDate = new Date(records[0].date + "T00:00:00");
    const firstCol = (firstDate.getDay() + 6) % 7; // Monday = column 0
    const cells = records.map((rec) => {
      const d = new Date(rec.date + "T00:00:00");
      const offset = Math.round((d - firstDate) / 86400000);
      return {
        rec,
        col: (firstCol + offset) % 7, // weekday, left→right
        row: Math.floor((firstCol + offset) / 7), // week, top→bottom
        month: d.getMonth(),
        dayOfMonth: d.getDate(),
      };
    });
    // Month name beside the week-row where each month starts, and the cell
    // where each later month begins (for the stepped divider line).
    const monthLabels = [];
    const monthStarts = [];
    let lastLabeledRow = -2;
    for (const c of cells) {
      if ((c.dayOfMonth === 1 || monthLabels.length === 0) && c.row >= lastLabeledRow + 2) {
        monthLabels.push({ row: c.row, label: MONTHS[c.month] });
        lastLabeledRow = c.row;
      }
      if (c.dayOfMonth === 1 && c !== cells[0]) monthStarts.push({ row: c.row, col: c.col });
    }
    return {
      cells,
      monthLabels,
      monthStarts,
      rows: Math.max(...cells.map((c) => c.row)) + 1,
    };
  }, [records]);

  const width = LEFT + 7 * STEP;
  const height = TOP + rows * STEP;

  return (
    <div className="relative flex items-start gap-4">
      <svg width={width} height={height} className="shrink-0" role="img" aria-label="Migraine calendar heatmap">
        {WEEKDAYS.map((label, i) => (
          <text
            key={i}
            x={LEFT + i * STEP + CELL / 2}
            y={TOP - 5}
            textAnchor="middle"
            className="fill-slate-400"
            fontSize={10}
          >
            {label}
          </text>
        ))}
        {/* Stepped month dividers — trace the true boundary, breaking
            mid-week when a month starts mid-row. */}
        {monthStarts.map(({ row, col }) => {
          const yTop = TOP + row * STEP - GAP / 2;
          const xRight = LEFT + 7 * STEP - GAP + 2;
          const xLeft = LEFT - 2;
          const d =
            col === 0
              ? `M ${xLeft} ${yTop} H ${xRight}`
              : `M ${xRight} ${yTop} H ${LEFT + col * STEP - GAP / 2} V ${
                  TOP + (row + 1) * STEP - GAP / 2
                } H ${xLeft}`;
          return (
            <path
              key={`sep${row}-${col}`}
              d={d}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {monthLabels.map(({ row, label }) => (
          <text
            key={`m${row}`}
            x={0}
            y={TOP + row * STEP + CELL - 5}
            fontSize={10}
            fontWeight={600}
            className="fill-slate-500"
          >
            {label}
          </text>
        ))}
        {cells.map(({ rec, row, col }) => (
          <rect
            key={rec.day}
            x={LEFT + col * STEP}
            y={TOP + row * STEP}
            width={CELL}
            height={CELL}
            rx={4}
            fill={cellColor(rec)}
            stroke={selectedDay === rec.day ? "#0f172a" : "none"}
            strokeWidth={selectedDay === rec.day ? 2 : 0}
            className="cursor-pointer"
            onMouseEnter={() => setHover({ rec, y: TOP + row * STEP })}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectDay(selectedDay === rec.day ? null : rec.day)}
          />
        ))}
      </svg>

      {/* Details beside the calendar — never covers the grid. */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
          style={{
            left: width + 12,
            top: Math.max(0, Math.min(hover.y - 12, height - 100)),
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

      <div className="mt-4 flex flex-col gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="mr-1">No migraine</span>
          <span className="h-3 w-3 rounded-sm" style={{ background: NO_MIGRAINE }} />
          {SEVERITY_COLORS.map((c) => (
            <span key={c} className="h-3 w-3 rounded-sm" style={{ background: c }} />
          ))}
          <span className="ml-1">Severe</span>
        </div>
        <p className="italic">hover a day for details · click to pin it below</p>
      </div>
    </div>
  );
}
