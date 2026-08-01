import { useEffect, useState } from "react";

// Honest waiting: local inference on a large model takes real time on a cold
// cache, so show elapsed seconds instead of an anonymous spinner.
export default function ModelLoading({ message = "reasoning locally…" }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-coral-200 border-t-coral-500" />
      <p className="animate-pulse text-sm text-slate-400">{message}</p>
      <p className="text-xs tabular-nums text-slate-300">
        {elapsed}s — first run loads the model; later visits are instant
      </p>
    </div>
  );
}
