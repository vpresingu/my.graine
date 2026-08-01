import { useEffect, useMemo, useRef, useState } from "react";

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

// One stepper for both the form and the voice follow-up card — the accent
// prop is the only styling difference, so the 0-14h clamp and 0.5h step can
// never drift between the two.
function SleepStepper({ value, onChange, accent = false }) {
  const btn = accent
    ? "h-10 w-10 rounded-xl border border-amber-300 bg-white text-lg font-semibold text-slate-600 hover:bg-amber-100"
    : "h-11 w-11 rounded-xl border border-slate-200 text-xl font-semibold text-slate-600 hover:bg-slate-50";
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(0, +(value - 0.5).toFixed(1)))} className={btn}>
        −
      </button>
      <span className="min-w-14 text-center text-xl font-semibold tabular-nums text-slate-800">
        {value}
      </span>
      <button onClick={() => onChange(Math.min(14, +(value + 0.5).toFixed(1)))} className={btn}>
        +
      </button>
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
    // Mid-cycle. Defaulting to day 1 would silently mark every untouched
    // entry perimenstrual (the window is cycle_day >= 26 or <= 2), inflating
    // the very trigger the Insights screen ranks first. Continued from the
    // last record once records load.
    cycle_day: 14,
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
  const [recState, setRecState] = useState("idle"); // idle | recording | transcribing
  const recorderRef = useRef(null);
  // "form" = classic two-column log; "voice" = speak-first: the form hides
  // and only the fields the entry didn't cover come back as follow-ups.
  const [mode, setMode] = useState("form");
  const [missing, setMissing] = useState([]);
  // Day number being edited, or null when composing a new entry. One row per
  // calendar day: once today exists, the log offers editing it, not stacking
  // a second (which used to silently date the extra entry tomorrow).
  // editBase is the record being edited — held separately from lastRecord so
  // a just-saved entry can be edited before the records refetch lands.
  const [editingDay, setEditingDay] = useState(null);
  const [editBase, setEditBase] = useState(null);

  useEffect(() => {
    fetch("/api/symptoms")
      .then((r) => r.json())
      .then(setVocab)
      .catch(() => {});
  }, []);

  // Cycle day can't be spoken or extracted, so continue it from the last
  // record (+ days elapsed, 28-day wrap) instead of silently saving 1 —
  // that default was corrupting the perimenstrual analysis.
  useEffect(() => {
    if (!lastRecord?.cycle_day || touched.cycle_day || editingDay !== null) return;
    const elapsed = Math.max(
      1,
      Math.round(
        (nextEntryDate(lastRecord) - new Date(lastRecord.date + "T00:00:00")) / 86400000
      )
    );
    const continued = ((lastRecord.cycle_day - 1 + elapsed) % 28) + 1;
    setForm((f) => (f.cycle_day === continued ? f : { ...f, cycle_day: continued }));
    // Keyed on the scalars that matter — the records array (and so
    // lastRecord's identity) changes on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRecord?.date, lastRecord?.cycle_day, touched.cycle_day, editingDay]);

  // Already logged today (or later)? Then the log is in "done for today"
  // mode and only editing is offered.
  const todayIso = new Intl.DateTimeFormat("en-CA").format(new Date());
  const alreadyLoggedToday = Boolean(lastRecord && lastRecord.date >= todayIso);

  // Load today's record into the form and switch to edit mode.
  function startEditing() {
    const r = lastRecord;
    setEditingDay(r.day);
    setEditBase(r);
    setAdopted([]);
    setForm({
      severity_0to10: r.severity_0to10,
      phase: r.phase,
      symptoms: r.symptoms,
      sleep_hours_prev_night: r.sleep_hours_prev_night,
      stress_1to10: r.stress_1to10,
      cycle_day: r.cycle_day,
      meds_acute: r.meds_acute || "",
      meds_preventive: r.meds_preventive || "",
    });
    setTouched({});
    setFreeText(r.notes || "");
    setMigraine(r.migraine);
    setExtraction(null);
    setMissing([]);
    setSaved(null);
    setError(null);
    setMode("form");
  }

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

  // What the spoken/typed entry didn't cover. Null from the extractor means
  // "the note didn't say" — that's what triggers a follow-up question.
  function computeMissing(data) {
    const miss = [];
    if (data.sleep_hours_prev_night == null) miss.push("sleep");
    if (data.stress_1to10 == null) miss.push("stress");
    if (data.migraine === 1) {
      if (data.severity_0to10 === 0) miss.push("severity");
      if (!data.symptoms.length) miss.push("symptoms");
      if (!data.meds_acute) miss.push("meds");
    }
    return miss;
  }

  // Accepts an optional transcript so a voice note can analyze immediately,
  // without waiting for the freeText state update to land.
  async function analyze(textOverride) {
    const text = typeof textOverride === "string" ? textOverride : freeText;
    if (!text.trim() || analyzing) return;
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
          free_text: text,
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
      setMissing(computeMissing(data));
      // Fill in fields the user hasn't set by hand; their edits win.
      setForm((f) => ({
        ...f,
        severity_0to10: touched.severity_0to10 ? f.severity_0to10 : data.severity_0to10,
        phase: touched.phase ? f.phase : data.phase,
        symptoms: touched.symptoms ? f.symptoms : data.symptoms,
        sleep_hours_prev_night: touched.sleep_hours_prev_night
          ? f.sleep_hours_prev_night
          : (data.sleep_hours_prev_night ?? f.sleep_hours_prev_night),
        stress_1to10: touched.stress_1to10
          ? f.stress_1to10
          : (data.stress_1to10 ?? f.stress_1to10),
        meds_acute: touched.meds_acute ? f.meds_acute : (data.meds_acute ?? f.meds_acute),
        meds_preventive: touched.meds_preventive
          ? f.meds_preventive
          : (data.meds_preventive ?? f.meds_preventive),
      }));
    } catch (e) {
      setError(
        e.message.includes("Ollama") ? "The on-device model isn't running." : e.message
      );
    } finally {
      setAnalyzing(false);
    }
  }

  // Voice journaling: record mic audio, transcribe it with the local Whisper
  // model, then run the same on-device extraction as a typed entry. The
  // browser's built-in speech API is deliberately NOT used — it ships audio
  // to cloud servers.
  async function toggleRecording() {
    if (recState === "recording") {
      recorderRef.current?.stop();
      return;
    }
    if (recState !== "idle") return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone unavailable — check the browser's mic permission.");
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    const priorText = freeText;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecState("transcribing");
      try {
        const body = new FormData();
        body.append(
          "file",
          new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
          "note.webm"
        );
        const r = await fetch("/api/transcribe", { method: "POST", body });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
        const combined = priorText.trim()
          ? `${priorText.trim()} ${data.text}`
          : data.text;
        setFreeText(combined);
        setSaved(null);
        setRecState("idle");
        analyze(combined); // speak -> transcript -> structured record, one flow
      } catch (e) {
        setError(e.message);
        setRecState("idle");
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    setError(null);
    setRecState("recording");
  }

  async function saveDay() {
    if (saving) return;
    setSaving(true);
    setError(null);
    // When editing, the day keeps its own date and any value the fresh
    // analysis didn't produce falls back to what's already saved.
    const editing = editingDay !== null ? editBase : null;
    const body = {
      date: editing
        ? editing.date
        : new Intl.DateTimeFormat("en-CA").format(entryDate), // local YYYY-MM-DD
      weekday: editing
        ? editing.weekday
        : entryDate.toLocaleDateString("en-US", { weekday: "long" }),
      wellbeing_1to10: extraction?.wellbeing_1to10 ?? editing?.wellbeing_1to10 ?? 5,
      migraine,
      severity_0to10: form.severity_0to10,
      phase: form.phase,
      // A hand-set phase wins over the stored aura, otherwise editing an
      // entry's phase could silently desync the two fields.
      aura: touched.phase
        ? (form.phase === "aura+headache" ? 1 : 0)
        : (extraction?.aura ??
          editing?.aura ??
          (form.phase === "aura+headache" ? 1 : 0)),
      symptoms: form.symptoms,
      sleep_hours_prev_night: form.sleep_hours_prev_night,
      stress_1to10: form.stress_1to10,
      cycle_day: Number(form.cycle_day) || 14,
      barometric_drop: editing?.barometric_drop ?? 0,
      meds_acute: form.meds_acute.trim() || null,
      meds_preventive: form.meds_preventive.trim() || null,
      functional_impact_0to3:
        extraction?.functional_impact_0to3 ?? editing?.functional_impact_0to3 ?? 0,
      notes: freeText,
    };
    try {
      const resp = await fetch(
        editing ? `/api/records/${editingDay}` : "/api/records",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${resp.status}`);
      }
      const rec = await resp.json();
      setSaved(rec.day);
      // The saved day is now editable in place: without this, the first
      // post-save tweak (which clears `saved`) would flip the component into
      // the "already logged" screen and discard the in-progress change.
      setEditingDay(rec.day);
      setEditBase(rec);
      onSaved?.(rec.day);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const chipBase =
    "rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer";

  const FOLLOWUP_INTRO =
    missing.length === 1
      ? "I hear you — one more thing and this day is complete:"
      : "I hear you — a few things your entry didn't mention:";

  // Follow-up questions for whatever the entry left out (voice mode only).
  // Each input writes into the same form state the classic log uses, so
  // saving works identically in both modes.
  const followUps = mode === "voice" && extraction && (
    missing.length > 0 ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">{FOLLOWUP_INTRO}</p>
        <div className="mt-4 space-y-5">
          {missing.includes("sleep") && (
            <Field
              label="How long did you sleep last night?"
              hint={`${form.sleep_hours_prev_night} h`}
            >
              <SleepStepper
                value={form.sleep_hours_prev_night}
                onChange={(v) => set("sleep_hours_prev_night", v)}
                accent
              />
            </Field>
          )}
          {missing.includes("severity") && (
            <Field label="How bad was the pain?" hint={`${form.severity_0to10}/10`}>
              <input
                type="range"
                min={0}
                max={10}
                value={form.severity_0to10}
                onChange={(e) => set("severity_0to10", Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </Field>
          )}
          {missing.includes("stress") && (
            <Field label="How stressed were you today?" hint={`${form.stress_1to10}/10`}>
              <input
                type="range"
                min={1}
                max={10}
                value={form.stress_1to10}
                onChange={(e) => set("stress_1to10", Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </Field>
          )}
          {missing.includes("symptoms") && (
            <Field label="Any of these symptoms?">
              <div className="flex flex-wrap gap-2">
                {symptomGroups
                  .flatMap((g) => g.symptoms)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSymptom(s)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        form.symptoms.includes(s)
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-amber-200 bg-white text-slate-500 hover:border-amber-300"
                      }`}
                    >
                      {prettySymptom(s)}
                    </button>
                  ))}
              </div>
            </Field>
          )}
          {missing.includes("meds") && (
            <Field label="Did you take anything for it?">
              <input
                type="text"
                placeholder="e.g. sumatriptan 50mg — leave blank if not"
                value={form.meds_acute}
                onChange={(e) => set("meds_acute", e.target.value)}
                className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
              />
            </Field>
          )}
        </div>
      </div>
    ) : (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
        ✓ Got everything I need from what you said — save when ready.
      </p>
    )
  );

  const isEditing = editingDay !== null;

  const saveControls = (
    <>
      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-700">Migraine today?</span>
        {[
          { v: 1, label: "Yes" },
          { v: 0, label: "No" },
        ].map(({ v, label }) => (
          <button
            key={v}
            onClick={() => {
              setMigraine(v);
              // Flipping to "yes" makes severity/symptoms/meds required —
              // recompute the follow-ups so voice mode asks for them.
              if (mode === "voice" && extraction) {
                setMissing(computeMissing({ ...extraction, migraine: v }));
              }
            }}
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
            : isEditing
              ? `Save changes — ${editBase.date}`
              : `Save day — ${entryDateLabel}`}
      </button>

      {saved !== null && (
        <p className="animate-rise text-center text-sm font-medium text-emerald-600">
          {isEditing
            ? `Day ${saved} updated — every analysis will now rebuild from the corrected data.`
            : `Saved as day ${saved} — the dashboard now includes it.`}
        </p>
      )}
    </>
  );

  const extractionCard = extraction && (
    <div className="animate-rise space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">What your entry says</h3>
        <span className="text-xs text-slate-400">
          {mode === "voice"
            ? "extracted on-device from your voice"
            : "extracted on-device · adjust anything on the left"}
        </span>
      </div>

      {extraction.risk_flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extraction.risk_flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-sky-500 px-3.5 py-1.5 text-sm font-semibold text-white"
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
          <dd className="font-semibold text-slate-800">{extraction.severity_0to10}/10</dd>
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

      {extraction.suggested_new_symptoms?.filter((s) => !adopted.includes(s)).length >
        0 && (
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
                  className="rounded-full border border-dashed border-sky-300 bg-white px-3.5 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50"
                >
                  + {prettySymptom(s)}
                </button>
              ))}
          </div>
        </div>
      )}

      {followUps}

      {mode === "voice" && (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">
            Cycle day{" "}
            {!touched.cycle_day && (
              <span className="text-xs font-normal text-slate-400">
                auto-continued from your last entry — adjust if needed
              </span>
            )}
          </span>
          <input
            type="number"
            min={1}
            max={35}
            value={form.cycle_day}
            onChange={(e) => set("cycle_day", e.target.value)}
            className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-center text-sm font-semibold text-slate-800 focus:border-sky-400 focus:outline-none"
          />
        </div>
      )}

      {saveControls}
    </div>
  );

  const statusBlocks = (
    <>
      {analyzing && (
        <p className="animate-pulse px-2 text-sm text-slate-400">
          reading your entry on-device…
        </p>
      )}
      {error && (
        <div className="animate-rise rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
          {error}
        </div>
      )}
    </>
  );

  // Done for today: offer editing instead of stacking a second entry (which
  // would otherwise be silently dated tomorrow).
  if (alreadyLoggedToday && !isEditing && saved === null) {
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-800">Daily Log</h2>
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
          <p className="text-3xl">✓</p>
          <h3 className="mt-2 text-base font-semibold text-emerald-800">
            Today is already logged
          </h3>
          <p className="mt-1.5 text-sm text-emerald-700">
            Day {lastRecord.day} · {lastRecord.date}
            {lastRecord.migraine ? " · migraine day" : " · no migraine"}. One
            entry per day keeps the analyses honest — come back tomorrow.
          </p>
          <button
            onClick={startEditing}
            className="mt-5 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            Edit today's entry
          </button>
        </div>
      </div>
    );
  }

  if (mode === "voice") {
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-800">Daily Log</h2>
        <div className="mx-auto max-w-2xl space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">
              Tell me about your day
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
              Say it all in one go — how you slept, your stress, any symptoms or
              pain, and anything you took for it. I'll structure it, and only ask
              about what's missing.
            </p>
            <button
              onClick={toggleRecording}
              disabled={recState === "transcribing"}
              className={`mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-md transition-colors ${
                recState === "recording"
                  ? "animate-pulse bg-sky-500 text-white"
                  : recState === "transcribing"
                    ? "cursor-wait bg-slate-100 text-slate-400"
                    : "bg-slate-800 text-white hover:bg-slate-900"
              }`}
            >
              {recState === "recording" ? "■" : "🎙"}
            </button>
            <p className="mt-2.5 text-xs text-slate-400">
              {recState === "recording"
                ? "listening — tap to finish"
                : recState === "transcribing"
                  ? "transcribing on this device…"
                  : "tap to speak · audio never leaves this device"}
            </p>

            {freeText && (
              <>
                <textarea
                  rows={4}
                  value={freeText}
                  onChange={(e) => {
                    setFreeText(e.target.value);
                    setSaved(null);
                  }}
                  className="mt-5 w-full resize-none rounded-xl border border-slate-200 p-4 text-left text-sm leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none"
                />
                <button
                  onClick={analyze}
                  disabled={!freeText.trim() || analyzing}
                  className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:text-slate-300"
                >
                  re-analyze the edited transcript
                </button>
              </>
            )}

            <div className="mt-5 border-t border-slate-100 pt-3">
              <button
                onClick={() => setMode("form")}
                className="text-xs text-slate-400 underline decoration-slate-300 hover:text-slate-600"
              >
                prefer typing? use the full form
              </button>
            </div>
          </section>

          {statusBlocks}
          {extractionCard}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Daily Log</h2>
        {isEditing && (
          <span className="rounded-full bg-amber-100 px-3.5 py-1.5 text-sm font-semibold text-amber-800">
            Editing day {editingDay} · {editBase.date} — analyses rebuild on save
          </span>
        )}
      </div>

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
              className="w-full accent-sky-500"
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
                      ? "border-sky-500 bg-sky-500 text-white"
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
                              ? "border-sky-200 bg-sky-50 text-sky-700"
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
                  className="h-9 w-40 rounded-full border border-dashed border-slate-300 px-3.5 text-sm text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
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
              <SleepStepper
                value={form.sleep_hours_prev_night}
                onChange={(v) => set("sleep_hours_prev_night", v)}
              />
            </Field>

            <Field label="Cycle day" hint="day 1 = period starts">
              <input
                type="number"
                min={1}
                max={35}
                value={form.cycle_day}
                onChange={(e) => set("cycle_day", e.target.value)}
                className="h-11 w-24 rounded-xl border border-slate-200 px-3 text-center text-lg font-semibold text-slate-800 focus:border-sky-400 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Days 26–2 count as the perimenstrual window in Trigger Insights.
                Leave at 14 if you don't track a cycle.
              </p>
            </Field>
          </div>

          <Field label="Stress" hint={`${form.stress_1to10}/10`}>
            <input
              type="range"
              min={1}
              max={10}
              value={form.stress_1to10}
              onChange={(e) => set("stress_1to10", Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Acute meds">
              <input
                type="text"
                placeholder="e.g. sumatriptan 50mg"
                value={form.meds_acute}
                onChange={(e) => set("meds_acute", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
              />
            </Field>
            <Field label="Preventive meds">
              <input
                type="text"
                placeholder="e.g. propranolol 80mg"
                value={form.meds_preventive}
                onChange={(e) => set("meds_preventive", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
              />
            </Field>
          </div>
        </section>

        {/* Right — free text + extraction */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                How are you feeling today?
              </label>
              <button
                onClick={() => {
                  setMode("voice"); // voice-first: the form gets out of the way
                  toggleRecording();
                }}
                title="Speak your entry — transcribed on this device, never uploaded"
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-600"
              >
                🎙 Speak it
              </button>
            </div>
            <textarea
              rows={6}
              value={freeText}
              onChange={(e) => {
                setFreeText(e.target.value);
                setSaved(null);
              }}
              placeholder="e.g. Slept badly, woke up yawning with a stiff neck and brain fog. No headache yet but it feels like one is coming…"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
            />
            <button
              onClick={analyze}
              disabled={!freeText.trim() || analyzing}
              className="mt-3 w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {analyzing ? "Reading your entry on-device…" : "Analyze entry"}
            </button>
          </div>

          {statusBlocks}
          {extractionCard}
          {/* Saving is deliberately independent of the model. Analysis
              enriches an entry; it must never be the only way to record one —
              the model can be slow, offline, or unwanted for a quick log. */}
          {!extraction && (
            <div className="animate-rise space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">
                {isEditing
                  ? "Adjust anything on the left (or re-analyze an edited note above), then save."
                  : "Analysis is optional — a structured log on the left saves fine on its own."}
              </p>
              {saveControls}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
