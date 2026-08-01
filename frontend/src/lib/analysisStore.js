// Module-level store for expensive model calls. Lives outside React so
// results and in-flight requests survive screen unmounts (switching tabs no
// longer restarts a 30s+ model run), and duplicate effect invocations
// (React StrictMode in dev) share one request.

const store = new Map(); // key -> Promise
const startedAt = new Map(); // key -> ms timestamp of the in-flight request

export function fetchAnalysis(key, url, options = {}) {
  const existing = store.get(key);
  if (existing) return existing;
  startedAt.set(key, Date.now());
  const promise = fetch(url, options)
    .then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${r.status}`);
      }
      return r.json();
    })
    .catch((e) => {
      store.delete(key); // never cache errors — a retry should re-request
      startedAt.delete(key);
      throw e;
    });
  store.set(key, promise);
  return promise;
}

// When the in-flight request for `key` began, so a loading UI can show true
// elapsed time that survives tab switches (the component remounts, but the
// request — and this timestamp — do not restart).
export function analysisStartedAt(key) {
  return startedAt.get(key) ?? null;
}

// Call whenever the timeline changes (day saved, demo reset) so every screen
// re-fetches fresh results on next view.
export function invalidateAnalyses() {
  store.clear();
  startedAt.clear();
}
