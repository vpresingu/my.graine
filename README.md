# My-Graine 🧠
 
**A fully on-device migraine intelligence journal — powered by Google's Gemma 4, running entirely on your machine. No cloud. No network. Your health data never leaves the device.**
 
> Built for **Build with Gemma NYC: On-Device AI for Healthcare** · Track: **On-Device Private Health Tools** · Model: **Gemma 4 (local, via Ollama)**
 
`On-device` · `Offline-first` · `Privacy by architecture` · `Decision support — not diagnosis` · `Synthetic data only`
 
---
 
### Built with
 
![Gemma 4](https://img.shields.io/badge/Gemma_4-Google_DeepMind-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local_inference-000000?style=for-the-badge&logo=ollama&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local_store-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-build-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-styling-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-charts-FF6B6B?style=for-the-badge)
 
---
 
## The 30-second version
 
Migraine is a chronic condition managed over months and years through a headache diary. The diary only helps if someone can *reason across it* — and no patient can hold three months of their own sleep, stress, cycle, and symptom data in their head and see that their attacks follow poor sleep at a 24-hour lag.
 
My-Graine does that reasoning **locally**. You log how you feel each day in plain language; Gemma 4, running on your own machine, turns it into a structured clinical record, finds your real triggers (and throws out the coincidences), tracks whether your treatment is working, and writes the doctor-ready history you could never assemble yourself.
 
**We were offered free cloud GPU inference for this hackathon and deliberately declined it for the product** — because the entire premise is that a person's most intimate health data never touches a server. You can verify this claim in the strongest possible way: **turn on airplane mode and the whole app still works.**
 
---
 
## Background: why migraine is the right problem
 
Migraine is not "just a headache." It is a chronic neurological disease, and its scale and burden are staggering — which is exactly why a tool that helps people manage it *over the long term* matters.
 
- **It's everywhere.** Migraine affects roughly **12% of people in the United States** and over a billion people worldwide, making it one of the most prevalent neurological conditions on earth.
- **It's genuinely disabling.** Migraine is among the **leading causes of years lived with disability globally, and the single leading cause of disability in people aged 15–49** — hitting people squarely in their prime education, working, and family-building years. It's not a nuisance; it's lost life.
- **It hits some people much harder.** The burden falls disproportionately on **women aged roughly 30–44**, driven in part by hormonal factors — which is why a menstrual-cycle signal is a first-class citizen in My-Graine's analysis, not an afterthought.
- **It's a marathon, not a moment.** An attack can last **4 to 72 hours** and unfolds across four phases (prodrome → aura → headache → postdrome). Migraine is classified as *episodic* (<15 headache days/month) or *chronic* (≥15). Managing it means tracking, adjusting, and re-evaluating across **months and years** — the definition of a long-term condition.
### Why long-term migraine sufferers are underserved
 
For someone living with migraine for years, the hardest questions are the ones no single doctor's visit can answer:
 
- **"What is actually triggering these?"** Triggers are personal, delayed (a bad night's sleep can cause an attack the *next* day), and tangled up with confounders. Sufferers keep diaries for months and still can't see the pattern — because the pattern is a *lagged, multi-factor correlation* buried in their own data, invisible to the person living it day to day.
- **"Is my treatment actually working?"** Migraine treatment is iterative — try a preventive, wait weeks, judge the response. Without rigorous before/after tracking, it's guesswork, and people stay on ineffective medications or abandon effective ones too early.
- **"How do I make my 15-minute appointment count?"** Neurologists rely on the patient's history, but patients arrive with fragmented memories, not organized evidence. The most valuable thing a long-term sufferer can bring to a visit is a clear, evidence-backed summary of their own trajectory — and almost no one has the tools to produce one.
My-Graine exists to answer exactly these three questions — **what's triggering this, is treatment working, and what should I tell my doctor** — from the patient's own longitudinal data, privately, on their own device. For someone who has spent years in the dark about their own condition, that's not a convenience. It's the difference between managing the disease and being managed by it.
 
---
 
## Why this *has* to be on-device
 
This isn't a privacy feature bolted onto a cloud app. On-device is the load-bearing precondition:
 
- **The signal only appears if the record is complete.** Finding a trigger requires months of sleep, mood, menstrual-cycle, and symptom data. A person will *never* stream that to a server — so a cloud tool never gets a complete enough record to find anything. Completeness requires privacy; privacy requires on-device.
- **Migraine data is among the most intimate health data there is.** Menstrual timing, mental-health dips, medication history. This is the category of data that should never leave the device — and here, it never does.
- **Take Gemma off the device and there is no product.** The local model *is* the engine.
That's why this belongs in the On-Device Private Health Tools track: the offline constraint isn't a limitation we worked around — it's the whole point.
 
---
 
## What it does — seven screens
 
| Screen | What it shows |
|---|---|
| **Dashboard** | Year-in-review: a custom SVG calendar heatmap of severity, trailing-28-day migraine frequency with the treatment start marked, wellbeing trend, a MIDAS-style disability gauge, and animated KPI tiles. |
| **Daily Log** | Log a day in plain language. Gemma extracts structured fields live and surfaces a **forward-looking risk flag** ("short night — elevated migraine risk in the next ~24h") learned from your history. |
| **Trigger Insights** | Ranked triggers with confidence and evidence — and the signature moment: a pattern that *looks* statistically strong gets **correctly rejected as a coincidence** because it's explained by a confounder. |
| **Progress** | Before/after treatment-response analysis at the medication change point, with a "responder" verdict (≥50% fewer migraine days) and an interactive change-point selector. |
| **Phenotype** | Organizes the history against recognized ICHD-3 migraine patterns for a clinician discussion — with a persistent, prominent "**does not diagnose**" disclaimer. |
| **Patient History** | A clinician-facing one-page summary generated by Gemma: onset, phenotype, triggers with evidence, treatment response, and questions to ask the doctor. Exportable locally. |
| **Records** | The full raw day-by-day log behind every chart — sortable, filterable, searchable. Proof the insights aren't smoke and mirrors. |
 
---
 
## How we use Gemma 4 (this is the core)
 
Gemma 4 is the reasoning engine across **five distinct jobs**, using the techniques the hackathon rubric names — prompting, function-calling / structured output, long-context, and on-device deployment:
 
1. **Extraction** *(function-calling / JSON mode)* — free-text daily note → a validated structured record (phase, aura, symptoms, severity, risk flags). Genuine clinical NLU, not string-matching.
2. **Trigger reasoning** *(long-context + confounder reasoning)* — reasons over the record to separate real triggers from coincidences. **Details below — this is our signature contribution.**
3. **Phenotyping** *(prompting + classification)* — maps the attack pattern to ICHD-3 categories as decision support, never as a diagnosis.
4. **Progress / treatment-response** *(long-context reasoning)* — compares periods around a medication change and encodes the clinical "responder" concept.
5. **Patient-history narrative** *(long-context generation)* — turns a year of structured records into a doctor-ready summary.
Every prompt lives in [`backend/prompts/`](backend/prompts/) and every model call goes through [`backend/gemma.py`](backend/gemma.py) → local Ollama at `localhost:11434`. There is no cloud LLM client anywhere in the codebase.
 
### The signature idea: *Python computes, Gemma reasons*
 
The naive approach — hand a language model 90 days of raw records and ask "what are my triggers?" — **fails**, and we can prove it: our first version did exactly that, under-rated the real trigger, over-rated another, and even hallucinated a patient quote. LLMs are bad at doing statistics by eyeballing rows.
 
So we split the work by what each side is actually good at:
 
- **Python computes the evidence deterministically** ([`backend/analysis.py`](backend/analysis.py)) — exposure counts, lagged rates, baselines, and a **confounding check**: for every candidate correlation, how many of its migraine days are *already explained* by another factor.
- **Gemma reasons over the computed evidence** — assigning a verdict (`plausible` / `coincidence` / `inconclusive`), a confidence, and a plain-language rationale, explicitly reasoning about whether an elevated rate is independent or confounded.
The payoff is a genuine reasoning result a chart could never produce. On our data, a **day-of-week pattern has a *higher* raw migraine rate than the real sleep trigger** — a naive tool would flag it as the #1 cause. My-Graine correctly rejects it as a **coincidence**, because once you remove the days already explained by poor sleep or the menstrual cycle, the residual signal collapses below baseline. Every number the model reasoned over is auditable at `GET /api/triggers/evidence`.
 
> **Why Gemma is core, not an add-on:** the charts are deterministic byproducts of structured data. Everything a chart *can't* do — reading free text into structure, reasoning about lagged correlation, telling a real trigger from a coincidence, writing the clinical narrative — is Gemma.
 
---
 
## Architecture
 
```
                    ┌─────────────────  ON-DEVICE BOUNDARY (airplane mode)  ─────────────────┐
                    │                                                                        │
  daily entry ──►  [ Gemma: extract ] ──► structured record ──► SQLite (local, encrypted)   │
  (free text)       │                                              │                         │
                    │                                              ├──► deterministic charts │
                    │                        [ Python: analysis.py computes evidence ]       │
                    │                                              │                         │
                    │            ┌─────────────────────────────────┼─────────────────┐       │
                    │      [ Gemma: triggers ]  [ Gemma: phenotype ]  [ Gemma: progress ]     │
                    │            └─────────────────────────────────┬─────────────────┘       │
                    │                                              ▼                         │
                    │                                   [ Gemma: patient history ]           │
                    │                                                                        │
                    └────────────────────  no network calls at runtime  ─────────────────────┘
 
  Frontend: React + Vite + Tailwind + Recharts        Backend: FastAPI + SQLite
  Model runtime: Ollama serving Gemma 4 locally        Everything localhost-only
```
 
Expensive model calls are cached in-memory and invalidate automatically when the underlying record changes, so the app is snappy on repeat views and after a live log entry.
 
---
 
## Evaluation
 
Because the app runs on synthetic data with a *known* planted structure, we can measure whether the reasoning is actually correct — not just demo it and hope. Our synthetic patient has two real triggers (poor sleep, perimenstrual window) and two decoys (a day-of-week cluster, barometric drops).
 
| Metric | Result |
|---|---|
| **Real triggers surfaced as `plausible`** | ✅ Poor sleep and perimenstrual window both identified |
| **Decoys correctly rejected** | ✅ Day-of-week and barometric drop both rejected as coincidence/inconclusive — despite the day-of-week decoy having a *higher raw rate* than a real trigger |
| **Live extraction** | ✅ Free-text prodrome note → `phase: prodrome`, short-sleep risk flag |
| **Treatment response** | ✅ ~67% fewer migraine days after the medication change → correctly labeled a "responder" |
 
The evidence the model reasons over is fully auditable via `GET /api/triggers/evidence`.
 
---
 
## Privacy & on-device guarantees
 
- **Zero network calls at runtime.** The only outbound URL in the entire codebase is Ollama at `http://localhost:11434`. CORS is restricted to localhost. No analytics, no telemetry, no third-party SDKs.
- **All data local.** The record lives in a local SQLite file. The model weights are local. There is no account, no login, no sync.
- **Provable offline.** The demo runs in airplane mode. If the Wi-Fi radio is off and it still works, there is nothing to argue about.
---
 
## Scope & safety
 
My-Graine is a **decision-support and documentation tool**, squarely inside the hackathon's stated scope. It **does not diagnose or recommend treatment.** It surfaces patterns in your own history, hedged with evidence and confidence, and frames everything as *"discuss with your clinician."* The confidence and coincidence-rejection layers are, in effect, a built-in humility mechanism against over-claiming. **All data is synthetic.**
 
---
 
## Tech stack
 
- **Model:** Gemma 4, served locally by [Ollama](https://ollama.com)
- **Backend:** FastAPI · SQLModel / SQLite · Pydantic-validated model I/O
- **Frontend:** React · Vite · Tailwind · Recharts + hand-built SVG (calendar heatmap, lag scatter, disability gauge)
- **Everything runs on one machine, offline.**
---
 
## Run it locally
 
**Prerequisites:** [Ollama](https://ollama.com/download), Python 3.11+, Node.js (LTS), Git.
 
```bash
# 1. Get Gemma 4 running locally (one-time download)
ollama pull gemma4
ollama run gemma4 "hello"        # confirm it responds — even in airplane mode
 
# 2. Clone
git clone https://github.com/<your-username>/My-Graine.git
cd My-Graine
 
# 3. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python seed.py                    # loads the synthetic 90-day record
uvicorn main:app --reload --port 8000
 
# 4. Frontend (second terminal)
cd frontend
npm install
npm run dev                       # → http://localhost:5173
```
 
Open **http://localhost:5173** with Ollama running in the background.
 
> **First-load note:** the first reasoning call warms the model into memory and can take a couple of minutes; every call after that is cached and instant. Warm the Dashboard and Trigger Insights once before demoing.
 
**Reset to the clean demo state anytime** (after rehearsing a live log entry):
```bash
curl -X POST http://localhost:8000/api/admin/reset
```
 
---
 
## Repo structure
 
```
My-Graine/
├── backend/
│   ├── main.py            # FastAPI app, serves frontend + all /api endpoints
│   ├── gemma.py           # local Ollama client — the ONLY model access, localhost only
│   ├── analysis.py        # deterministic evidence computation (Python does the stats)
│   ├── models.py          # SQLModel record + Pydantic validation for every Gemma output
│   ├── prompts/           # the five Gemma jobs, each in its own file
│   ├── seed.py            # loads the synthetic dataset
│   └── data/              # synthetic patient record (fictional)
└── frontend/
    └── src/
        ├── screens/       # Dashboard, DailyLog, Triggers, Progress, Phenotype, History, Records
        └── components/    # CalendarHeatmap, LagScatter, ConfidenceBar, DisabilityGauge, ...
```
 
---
 
## Summary of Features
 
- **Gemma Integration** — five core Gemma 4 jobs (function-calling, long-context, prompting, on-device), with the *Python-computes / Gemma-reasons* split as a genuine applied-ML contribution. Gemma is the engine, not decoration.
- **Innovation & Impact** — a real chronic-disease problem where on-device is the load-bearing precondition, plus a novel coincidence-rejection layer. Leans directly into the privacy-first, on-device bonus.
- **Functionality** — a working seven-screen app with a live-input demo *and* a real evaluation against known ground truth.
- **Presentation** — a legible architecture, an auditable evidence endpoint, and a demo whose money shot (find the real trigger, reject the coincidence, never go online) lands in 30 seconds.
---
 
*Built with Gemma 4. Runs on your machine. Your data stays yours.*
