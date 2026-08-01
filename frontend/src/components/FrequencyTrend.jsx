import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { firstPreventiveDay, trailing28Series } from "../lib/metrics";

// Label pinned in the chart's reserved top margin (above viewBox.y, where the
// plot area begins), so it can never touch the area/line. White backing keeps
// it legible over gridlines.
function PreventiveLabel({ viewBox }) {
  const cx = viewBox.x;
  return (
    <g>
      <rect x={cx - 52} y={viewBox.y - 24} width={104} height={17} rx={4} fill="#ffffff" opacity={0.95} />
      <text x={cx} y={viewBox.y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f172a">
        preventive started
      </text>
    </g>
  );
}

export default function FrequencyTrend({ records, fullRecords }) {
  // Compute over the full diary (the trailing window needs a 28-day run-up),
  // then clip the display to the scoped range — a 30d scope still shows a
  // full-density line instead of 3 points.
  const all = fullRecords ?? records;
  const firstShown = records[0]?.day ?? 0;
  const series = trailing28Series(all).filter((p) => p.day >= firstShown);
  const preventiveDay = firstPreventiveDay(all);
  const showRef = preventiveDay !== null && preventiveDay >= firstShown;

  if (series.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Needs at least 28 recorded days.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series} margin={{ top: 28, right: 12, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="freqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f2543f" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f2543f" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v) => [`${v} migraine days`, "trailing 28d"]}
          labelFormatter={(day) => `Day ${day}`}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
        />
        {showRef && (
          <ReferenceLine
            x={preventiveDay}
            stroke="#0f172a"
            strokeDasharray="4 4"
            label={<PreventiveLabel />}
          />
        )}
        <Area
          type="monotone"
          dataKey="count"
          stroke="#f2543f"
          strokeWidth={2}
          fill="url(#freqFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
