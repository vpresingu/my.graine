import { useEffect, useMemo, useState } from "react";
import { formatDateRange } from "../lib/metrics";

const PAGE_SIZE = 30;

const COLUMNS = [
  { key: "day", label: "Day", get: (r) => r.day },
  { key: "date", label: "Date", get: (r) => r.date },
  { key: "weekday", label: "Weekday", get: (r) => r.weekday },
  { key: "migraine", label: "Migraine", get: (r) => r.migraine },
  { key: "severity_0to10", label: "Sev", get: (r) => r.severity_0to10 },
  { key: "phase", label: "Phase", get: (r) => r.phase },
  { key: "aura", label: "Aura", get: (r) => r.aura },
  { key: "symptoms", label: "Symptoms", get: (r) => r.symptoms.length, noSort: false },
  { key: "sleep_hours_prev_night", label: "Sleep", get: (r) => r.sleep_hours_prev_night },
  { key: "stress_1to10", label: "Stress", get: (r) => r.stress_1to10 },
  { key: "cycle_day", label: "Cycle", get: (r) => r.cycle_day },
  { key: "meds", label: "Meds", get: (r) => (r.meds_acute ? 1 : 0) + (r.meds_preventive ? 1 : 0) },
  { key: "functional_impact_0to3", label: "Impact", get: (r) => r.functional_impact_0to3 },
  { key: "notes", label: "Note", get: (r) => ((r.notes || "").trim() ? 1 : 0) },
];

export default function RecordsLog({ records, lastSavedDay }) {
  const [sort, setSort] = useState({ key: "day", dir: "desc" }); // newest first
  const [migraineOnly, setMigraineOnly] = useState(false);
  const [withNoteOnly, setWithNoteOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [flashNew, setFlashNew] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setFlashNew(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    let out = records;
    if (migraineOnly) out = out.filter((r) => r.migraine === 1);
    if (withNoteOnly) out = out.filter((r) => (r.notes || "").trim());
    if (from) out = out.filter((r) => r.date >= from);
    if (to) out = out.filter((r) => r.date <= to);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => (r.notes || "").toLowerCase().includes(q));
    }
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    out = [...out].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [records, migraineOnly, withNoteOnly, from, to, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => setPage(0), [migraineOnly, withNoteOnly, from, to, query]);

  const migraineDays = records.filter((r) => r.migraine).length;
  const noteDays = records.filter((r) => (r.notes || "").trim()).length;

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Records</h2>

      {/* summary bar */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm shadow-sm">
        <span>
          <span className="font-bold text-slate-800">{records.length}</span>{" "}
          <span className="text-slate-400">days logged</span>
        </span>
        <span>
          <span className="font-bold text-sky-600">{migraineDays}</span>{" "}
          <span className="text-slate-400">migraine days</span>
        </span>
        <span>
          <span className="font-bold text-slate-700">{noteDays}</span>{" "}
          <span className="text-slate-400">days with a note</span>
        </span>
        <span className="text-slate-400">{formatDateRange(records)}</span>
        <span className="ml-auto text-xs text-slate-300">
          showing {filtered.length} of {records.length}
        </span>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={() => setMigraineOnly(!migraineOnly)}
          className={`rounded-full border px-3.5 py-1.5 font-medium transition-colors ${
            migraineOnly
              ? "border-sky-500 bg-sky-500 text-white"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          }`}
        >
          Migraine days only
        </button>
        <button
          onClick={() => setWithNoteOnly(!withNoteOnly)}
          className={`rounded-full border px-3.5 py-1.5 font-medium transition-colors ${
            withNoteOnly
              ? "border-sky-500 bg-sky-500 text-white"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          }`}
        >
          💬 With a note
        </button>
        <label className="flex items-center gap-1.5 text-slate-500">
          from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700"
          />
        </label>
        <label className="flex items-center gap-1.5 text-slate-500">
          to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700"
          />
        </label>
        <input
          type="search"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none"
        />
      </div>

      {/* table */}
      <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e2e8f0]">
            <tr className="text-slate-400">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-medium hover:text-slate-600"
                >
                  {c.label}
                  {sort.key === c.key && (
                    <span className="ml-0.5 text-sky-500">
                      {sort.dir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-600">
            {pageRows.map((r, i) => {
              // Highlight only a day actually saved this session — a seed row
              // that happens to be dated today must not flash as new.
              const isNew = flashNew && lastSavedDay !== null && r.day === lastSavedDay;
              const hasNotes = (r.notes || "").trim().length > 0;
              const isOpen = expanded === r.day;
              return [
                <tr
                  key={r.day}
                  onClick={() => hasNotes && setExpanded(isOpen ? null : r.day)}
                  className={`border-t border-slate-100 transition-colors ${
                    isNew
                      ? "bg-sky-50"
                      : i % 2
                        ? "bg-slate-50/60"
                        : "bg-white"
                  } ${hasNotes ? "cursor-pointer hover:bg-slate-100/70" : ""}`}
                >
                  <td className="px-3 py-2 font-semibold tabular-nums text-slate-700">
                    {r.day}
                    {isNew && (
                      <span className="ml-1.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        NEW
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.date}</td>
                  <td className="px-3 py-2">{r.weekday.slice(0, 3)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        r.migraine ? "bg-sky-500" : "bg-slate-200"
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.severity_0to10 || "—"}</td>
                  <td className="px-3 py-2">{r.phase === "none" ? "—" : r.phase}</td>
                  <td className="px-3 py-2">{r.aura ? "✓" : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-44 flex-wrap gap-1">
                      {r.symptoms.length
                        ? r.symptoms.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                            >
                              {s.replaceAll("_", " ")}
                            </span>
                          ))
                        : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.sleep_hours_prev_night}h</td>
                  <td className="px-3 py-2 tabular-nums">{r.stress_1to10}</td>
                  <td className="px-3 py-2 tabular-nums">{r.cycle_day}</td>
                  <td
                    className="max-w-28 truncate px-3 py-2"
                    title={[r.meds_acute, r.meds_preventive].filter(Boolean).join(" · ")}
                  >
                    {[r.meds_acute, r.meds_preventive].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.functional_impact_0to3}</td>
                  <td className="max-w-40 px-3 py-2">
                    {hasNotes ? (
                      <span className="flex items-center gap-1 text-slate-500">
                        <span className="shrink-0">💬</span>
                        <span className="truncate italic">{r.notes.trim()}</span>
                        <span className="shrink-0 text-slate-300">{isOpen ? "▾" : "▸"}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${r.day}-notes`} className="border-t border-slate-100 bg-sky-50/40">
                    <td colSpan={COLUMNS.length} className="px-6 py-3">
                      <p className="text-sm italic leading-relaxed text-slate-600">
                        “{r.notes}”
                      </p>
                    </td>
                  </tr>
                ),
              ];
            })}
            {!pageRows.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-slate-400">
                  No days match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-500 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="px-2 tabular-nums text-slate-400">
            {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-500 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
