// Custom SVG lag visualizer: prior-night sleep (x) vs that day's severity (y)
// — each record pairs a night with the following day, so this is the ~24h lag.
// Migraine days in coral; the short-sleep region below 5.5h is shaded.

const W = 560;
const H = 260;
const M = { left: 42, right: 14, top: 14, bottom: 38 };
const THRESHOLD = 5.5;

export default function SleepScatter({ records }) {
  const pts = records.filter((r) => r.sleep_hours_prev_night !== null);
  if (!pts.length) return null;

  const xs = pts.map((r) => r.sleep_hours_prev_night);
  const xMin = Math.floor(Math.min(...xs) - 0.5);
  const xMax = Math.ceil(Math.max(...xs) + 0.5);
  const x = (v) => M.left + ((v - xMin) / (xMax - xMin)) * (W - M.left - M.right);
  const y = (v) => M.top + (1 - v / 10) * (H - M.top - M.bottom);

  // Deterministic jitter so identical (sleep, severity) pairs don't stack.
  const jx = (day) => (((day * 7) % 11) - 5) / 1.6;
  const jy = (day) => (((day * 13) % 7) - 3) / 1.1;

  const xTicks = [];
  for (let t = xMin; t <= xMax; t++) xTicks.push(t);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sleep vs next-day severity scatter plot">
        {/* short-sleep shaded band */}
        <rect
          x={x(xMin)}
          y={M.top}
          width={x(THRESHOLD) - x(xMin)}
          height={H - M.top - M.bottom}
          fill="#fff0ed"
        />
        <line
          x1={x(THRESHOLD)}
          y1={M.top}
          x2={x(THRESHOLD)}
          y2={H - M.bottom}
          stroke="#fb7a68"
          strokeDasharray="4 4"
        />
        <text x={x(THRESHOLD) - 6} y={M.top + 12} textAnchor="end" fontSize={11} fill="#dd3a25">
          short sleep &lt; 5.5h
        </text>

        {/* axes */}
        {[0, 2, 4, 6, 8, 10].map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} y1={y(t)} x2={W - M.right} y2={y(t)} stroke="#f1f5f9" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {t}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#64748b">
          prior-night sleep (hours)
        </text>
        <text
          x={12}
          y={(M.top + H - M.bottom) / 2}
          textAnchor="middle"
          fontSize={11}
          fill="#64748b"
          transform={`rotate(-90 12 ${(M.top + H - M.bottom) / 2})`}
        >
          next-day severity
        </text>

        {/* points — non-migraine first so migraine dots render on top */}
        {pts
          .filter((r) => !r.migraine)
          .map((r) => (
            <circle
              key={r.day}
              cx={x(r.sleep_hours_prev_night) + jx(r.day)}
              cy={y(r.severity_0to10) + jy(r.day)}
              r={4.5}
              fill="#cbd5e1"
              opacity={0.7}
            >
              <title>{`Day ${r.day} · ${r.date} · slept ${r.sleep_hours_prev_night}h · no migraine`}</title>
            </circle>
          ))}
        {pts
          .filter((r) => r.migraine)
          .map((r) => (
            <circle
              key={r.day}
              cx={x(r.sleep_hours_prev_night) + jx(r.day)}
              cy={y(r.severity_0to10) + jy(r.day)}
              r={5}
              fill="#f2543f"
              opacity={0.9}
              stroke="#fff"
              strokeWidth={1}
            >
              <title>{`Day ${r.day} · ${r.date} · slept ${r.sleep_hours_prev_night}h · migraine, severity ${r.severity_0to10}/10`}</title>
            </circle>
          ))}
      </svg>
      <div className="mt-2 flex items-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-coral-500" /> migraine day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-300" /> no migraine
        </span>
        <span className="ml-auto italic text-slate-400">
          hover a point for details
        </span>
      </div>
    </div>
  );
}
