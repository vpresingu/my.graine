// Module-level store for expensive model calls. Lives outside React so
// results and in-flight requests survive screen unmounts (switching tabs no
// longer restarts a 30s+ model run), and duplicate effect invocations
// (React StrictMode in dev) share one request.

const store = new Map(); // key -> Promise

export function fetchAnalysis(key, url, options = {}) {
  const existing = store.get(key);
  if (existing) return existing;
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
      throw e;
    });
  store.set(key, promise);
  return promise;
}

// Call whenever the timeline changes (day saved, demo reset) so every screen
// re-fetches fresh results on next view.
export function invalidateAnalyses() {
  store.clear();
}
