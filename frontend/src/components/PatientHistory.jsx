import { useEffect, useState } from "react";
import { analysisStartedAt, fetchAnalysis } from "../lib/analysisStore";
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
      current.lines.push(line);
    }
  }
  return sections;
}

// This is a clinician document: emojis never belong, whatever the model says.
const stripEmoji = (s) =>
  s.replace(/\p{Extended_Pictographic}/gu, "").replace(/ {2,}/g, " ").trim();

// *italic* spans -> <em>.
function em(text) {
  return text
    .split(/\*(.+?)\*/g)
    .map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));
}

// **bold** spans -> <strong>, then *italic* inside the remainder.
function inline(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? (
      <strong key={i} className="font-semibold text-slate-800">
        {em(part)}
      </strong>
    ) : (
      <span key={i}>{em(part)}</span>
    )
  );
}

// Turn model output lines into document blocks: headings, list items,
// markdown tables (| cell | cell |), and paragraphs — so ##/**/| noise
// renders as clean formatting instead of literal symbols.
function toBlocks(lines) {
  const blocks = [];
  let table = null;
  const flushTable = () => {
    if (table) {
      blocks.push(table);
      table = null;
    }
  };
  for (const raw of lines) {
    const line = stripEmoji(raw.trim());
    if (!line || /^[*\-_·]{3,}$/.test(line)) {
      flushTable();
      continue; // blanks + hr noise
    }
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // |:---|:---| separator row
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (!table) table = { type: "table", header: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }
    flushTable();
    const heading = line.match(/^#{1,4}\s*(.*)$/);
    if (heading) {
      blocks.push({ type: "h", text: heading[1].replace(/\*\*/g, "").trim() });
      continue;
    }
    const item = line.match(/^(\d+[.)]|[-•*])\s+(.*)$/);
    if (item) {
      blocks.push({
        type: "li",
        marker: /^\d/.test(item[1]) ? item[1].replace(")", ".") : "•",
        text: item[2],
      });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  flushTable();
  return blocks;
}

function Blocks({ lines }) {
  return (
    <>
      {toBlocks(lines).map((b, i) =>
        b.type === "h" ? (
          <h2
            key={i}
            className="pt-3 text-xs font-bold uppercase tracking-widest text-sky-600 first:pt-0"
          >
            {b.text}
          </h2>
        ) : b.type === "li" ? (
          <p key={i} className="flex gap-2 pl-1">
            <span className="shrink-0 font-semibold text-slate-400">{b.marker}</span>
            <span>{inline(b.text)}</span>
          </p>
        ) : b.type === "table" ? (
          <div key={i} className="overflow-x-auto py-1">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  {b.header.map((h, j) => (
                    <th key={j} className="py-1.5 pr-4 font-semibold text-slate-800">
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-b border-slate-100 align-top last:border-0">
                    {r.map((c, k) => (
                      <td key={k} className="py-1.5 pr-4">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        )
      )}
    </>
  );
}

// Fallback formatter for when the model ignores the mandated headings and
// free-styles with markdown.
function MarkdownLite({ text }) {
  return (
    <div className="mt-6 space-y-2 text-[15px] leading-relaxed text-slate-700">
      <Blocks lines={text.split(/\r?\n/)} />
    </div>
  );
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
      // Strip any markdown decoration so the pasted text is portal-clean.
      const clean = state.history
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/^[*\-_·]{3,}\s*$/gm, "")
        .replace(/^\|[\s:|-]+\|\s*$/gm, "") // |:---| table separator rows
        .replace(/^\|(.+)\|\s*$/gm, (_m, cells) =>
          cells.split("|").map((c) => c.trim()).filter(Boolean).join(" — ")
        )
        .replace(/^#+\s*/gm, "")
        .replace(/\*\*/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      await navigator.clipboard.writeText(clean);
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
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            >
              Export to PDF
            </button>
          </div>
        )}
      </div>

      {state.status === "loading" && (
        <ModelLoading
          message="assembling your history on-device…"
          since={analysisStartedAt("history")}
          estimate="This runs several analyses in sequence — allow up to a few minutes on the first run"
        />
      )}

      {state.status === "error" && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-700">
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
                  <h2 className="text-xs font-bold uppercase tracking-widest text-sky-600">
                    {s.heading}
                  </h2>
                  <div className="mt-1.5 space-y-1.5 text-[15px] leading-relaxed text-slate-700">
                    <Blocks lines={s.lines} />
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <MarkdownLite text={state.history} />
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
