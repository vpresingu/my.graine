import { beforeAfterImpact, midasGrade, midasScore } from "../lib/metrics";
import { useCountUp } from "../hooks/useCountUp";

// Semi-circular gauge, drawn by hand. The needle fraction is score relative
// to a practical ceiling (a third of the theoretical max), so typical scores
// use the full sweep.
export default function DisabilityGauge({ records }) {
  const { score, windowDays } = midasScore(records);
  const { grade, label } = midasGrade(score);
  const shown = useCountUp(score);
  const comparison = beforeAfterImpact(records);

  const R = 70;
  const CX = 90;
  const CY = 85;
  const circumference = Math.PI * R; // semicircle
  const ceiling = Math.max(windowDays, 30); // ~1 impact-point/day ceiling
  const frac = Math.min(score / ceiling, 1);

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={100}>
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="#f2543f"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.9s ease-out" }}
        />
        <text
          x={CX}
          y={CY - 14}
          textAnchor="middle"
          className="fill-slate-800"
          fontSize={30}
          fontWeight={600}
        >
          {shown}
        </text>
        <text x={CX} y={CY + 4} textAnchor="middle" className="fill-slate-400" fontSize={11}>
          MIDAS-style · {windowDays}d
        </text>
      </svg>
      <p className="mt-1 text-sm font-medium text-slate-700">
        Grade {grade} — {label}
      </p>
      {comparison && (
        <p className="mt-2 text-xs text-slate-400">
          Avg impact/day{" "}
          <span className="font-semibold text-slate-600">
            {comparison.before.toFixed(2)}
          </span>{" "}
          before preventive ·{" "}
          <span
            className={`font-semibold ${
              comparison.after < comparison.before
                ? "text-emerald-600"
                : "text-coral-600"
            }`}
          >
            {comparison.after.toFixed(2)}
          </span>{" "}
          after
        </p>
      )}
    </div>
  );
}
