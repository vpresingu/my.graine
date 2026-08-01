import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Renders a dot only on migraine days.
function MigraineDot({ cx, cy, payload }) {
  if (!payload.migraine) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill="#0ea5e9" stroke="#fff" strokeWidth={1} />;
}

export default function WellbeingChart({ records }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={records} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} />
        <YAxis
          domain={[1, 10]}
          ticks={[1, 4, 7, 10]}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v, name, item) => [
            `${v}/10${item?.payload?.migraine ? " · migraine day" : ""}`,
            "wellbeing",
          ]}
          labelFormatter={(day) => `Day ${day}`}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
        />
        <Line
          type="monotone"
          dataKey="wellbeing_1to10"
          stroke="#64748b"
          strokeWidth={1.5}
          dot={<MigraineDot />}
          activeDot={{ r: 4, fill: "#0f172a" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
