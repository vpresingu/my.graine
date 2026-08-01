import { useEffect, useState } from "react";

// Honest waiting: local inference on a large model takes real time on a cold
// cache, so show elapsed seconds instead of an anonymous spinner. Pass `since`
// (a start timestamp from analysisStartedAt) so the count reflects the real
// request age and survives tab switches instead of resetting to 0 on remount.
export default function ModelLoading({
  message = "reasoning locally…",
  since,
  estimate = "This can take up to a minute on the first run",
}) {
  const [elapsed, setElapsed] = useState(
    since ? Math.floor((Date.now() - since) / 1000) : 0
  );
  useEffect(() => {
    const tick = () =>
      setElapsed(since ? Math.floor((Date.now() - since) / 1000) : (s) => s + 1);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
      <p className="animate-pulse text-sm text-slate-400">{message}</p>
      <p className="text-xs tabular-nums text-slate-300">{elapsed}s elapsed</p>
      <p className="max-w-sm text-xs text-slate-300">
        {estimate}. It runs entirely on this device — later visits are instant.
      </p>
    </div>
  );
}
