# My-Graine

A **one-device, fully offline migraine intelligence journal**.

My-Graine is a local-only app for logging migraine episodes, triggers, and
patterns — and for getting on-device insights about them. Everything runs on
your machine: the database, the web UI, and the language model. No cloud, no
accounts, no telemetry, no network calls at runtime (the only network traffic
is to `localhost`).

## Architecture

```
My-Graine/
├── backend/    Python FastAPI app — serves the API under /api and the built frontend
└── frontend/   React + Vite + Tailwind single-page app
```

- The backend listens on `http://localhost:8000` and exposes all endpoints
  under the `/api` prefix (e.g. `GET /api/health`).
- In production mode the backend also serves the built frontend from
  `frontend/dist`.
- In dev mode the Vite dev server (`http://localhost:5173`) proxies `/api`
  requests to the backend.

## Running it

### 1. Install backend dependencies

```
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
```

### 2. Install frontend dependencies

```
cd frontend
npm install
```

### 3. Start in dev mode (two terminals)

```
# Terminal 1 — backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Then open http://localhost:5173.

Or, if you have `make`:

```
make dev
```

### 4. Production build

```
make build          # or: cd frontend && npm run build
```

Then run only the backend — it will serve the built app at
http://localhost:8000.

## How we use Gemma 4

> _Placeholder — to be written._
>
> My-Graine talks to a locally running [Ollama](https://ollama.com) server at
> `http://localhost:11434` via `backend/gemma.py` (default model: `gemma4`).
> This is the **only** model access in the app — there is no cloud LLM client
> and no fallback to any remote service.

## Constraints (by design)

- Works with no internet access.
- No analytics, telemetry, or third-party network SDKs.
- The only model access is local Ollama via `backend/gemma.py`.
