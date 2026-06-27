"use client";

import { useRef, useState } from "react";
import {
  Database, Upload, X, ChevronDown, ChevronRight, Hash, Type, Trash2, Sparkles,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";
import { EXAMPLES } from "@/lib/examples";

export default function DatasetSidebar() {
  const { dataset, loadExample, loadCSV, clearDataset, selection } = useWorkspace();
  const [open, setOpen] = useState(true);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    const text = await f.text();
    const ok = loadCSV(text, f.name.replace(/\.[^.]+$/, ""));
    if (!ok) setPasteErr("Couldn't parse file as CSV/TSV.");
  };

  const handlePaste = () => {
    setPasteErr(null);
    const ok = loadCSV(pasteText, "Pasted data");
    if (ok) { setPasting(false); setPasteText(""); }
    else setPasteErr("Couldn't parse — expected CSV or TSV.");
  };

  return (
    <aside className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          <Database className="w-4 h-4 text-neutral-500" />
          <span className="font-medium">Dataset</span>
          {dataset && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              · {dataset.name} <span className="text-neutral-400">({dataset.rows.length})</span>
            </span>
          )}
        </div>
        {dataset && selection && selection.size > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-orange-600 dark:text-orange-400">
            {selection.size} selected
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 p-4 space-y-4">
          {!dataset && !pasting && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Examples</div>
                <ul className="space-y-1">
                  {EXAMPLES.map((ex) => (
                    <li key={ex.id}>
                      <button
                        onClick={() => loadExample(ex.id)}
                        className="w-full text-left rounded-lg px-2.5 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3 h-3 text-orange-500 shrink-0" />
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{ex.name}</span>
                        </div>
                        <div className="ml-5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
                          {ex.description}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4 flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <Upload className="w-3 h-3" /> Upload CSV
                </button>
                <button
                  onClick={() => setPasting(true)}
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  Paste data
                </button>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </div>
            </>
          )}

          {pasting && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder="Paste CSV or TSV with a header row…"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs font-mono bg-white dark:bg-neutral-900 focus:outline-none focus:border-neutral-500"
              />
              {pasteErr && <div className="text-xs text-red-500">{pasteErr}</div>}
              <div className="flex gap-2">
                <button onClick={handlePaste}
                  className="flex-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-2 text-xs hover:opacity-90">
                  Load
                </button>
                <button onClick={() => { setPasting(false); setPasteText(""); setPasteErr(null); }}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {dataset && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                  Columns ({dataset.columns.length})
                </div>
                <ul className="space-y-0.5">
                  {dataset.columns.map((c) => (
                    <li key={c.index} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      {c.type === "numeric"
                        ? <Hash className="w-3 h-3 text-blue-500 shrink-0" />
                        : <Type className="w-3 h-3 text-emerald-500 shrink-0" />}
                      <span className="text-sm font-mono truncate">{c.name}</span>
                      <span className="ml-auto text-[10px] text-neutral-400 shrink-0">
                        {c.type === "numeric" ? `${c.numeric.length} num` : `${new Set(c.values.filter((v) => v !== null)).size} cat`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <Upload className="w-3 h-3" /> Replace
                </button>
                <button
                  onClick={clearDataset}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs text-neutral-500 hover:text-red-600 hover:border-red-200"
                  aria-label="Clear dataset"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
