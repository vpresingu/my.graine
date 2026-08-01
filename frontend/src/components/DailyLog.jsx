import { useEffect, useMemo, useState } from "react";

const PHASES = ["none", "prodrome", "aura+headache", "headache", "postdrome"];
const GROUP_LABELS = { prodrome: "Prodrome", aura: "Aura", attack: "Attack", custom: "Yours" };

const FLAG_LABELS = {
  short_sleep_elevated_next_day_risk:
    "⚠ Short night — elevated migraine risk in the next ~24h",
};

const prettyFlag = (flag) => FLAG_LABELS[flag] || "⚠ " + flag.replaceAll("_", " ");
const prettySymptom = (s) => s.replaceAll("_", " ");

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        {hint && <span className="text-sm tabular-nums text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// The diary is strictly one row per calendar day. If the last record is
// already dated today (or later), the next entry belongs to the following
// day — otherwise saving would stack two records on one date and the
// calendar/analyses would double-count that day.
function nextEntryDate(lastRecord) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lastRecord) {
    const dayAfter = new Date(
      new Date(lastRecord.date + "T00:00:00").getTime() + 86400000
    );
    if (dayAfter > today) return dayAfter;
  }
  return today;
}

export default function DailyLog({ onSaved, records = [] }) {
  const lastRecord = records[records.length - 1];
  const [form, setForm] = useState({
    severity_0to10: 0,
    phase: "none",
    symptoms: [],
    sleep_hours_prev_night: 7.5,
    stress_1to10: 3,
    cycle_day: 1,
    meds_acute: "",
    meds_preventive: "",
  });
  const [touched, setTouched] = useState({});
  const [freeText, setFreeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [migraine, setMigraine] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [vocab, setVocab] = useState({ groups: {}, custom: [] });
  const [newSymptom, setNewSymptom] = useState("");
  const [adopted, setAdopted] = useState([]); // suggestions already accepted

  useEffect(() => {
    fetch("/api/symptoms")
      .then((r) => r.json())
      .then(setVocab)
      .catch(() => {});
  }, []);

  // Personal ordering: within each group, the symptoms *this user* logs most
  // often come first.
  const symptomGroups = useMemo(() => {
    const counts = {};
    for (const r of records) for (const s of r.symptoms) counts[s] = (counts[s] || 0) + 1;
    const byFrequency = (a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b);
    const groups = Object.entries(vocab.groups).map(([key, symptoms]) => ({
      key,
      symptoms: [...symptoms].sort(byFrequency),
    }));
    groups.push({ key: "custom", symptoms: [...vocab.custom].sort(byFrequency) });
    return groups;
  }, [vocab, records]);

  async function addCustomSymptom(name, alsoSelect = false) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      const r = await fetch("/api/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) return;
      const d = await r.json();
      setVocab((v) => ({ ...v, custom: d.custom }));
      setNewSymptom("");
      if (alsoSelect && !form.symptoms.includes(d.added)) {
        set("symptoms", [...form.symptoms, d.added]);
        setAdopted((a) => [...a, d.added]);
      }
    } catch {
      /* offline-only app; nothing to report beyond the chip not appearing */
    }
  }

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
    setSaved(null); // edits after a save mean a new, saveable state
  };

  const entryDate = nextEntryDate(lastRecord);
  const entryDateLabel = entryDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const toggleSymptom = (s) =>
    set(
      "symptoms",
      form.symptoms.includes(s)
        ? form.symptoms.filter((x) => x !== s)
        : [...form.symptoms, s]
    );

  async function analyze() {
    if (!freeText.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setExtraction(null);
    setSaved(null);
    const partial = {};
    for (const key of Object.keys(touched)) partial[key] = form[key];
    try {
      const resp = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          free_text: freeText,
          partial_structured: Object.keys(partial).length ? partial : null,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setExtraction(data);
      setMigraine(data.migraine);
      // Fill in fields the user hasn't set by hand; their edits win.
      setForm((f) => ({
        ...f,
        severity_0to10: touched.severity_0to10 ? f.severity_0to10 : data.severity_0to10,
        phase: touched.phase ? f.phase : data.phase,
        symptoms: touched.symptoms ? f.symptoms : data.symptoms,
        sleep_hours_prev_night: touched.sleep_hours_prev_night
          ? f.sleep_hours_prev_night
          : (data.sleep_hours_prev_night ?? f.sleep_hours_prev_night),
      }));
    } catch (e) {
      setError(
        e.message.includes("Ollama") ? "The on-device model isn't running." : e.message
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveDay() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const body = {
      date: new Intl.DateTimeFormat("en-CA").format(entryDate), // local YYYY-MM-DD
      weekday: entryDate.toLocaleDateString("en-US", { weekday: "long" }),
      wellbeing_1to10: extraction?.wellbeing_1to10 ?? 5,
      migraine,
      severity_0to10: form.severity_0to10,
      phase: form.phase,
      aura: extraction?.aura ?? (form.phase === "aura+headache" ? 1 : 0),
      symptoms: form.symptoms,
      sleep_hours_prev_night: form.sleep_hours_prev_night,
      stress_1to10: form.stress_1to10,
      cycle_day: Number(form.cycle_day) || 1,
      barometric_drop: 0,
      meds_acute: form.meds_acute.trim() || null,
      meds_preventive: form.meds_preventive.trim() || null,
      functional_impact_0to3: extraction?.functional_impact_0to3 ?? 0,
      notes: freeText,
    };
    try {
      const resp = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${resp.status}`);
      }
      const rec = await resp.json();
      setSaved(rec.day);
      onSaved?.(rec.day);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const chipBase =
    "rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-800">Daily Log</h2>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Left — structured quick-log */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Pain" hint={`${form.severity_0to10}/10`}>
            <input
              type="range"
              min={0}
              max={10}
              value={form.severity_0to10}
              onChange={(e) => set("severity_0to10", Number(e.target.value))}
              className="w-full accent-coral-500"
            />
          </Field>

          <Field label="Phase">
            <div className="flex flex-wrap gap-2">
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => set("phase", p)}
                  className={`${chipBase} ${
                    form.phase === p
                      ? "border-coral-500 bg-coral-500 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Symptoms" hint="ordered by what you log most">
            <div className="space-y-3">
              {symptomGroups.map(({ key, symptoms }) =>
                symptoms.length ? (
                  <div key={key}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
                      {GROUP_LABELS[key] ?? key}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {symptoms.map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleSymptom(s)}
                          className={`${chipBase} ${
                            form.symptoms.includes(s)
                              ? "border-coral-200 bg-coral-50 text-coral-700"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {prettySymptom(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSymptom}
                  onChange={(e) => setNewSymptom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomSymptom(newSymptom)}
                  placeholder="add your own…"
                  className="h-9 w-40 rounded-full border border-dashed border-slate-300 px-3.5 text-sm text-slate-700 placeholder:text-slate-300 focus:border-coral-400 focus:outline-none"
                />
                {newSymptom.trim() && (
                  <button
                    onClick={() => addCustomSymptom(newSymptom)}
                    className="rounded-full bg-slate-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-900"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Sleep last night" hint={`${form.sleep_hours_prev_night} h`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    set(
                      "sleep_hours_prev_night",
                      Math.max(0, +(form.sleep_hours_prev_night - 0.5).toFixed(1))
                    )
                  }
                  className="h-11 w-11 rounded-xl border border-slate-200 text-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  −
                </button>
                <span className="min-w-14 text-center text-xl font-semibold tabular-nums text-slate-800">
                  {form.sleep_hours_prev_night}
                </span>
                <button
                  onClick={() =>
                    set(
                      "sleep_hours_prev_night",
                      Math.min(14, +(form.sleep_hours_prev_night + 0.5).toFixed(1))
                    )
                  }
                  className="h-11 w-11 rounded-xl border border-slate-200 text-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
            </Field>

            <Field label="Cycle day">
              <input
                type="number"
                min={1}
                max={35}
                value={form.cycle_day}
                onChange={(e) => set("cycle_day", e.target.value)}
                className="h-11 w-24 rounded-xl border border-slate-200 px-3 text-center text-lg font-semibold text-slate-800 focus:border-coral-400 focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Stress" hint={`${form.stress_1to10}/10`}>
            <input
              type="range"
              min={1}
              max={10}
              value={form.stress_1to10}
              onChange={(e) => set("stress_1to10", Number(e.target.value))}
              className="w-full accent-coral-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Acute meds">
              <input
                type="text"
                placeholder="e.g. sumatriptan 50mg"
                value={form.meds_acute}
                onChange={(e) => set("meds_acute", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-coral-400 focus:outline-none"
              />
            </Field>
            <Field label="Preventive meds">
              <input
                type="text"
                placeholder="e.g. propranolol 80mg"
                value={form.meds_preventive}
                onChange={(e) => set("meds_preventive", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-coral-400 focus:outline-none"
              />
            </Field>
          </div>
        </section>

        {/* Right — free text + extraction */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="text-sm font-semibold text-slate-700">
              How are you feeling today?
            </label>
            <textarea
              rows={6}
              value={freeText}
              onChange={(e) => {
                setFreeText(e.target.value);
                setSaved(null);
              }}
              placeholder="e.g. Slept badly, woke up yawning with a stiff neck and brain fog. No headache yet but it feels like one is coming…"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-300 focus:border-coral-400 focus:outline-none"
            />
            <button
              onClick={analyze}
              disabled={!freeText.trim() || analyzing}
              className="mt-3 w-full rounded-xl bg-coral-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-coral-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {analyzing ? "Reading your entry on-device…" : "Analyze entry"}
            </button>
          </div>

          {analyzing && (
            <p className="animate-pulse px-2 text-sm text-slate-400">
              reading your entry on-device…
            </p>
          )}

          {error && (
            <div className="animate-rise rounded-xl border border-coral-200 bg-coral-50 p-4 text-sm text-coral-700">
              {error}
            </div>
          )}

          {extraction && (
            <div className="animate-rise space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  What your entry says
                </h3>
                <span className="text-xs text-slate-400">
                  extracted on-device · adjust anything on the left
                </span>
              </div>

              {extraction.risk_flags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extraction.risk_flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded-full bg-coral-500 px-3.5 py-1.5 text-sm font-semibold text-white"
                    >
                      {prettyFlag(flag)}
                    </span>
                  ))}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Phase</dt>
                  <dd className="font-semibold text-slate-800">{extraction.phase}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Severity</dt>
                  <dd className="font-semibold text-slate-800">
                    {extraction.severity_0to10}/10
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Sleep</dt>
                  <dd className="font-semibold text-slate-800">
                    {extraction.sleep_hours_prev_night ?? "—"} h
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Symptoms</dt>
                  <dd className="font-semibold text-slate-800">
                    {extraction.symptoms.length
                      ? extraction.symptoms.map(prettySymptom).join(", ")
                      : "none noted"}
                  </dd>
                </div>
              </dl>

              {extraction.suggested_new_symptoms?.filter((s) => !adopted.includes(s))
                .length > 0 && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    Your entry mentions symptoms not in your vocabulary yet:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {extraction.suggested_new_symptoms
                      .filter((s) => !adopted.includes(s))
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => addCustomSymptom(s, true)}
                          className="rounded-full border border-dashed border-coral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-coral-700 hover:bg-coral-50"
                        >
                          + {prettySymptom(s)}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <span className="text-sm font-semibold text-slate-700">Migraine today?</span>
                {[
                  { v: 1, label: "Yes" },
                  { v: 0, label: "No" },
                ].map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => setMigraine(v)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                      migraine === v
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                onClick={saveDay}
                disabled={saving || saved !== null}
                className="w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-900 disabled:bg-slate-300"
              >
                {saving
                  ? "Saving…"
                  : saved !== null
                    ? "Saved ✓"
                    : `Save day — ${entryDateLabel}`}
              </button>

              {saved !== null && (
                <p className="animate-rise text-center text-sm font-medium text-emerald-600">
                  Saved as day {saved} — the dashboard now includes it.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
