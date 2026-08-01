import { useEffect, useState } from "react";
import { fetchAnalysis } from "../lib/analysisStore";
import ModelLoading from "./ModelLoading";

const HEADINGS = [
  "Onset & course",
  "Attack frequency & phenotype",
  "Identified triggers (with evidence)",
  "Treatment response",
  "Current status",
  "Questions for my doctor",
];

// Split the model's plain text into the six required sections; tolerant of
// markdown-ish decoration around headings. Falls back to raw text.
function parseSections(text) {
  const sections = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const clean = line
      .replace(/^#+\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/^[•·\-\s]+/, "")
      .trim();
    const match = HEADINGS.find((h) =>
      clean.toLowerCase().startsWith(h.toLowerCase())
    );
    if (match) {
      current = { heading: match, lines: [] };
      sections.push(current);
      const rest = clean.slice(match.length).replace(/^[:\s·—-]+/, "").trim();
      if (rest) current.lines.push(rest);
    } else if (line && current) {
      current.lines.push(line.replace(/\*\*/g, ""));
    }
  }
  return sections;
}

export default function PatientHistory({ recordCount }) {
  const [state, setState] = useState({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAnalysis("history", "/api/history", { method: "POST" })
      .then((d) => !cancelled && setState({ status: "ok", ...d }))
      .catch(
        (e) =>
          !cancelled &&
          setState({
            status: "error",
            message: e.message.includes("Ollama")
              ? "The on-device model isn't running."
              : e.message,
          })
      );
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyForPortal() {
    try {
      await navigator.clipboard.writeText(state.history);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const sections = state.status === "ok" ? parseSections(state.history) : [];
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">
          Patient History
          <span className="ml-2 text-sm font-normal text-slate-400">
            a one-pager to hand your clinician — generated on-device
          </span>
        </h2>
        {state.status === "ok" && (
          <div className="flex gap-2">
            <button
              onClick={copyForPortal}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
            >
              {copied ? "✓ Copied" : "Copy for portal"}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-coral-500 px-4 py-2 text-sm font-semibold text-white hover:bg-coral-600"
            >
              Export to PDF
            </button>
          </div>
        )}
      </div>

      {state.status === "loading" && (
        <ModelLoading message="assembling your history on-device…" />
      )}

      {state.status === "error" && (
        <div className="rounded-2xl border border-coral-200 bg-coral-50 p-5 text-sm text-coral-700">
          {state.message}
        </div>
      )}

      {state.status === "ok" && (
        <article
          id="history-doc"
          className="animate-rise mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white px-10 py-9 shadow-sm"
        >
          <header className="border-b-2 border-slate-800 pb-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Migraine History
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Prepared {today} · {state.days ?? recordCount} days of diary data ·
              generated on-device by My-Graine
            </p>
          </header>

          {sections.length >= 3 ? (
            <div className="mt-6 space-y-6">
              {sections.map((s) => (
                <section key={s.heading}>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-coral-600">
                    {s.heading}
                  </h2>
                  <div className="mt-1.5 space-y-1.5 text-[15px] leading-relaxed text-slate-700">
                    {s.lines.map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <pre className="mt-6 whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-700">
              {state.history}
            </pre>
          )}

          <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400">
            Generated locally from the patient's own diary. This document organizes
            history and does not diagnose or prescribe.
          </footer>
        </article>
      )}
    </div>
  );
}
