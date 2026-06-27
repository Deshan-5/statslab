"use client";

import { useMemo, useRef, useState } from "react";
import { Database, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { EXAMPLES } from "@/lib/examples";

interface NumStats {
  type: "numeric";
  name: string;
  nullCount: number;
  min: number;
  max: number;
  mean: number;
  heights: number[];
}

interface CatStats {
  type: "categorical";
  name: string;
  nullCount: number;
  uniqueCount: number;
  topValue: string;
}

type ColStats = NumStats | CatStats;

function fmt(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) < 1 && n !== 0) return n.toFixed(3);
  return n.toFixed(2);
}

function Sparkline({ heights }: { heights: number[] }) {
  return (
    <svg width="44" height="14" className="shrink-0">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 5.5}
          y={14 - h * 12}
          width={4}
          height={Math.max(h * 12, 0.5)}
          rx={0.5}
          fill="#818cf8"
          opacity={0.75}
        />
      ))}
    </svg>
  );
}

function EmptyState() {
  const { loadCSV, loadExample } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (f: File) => {
    setErr(null);
    const text = await f.text();
    const ok = loadCSV(text, f.name.replace(/\.[^.]+$/, ""));
    if (!ok) setErr("Couldn't parse — expected CSV or TSV.");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const handlePaste = () => {
    setErr(null);
    const ok = loadCSV(pasteText, "Pasted data");
    if (ok) { setPasteOpen(false); setPasteText(""); }
    else setErr("Couldn't parse — expected CSV or TSV.");
  };

  return (
    <div className="p-3 space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30"
            : "border-neutral-200 dark:border-neutral-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
        }`}
      >
        <Upload className="w-5 h-5 text-neutral-400" />
        <p className="text-xs text-neutral-500 text-center leading-relaxed">
          Drop a <span className="font-medium text-neutral-700 dark:text-neutral-300">CSV or TSV</span> here<br />or click to browse
        </p>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

      {/* Paste CSV */}
      <div>
        <button
          onClick={() => setPasteOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          {pasteOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Paste CSV text
        </button>
        {pasteOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"col1,col2,col3\n1,2,3\n4,5,6"}
              rows={5}
              className="w-full text-xs font-mono rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={handlePaste}
              disabled={!pasteText.trim()}
              className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              Load
            </button>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* Example datasets */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-2">Examples</p>
        <div className="space-y-0.5">
          {EXAMPLES.map(ex => (
            <button
              key={ex.id}
              onClick={() => loadExample(ex.id)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center justify-between gap-2"
            >
              <span className="font-medium">{ex.name}</span>
              <span className="text-[10px] text-neutral-400 shrink-0">{ex.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DataView() {
  const { dataset } = useWorkspace();

  const stats = useMemo<ColStats[]>(() => {
    if (!dataset) return [];
    return dataset.columns.map(col => {
      const nullCount = col.values.filter(v => v === null || v === "").length;

      if (col.type === "numeric") {
        const nums = col.numeric;
        if (nums.length === 0) {
          return { type: "categorical" as const, name: col.name, nullCount, uniqueCount: 0, topValue: "" };
        }
        let min = nums[0], max = nums[0], sum = 0;
        for (const n of nums) {
          if (n < min) min = n;
          if (n > max) max = n;
          sum += n;
        }
        const mean = sum / nums.length;
        const range = max - min || 1;
        const buckets = new Array(8).fill(0) as number[];
        for (const n of nums) {
          const b = Math.min(7, Math.floor(((n - min) / range) * 8));
          buckets[b]++;
        }
        const maxBucket = Math.max(...buckets, 1);
        const heights = buckets.map(b => b / maxBucket);
        return { type: "numeric" as const, name: col.name, nullCount, min, max, mean, heights };
      } else {
        const freq = new Map<string, number>();
        for (const v of col.values) {
          if (v === null || v === "") continue;
          const k = String(v);
          freq.set(k, (freq.get(k) ?? 0) + 1);
        }
        let topValue = "", topCount = 0;
        for (const [k, n] of freq) {
          if (n > topCount) { topCount = n; topValue = k; }
        }
        return { type: "categorical" as const, name: col.name, nullCount, uniqueCount: freq.size, topValue };
      }
    });
  }, [dataset]);

  if (!dataset) return <EmptyState />;

  return (
    <div className="min-h-0">
      <div className="px-3 py-2 text-[10px] text-neutral-500 border-b border-neutral-100 dark:border-neutral-800/60 flex justify-between items-center font-medium">
        <span className="truncate max-w-[120px]" title={dataset.name}>{dataset.name}</span>
        <span className="tabular-nums shrink-0">{dataset.rows.length.toLocaleString()}r · {dataset.columns.length}col</span>
      </div>

      <div className="py-1">
        {stats.map(col => (
          <div
            key={col.name}
            className="px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 rounded-lg mx-1 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm text-neutral-800 dark:text-neutral-200 font-medium truncate leading-none" title={col.name}>
                {col.name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {col.nullCount > 0 && (
                  <span className="text-[9px] text-amber-500 tabular-nums">{col.nullCount}N</span>
                )}
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                  col.type === "numeric"
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400"
                    : "bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400"
                }`}>
                  {col.type === "numeric" ? "num" : "str"}
                </span>
              </div>
            </div>

            {col.type === "numeric" ? (
              <div className="flex items-end justify-between gap-2 mt-1">
                <div className="flex gap-2.5 text-[10px] tabular-nums text-neutral-500">
                  <span>min <span className="text-neutral-700 dark:text-neutral-300">{fmt(col.min)}</span></span>
                  <span>max <span className="text-neutral-700 dark:text-neutral-300">{fmt(col.max)}</span></span>
                  <span>μ <span className="text-neutral-700 dark:text-neutral-300">{fmt(col.mean)}</span></span>
                </div>
                <Sparkline heights={col.heights} />
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[10px] tabular-nums text-neutral-500 mt-0.5">
                <span><span className="text-neutral-700 dark:text-neutral-300">{col.uniqueCount}</span> unique</span>
                {col.topValue && (
                  <span className="truncate max-w-[110px]">
                    top: <span className="text-neutral-700 dark:text-neutral-300">&ldquo;{col.topValue}&rdquo;</span>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
