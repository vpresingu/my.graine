"""Warm every model cache so the app demos instantly.

Run after starting the backend (and any time the data changes):

    python warm.py

Calls the four analysis endpoints in sequence — Ollama answers one request at
a time, so sequential is optimal — and reports timing. Safe to re-run: warm
endpoints return in milliseconds.
"""

import sys
import time

import httpx

BASE = "http://127.0.0.1:8000"
ENDPOINTS = ["triggers", "progress", "phenotype", "history"]


def main() -> int:
    failed = False
    for name in ENDPOINTS:
        start = time.perf_counter()
        try:
            r = httpx.post(f"{BASE}/api/{name}", timeout=600)
            elapsed = time.perf_counter() - start
            if r.status_code == 200:
                print(f"  {name:<10} warm ({elapsed:5.1f}s)")
            else:
                failed = True
                detail = r.json().get("detail", r.text[:200])
                print(f"  {name:<10} FAILED HTTP {r.status_code}: {detail}")
        except httpx.HTTPError as exc:
            failed = True
            print(f"  {name:<10} FAILED: {exc}")
    print("Caches warm - screens will load instantly." if not failed else
          "Some endpoints failed - is the backend (and Ollama) running?")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
