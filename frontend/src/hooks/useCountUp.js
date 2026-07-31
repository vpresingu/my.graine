import { useEffect, useState } from "react";

// Animates from 0 (or the previous value) toward `target` with ease-out.
export function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === null || target === undefined || Number.isNaN(target)) return;
    let raf;
    const from = 0;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (target === null || target === undefined) return null;
  return decimals ? value.toFixed(decimals) : Math.round(value);
}
