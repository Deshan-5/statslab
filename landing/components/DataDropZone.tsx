"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileSpreadsheet, X, Lightbulb, ArrowRight, Loader2,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  mean, median, sd, skewness, kurtosis,
  parseNumbers, parseCSV, detectDistribution, pearsonR,
  type ParsedCSV, type DistributionGuess,
} from "@/components/tools/shared/stats";
import { findTool } from "@/lib/tools";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { Column, Dataset } from "@/lib/dataset";

/* ── Types ──────────────────────────────────────────────────────────────── */
type ColumnStats = {
  name: string;
  count: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  distribution: DistributionGuess;
};

type AnalysisResult = {
  columns: ColumnStats[];
  textColumns: string[];  // non-numeric column names
  correlations?: { col1: string; col2: string; r: number }[];
  rowCount: number;
  colCount: number;
  headers: string[];
  sampleRows: string[][];
};

type AISummary = {
  summary: string;
  suggestions: { toolId: string; reason: string }[];
};

type Suggestion = {
  emoji: string;
  title: string;
  why: string;
  buttons: { toolId: string; label: string }[];
};

/* ── Main component ─────────────────────────────────────────────────────── */
export default function DataDropZone() {
  const { dataset, loadCSV, clearDataset } = useWorkspace();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showDetailed, setShowDetailed] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const rawTextRef = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Process text data ────────────────────────────────────────────── */
  const processData = useCallback((text: string, name?: string) => {
    setAiSummary(null);
    setAiError(null);
    setFileName(name ?? null);
    setExpanded(true);
    setShowDetailed(false);
    setWorkspaceLoaded(false);
    rawTextRef.current = text;

    const nums = parseNumbers(text);
    const lineCount = text.trim().split(/\r?\n/).filter((l) => l.trim()).length;
    const hasMultiCol = text.trim().split(/\r?\n/)[0]?.split(/[,\t;]/).length > 1;
    const numsLooksFlat = nums && nums.length >= 2 && (!hasMultiCol || lineCount <= 1);

    if (numsLooksFlat) {
      const result = singleColumnAnalysis(nums!);
      setAnalysis(result);
      const csvText = ["Values", ...nums!.map(String)].join("\n");
      setWorkspaceLoaded(loadCSV(csvText, name ?? "Numbers"));
      fetchAISummary(result);
      return;
    }

    const csv = parseCSV(text);
    if (csv && csv.rowCount >= 1 && csv.colCount >= 1) {
      const result = analyzeCSV(csv);
      setAnalysis(result);
      setWorkspaceLoaded(loadCSV(text, name));
      fetchAISummary(result);
      return;
    }

    if (nums && nums.length >= 2) {
      const result = singleColumnAnalysis(nums);
      setAnalysis(result);
      const csvText = ["Values", ...nums.map(String)].join("\n");
      setWorkspaceLoaded(loadCSV(csvText, name ?? "Numbers"));
      fetchAISummary(result);
      return;
    }

    setAnalysis(null);
    setAiError("Could not parse data. Try CSV, TSV, or space/comma separated numbers.");
  }, [loadCSV]);

  /* ── Build analysis for a flat array of numbers ───────────────────── */
  function singleColumnAnalysis(nums: number[]): AnalysisResult {
    const sorted = [...nums].sort((a, b) => a - b);
    const col: ColumnStats = {
      name: "Values",
      count: nums.length,
      mean: mean(nums),
      median: median(nums),
      sd: sd(nums),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      skewness: skewness(nums),
      kurtosis: kurtosis(nums),
      distribution: detectDistribution(nums),
    };
    return {
      columns: [col],
      textColumns: [],
      rowCount: nums.length,
      colCount: 1,
      headers: ["Values"],
      sampleRows: nums.slice(0, 5).map((n) => [String(n)]),
    };
  }

  /* ── CSV analysis ─────────────────────────────────────────────────── */
  function analyzeCSV(csv: ParsedCSV): AnalysisResult {
    const columns: ColumnStats[] = [];
    const numCols = Array.from(csv.numericColumns.entries());
    const numColNames = new Set(csv.numericColumns.keys());
    const textColumns = csv.headers.filter((h) => !numColNames.has(h));

    for (const [name, vals] of numCols) {
      const sorted = [...vals].sort((a, b) => a - b);
      columns.push({
        name,
        count: vals.length,
        mean: mean(vals),
        median: median(vals),
        sd: sd(vals),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        skewness: skewness(vals),
        kurtosis: kurtosis(vals),
        distribution: detectDistribution(vals),
      });
    }

    const correlations: { col1: string; col2: string; r: number }[] = [];
    if (numCols.length >= 2 && numCols.length <= 10) {
      for (let i = 0; i < numCols.length; i++) {
        for (let j = i + 1; j < numCols.length; j++) {
          const [n1, v1] = numCols[i];
          const [n2, v2] = numCols[j];
          const minLen = Math.min(v1.length, v2.length);
          if (minLen >= 3) {
            const r = pearsonR(v1.slice(0, minLen), v2.slice(0, minLen));
            correlations.push({ col1: n1, col2: n2, r });
          }
        }
      }
    }

    return {
      columns,
      textColumns,
      correlations: correlations.length > 0 ? correlations : undefined,
      rowCount: csv.rowCount,
      colCount: csv.colCount,
      headers: csv.headers,
      sampleRows: csv.rows.slice(0, 5),
    };
  }

  /* ── AI summary fetch ─────────────────────────────────────────────── */
  async function fetchAISummary(result: AnalysisResult) {
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = {
        stats: result.columns.map((c) => ({
          name: c.name,
          type: "numeric",
          n: c.count,
          mean: +c.mean.toFixed(4),
          median: +c.median.toFixed(4),
          sd: +c.sd.toFixed(4),
          min: +c.min.toFixed(4),
          max: +c.max.toFixed(4),
          skewness: +c.skewness.toFixed(3),
          kurtosis: +c.kurtosis.toFixed(3),
          likelyDistribution: c.distribution.name,
        })),
        textColumns: result.textColumns.map((name) => ({ name, type: "categorical" })),
        correlations: result.correlations?.map((c) => ({
          ...c,
          r: +c.r.toFixed(3),
        })),
        columns: result.headers,
        rowCount: result.rowCount,
        sampleRows: result.sampleRows.slice(0, 5),
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setAiSummary({
        summary: data.summary || "Analysis complete.",
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  /* ── File handlers ────────────────────────────────────────────────── */
  const handleFile = useCallback(
    (file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        setAiError("File too large (max 5 MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) processData(text, file.name);
      };
      reader.readAsText(file);
    },
    [processData],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const reset = () => {
    setAnalysis(null);
    setAiSummary(null);
    setAiError(null);
    setFileName(null);
    setShowPaste(false);
    setPasteText("");
    setExpanded(true);
    setShowDetailed(false);
    setWorkspaceLoaded(false);
    clearDataset();
  };

  /* ── Smart suggestions (rule-based) ───────────────────────────────── */
  const suggestions = useMemo<Suggestion[]>(
    () => analysis ? buildSuggestions(analysis) : [],
    [analysis],
  );

  /* ── No analysis yet → show drop zone ─────────────────────────────── */
  if (!analysis) {
    return (
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => { if (!showPaste) fileRef.current?.click(); }}
          className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer group ${
            dragOver
              ? "border-orange-400 bg-orange-50/50 dark:bg-orange-950/20"
              : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900/40"
          }`}
        >
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.dat" onChange={onFileInput} className="hidden" />
          <div className="px-5 py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
              dragOver
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-500"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300"
            }`}>
              <Upload className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Drop a dataset for instant analysis</div>
              <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">CSV, TSV, or raw numbers · Instant table + smart suggestions</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPaste(true); }}
              className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline underline-offset-2 decoration-neutral-300 dark:decoration-neutral-700 transition-colors"
            >
              or paste data
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showPaste && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 space-y-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Paste your data here…\n\nExamples:\n• Numbers: 12, 15, 18, 22, 25\n• CSV: name,score\\nAlice,85\\nBob,92"}
                  rows={5}
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm font-mono text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 resize-y"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { if (pasteText.trim()) processData(pasteText.trim(), "Pasted data"); }}
                    disabled={!pasteText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
                  >
                    <Lightbulb className="w-3.5 h-3.5" /> Analyze
                  </button>
                  <button
                    onClick={() => { setShowPaste(false); setPasteText(""); }}
                    className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {aiError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {aiError}
          </div>
        )}
      </div>
    );
  }

  /* ── Analysis results ─────────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-neutral-800/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileSpreadsheet className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0" />
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{fileName || dataset?.name || "Dataset"}</span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono shrink-0">{analysis.rowCount} × {analysis.colCount}</span>
          {workspaceLoaded && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Data loaded — tools will use this dataset
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={reset} className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label="Close analysis">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-5">
              {/* ── Section 1: Data table (first 100 rows × all columns) ── */}
              {dataset && <DataTable dataset={dataset} />}

              {/* ── Section 2: Smart Analyze (rule-based) ── */}
              {suggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400 font-medium">Smart Analyze</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">· {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
                  </div>
                </div>
              )}

              {/* ── Section 3: Detailed column statistics (collapsible) ── */}
              {(analysis.columns.length > 0 || analysis.textColumns.length > 0) && (
                <div>
                  <button
                    onClick={() => setShowDetailed((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                  >
                    <span className={`transition-transform ${showDetailed ? "rotate-90" : ""}`}>▸</span>
                    Detailed column statistics ({analysis.columns.length + analysis.textColumns.length} columns)
                  </button>
                  <AnimatePresence>
                    {showDetailed && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="pt-3 space-y-4">
                          {analysis.columns.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                              {analysis.columns.map((col) => <ColumnCard key={col.name} col={col} />)}
                            </div>
                          )}
                          {analysis.textColumns.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 mb-2">Categorical columns</div>
                              <div className="flex flex-wrap gap-1.5">
                                {analysis.textColumns.map((name) => (
                                  <span key={name} className="inline-flex items-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30 px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400">{name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {analysis.correlations && analysis.correlations.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 mb-2">Notable correlations</div>
                              <div className="flex flex-wrap gap-2">
                                {analysis.correlations
                                  .filter((c) => Math.abs(c.r) > 0.3)
                                  .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
                                  .slice(0, 6)
                                  .map((c) => <CorrelationPill key={`${c.col1}-${c.col2}`} corr={c} />)}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Section 4: Insights (AI summary, secondary) ── */}
              <div className="border-t border-neutral-100 dark:border-neutral-800/60 pt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500">Insights</span>
                </div>
                {aiLoading && (
                  <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Crunching numbers…
                  </div>
                )}
                {aiError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{aiError}
                  </div>
                )}
                {aiSummary && (
                  <div className="space-y-3">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{aiSummary.summary}</p>
                    {aiSummary.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {aiSummary.suggestions.map((s) => {
                          const tool = findTool(s.toolId);
                          if (!tool) return null;
                          return (
                            <Link key={s.toolId} href={`/app?tool=${s.toolId}`} title={s.reason} className="group inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 px-2.5 py-1.5 transition-all">
                              <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">{tool.name}</span>
                              <ArrowRight className="w-3 h-3 text-neutral-300 dark:text-neutral-600 group-hover:text-orange-400 transition-colors" />
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Section 1: Data table ──────────────────────────────────────────── */

const MAX_TABLE_ROWS = 100;

function DataTable({ dataset }: { dataset: Dataset }) {
  const total = dataset.rows.length;
  const shown = Math.min(MAX_TABLE_ROWS, total);
  const rows = dataset.rows.slice(0, shown);
  const cols = dataset.columns;

  // Count unique groups for categorical columns (memoized per column).
  const uniqueCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cols) {
      if (c.type !== "categorical") continue;
      const set = new Set<string>();
      for (const v of c.values) if (v !== null && v !== "") set.add(String(v));
      m.set(c.name, set.size);
    }
    return m;
  }, [cols]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400 font-medium">Data</span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">{total.toLocaleString()} rows · {cols.length} cols</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40">
        <table className="w-full font-mono text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-2 py-1.5 text-right font-normal text-[10px] text-neutral-300 dark:text-neutral-600 sticky left-0 bg-neutral-50 dark:bg-neutral-900 z-20 w-10">#</th>
              {cols.map((c) => (
                <th key={c.name} className="px-3 py-1.5 text-left align-top whitespace-nowrap min-w-[120px] border-l border-neutral-100 dark:border-neutral-800/60">
                  <div className="font-medium text-[11px] text-neutral-800 dark:text-neutral-200 truncate max-w-[220px]">{c.name}</div>
                  <div className="mt-0.5"><TypeBadge col={c} groups={uniqueCounts.get(c.name)} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-neutral-50/60 dark:bg-neutral-800/20"}>
                <td className="px-2 py-1 text-right text-[10px] text-neutral-300 dark:text-neutral-600 sticky left-0 bg-inherit z-[1] w-10 tabular-nums">{i + 1}</td>
                {cols.map((c, j) => {
                  const v = row[c.index];
                  const isNum = typeof v === "number" && Number.isFinite(v);
                  const text = v === null || v === undefined || v === "" ? null : isNum ? formatCell(v as number) : String(v);
                  const align = isNum ? "text-right tabular-nums text-neutral-700 dark:text-neutral-300" : "text-left text-neutral-600 dark:text-neutral-400";
                  return (
                    <td key={j} className={`px-3 py-1 whitespace-nowrap max-w-[260px] truncate border-l border-neutral-100 dark:border-neutral-800/60 ${align}`} title={text ?? ""}>
                      {text ?? <span className="text-neutral-300 dark:text-neutral-700 italic">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
        Showing {shown} of {total.toLocaleString()} rows
      </div>
    </div>
  );
}

function TypeBadge({ col, groups }: { col: Column; groups?: number }) {
  const base = "inline-block px-1.5 py-px rounded text-[9px] font-medium tracking-wide";
  if (col.type === "numeric" && col.numeric.length > 0) {
    return <span className={`${base} text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300`}>NUM</span>;
  }
  if (groups && groups > 0 && groups <= Math.max(20, col.values.length / 2)) {
    return <span className={`${base} text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300`}>CAT · {groups} groups</span>;
  }
  return <span className={`${base} text-neutral-500 bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400`}>TEXT</span>;
}

function formatCell(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e9) return String(n);
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(2);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  return n.toFixed(3);
}

/* ── Section 2: Smart suggestions ───────────────────────────────────── */

function buildSuggestions(a: AnalysisResult): Suggestion[] {
  const out: Suggestion[] = [];
  const nNum = a.columns.length;
  const nCat = a.textColumns.length;

  // Rule 1: two numerics with |r| ≥ 0.5
  const topCorr = a.correlations
    ?.filter((c) => Math.abs(c.r) >= 0.5)
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r))[0];
  if (topCorr) {
    const sign = topCorr.r >= 0 ? "+" : "−";
    const strength = Math.abs(topCorr.r) > 0.7 ? "strong" : "moderate";
    out.push({
      emoji: "📈",
      title: `${topCorr.col1} vs ${topCorr.col2} look related (r = ${sign}${Math.abs(topCorr.r).toFixed(2)})`,
      why: `Pearson correlation is ${strength}, so a linear model or scatter plot will surface the relationship clearly.`,
      buttons: [
        { toolId: "linear-regression", label: "Linear Regression" },
        { toolId: "scatter", label: "Scatter" },
      ],
    });
  }

  // Rule 2: one numeric + one categorical
  if (nNum >= 1 && nCat >= 1) {
    out.push({
      emoji: "📊",
      title: `Compare ${a.columns[0]?.name ?? "value"} across ${a.textColumns[0] ?? "group"} groups`,
      why: "You have a numeric measure and a categorical splitter — perfect for group comparisons and mean-difference tests.",
      buttons: [
        { toolId: "bar-chart", label: "Bar Chart" },
        { toolId: "hypothesis-test", label: "Hypothesis Testing" },
      ],
    });
  }

  // Rule 3: a skewed numeric column (|skew| > 1)
  const skewed = a.columns.find((c) => Math.abs(c.skewness) > 1);
  if (skewed) {
    out.push({
      emoji: "🔔",
      title: `${skewed.name} is ${skewed.skewness > 0 ? "right" : "left"}-skewed`,
      why: `Skewness ≈ ${skewed.skewness.toFixed(2)} — check normality with a Q-Q plot or compare against known distributions before applying parametric tests.`,
      buttons: [
        { toolId: "qq-plot", label: "Q-Q Plot" },
        { toolId: "distribution-explorer", label: "Distribution Explorer" },
      ],
    });
  }

  // Rule 4: 3+ numeric → correlation overview
  if (nNum >= 3) {
    out.push({
      emoji: "🗺️",
      title: `Correlation overview across ${nNum} columns`,
      why: "With several numeric features, a heatmap or PCA biplot reveals which variables move together and which add fresh information.",
      buttons: [
        { toolId: "heatmap", label: "Heatmap" },
        { toolId: "pca", label: "PCA / Biplot" },
      ],
    });
  }

  // Rule 5: sequential first column → time series
  if (isSequentialColumn(a)) {
    out.push({
      emoji: "📅",
      title: "Looks like a time series",
      why: "Your first column looks like an ordered index or evenly-spaced timestamps. Time-series tools will respect ordering and show trends, autocorrelation, and seasonality.",
      buttons: [
        { toolId: "time-series", label: "Time Series" },
        { toolId: "line-chart", label: "Line Chart" },
      ],
    });
  }

  // Rule 6: 2+ categorical
  if (nCat >= 2) {
    out.push({
      emoji: "🔢",
      title: "Cross-tabulation possible",
      why: "Two or more categorical columns let you build a contingency table and test whether the categories are independent.",
      buttons: [
        { toolId: "heatmap", label: "Heatmap" },
        { toolId: "hypothesis-test", label: "Hypothesis Testing" },
      ],
    });
  }

  // Rule 7: single numeric → distribution analysis
  if (nNum === 1 && nCat === 0) {
    out.push({
      emoji: "📐",
      title: `Distribution analysis for ${a.columns[0]?.name ?? "Values"}`,
      why: "One numeric column is ideal for fitting a distribution, estimating mean/SD, and bootstrapping confidence intervals.",
      buttons: [
        { toolId: "normal-distribution", label: "Normal Distribution" },
        { toolId: "bootstrap-sampling", label: "Bootstrap" },
      ],
    });
  }

  return out.slice(0, 4);
}

/** Detect whether the first column looks sequential (1..n or evenly stepped). */
function isSequentialColumn(a: AnalysisResult): boolean {
  if (a.headers.length === 0 || a.sampleRows.length < 3) return false;
  const firstName = a.headers[0];
  // Get the first column values from sampleRows + numeric stats if available.
  const numericCol = a.columns.find((c) => c.name === firstName);
  if (!numericCol) {
    // Try parsing sample rows.
    const vals = a.sampleRows
      .map((r) => Number(r[0]))
      .filter((v) => Number.isFinite(v));
    return checkSequential(vals);
  }
  // We don't have the raw numeric array here, but we have count + range.
  // Use min, max, count to test for an even step.
  if (numericCol.count >= 3) {
    const span = numericCol.max - numericCol.min;
    if (span <= 0) return false;
    const step = span / (numericCol.count - 1);
    // Step ≈ 1 → likely 1..n indices
    if (Math.abs(step - 1) < 0.01 && Math.abs(numericCol.min - Math.round(numericCol.min)) < 0.01) {
      return true;
    }
  }
  return false;
}

function checkSequential(vals: number[]): boolean {
  if (vals.length < 3) return false;
  const diffs: number[] = [];
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);
  if (diffs.length === 0) return false;
  const first = diffs[0];
  if (first === 0) return false;
  return diffs.every((d) => Math.abs(d - first) < 1e-6 * Math.max(1, Math.abs(first)));
}

function SuggestionCard({ s }: { s: Suggestion }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:border-orange-300 dark:hover:border-orange-700/60 hover:bg-orange-50/30 dark:hover:bg-orange-950/10 transition-all p-3.5">
      <div className="flex items-start gap-2 mb-1">
        <span className="text-base leading-none mt-0.5" aria-hidden="true">{s.emoji}</span>
        <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 leading-snug flex-1 min-w-0">{s.title}</div>
      </div>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2.5 pl-6">{s.why}</p>
      <div className="flex flex-wrap gap-1.5 pl-6">
        {s.buttons.map((b) => {
          const label = findTool(b.toolId)?.name ?? b.label;
          return (
            <Link
              key={b.toolId}
              href={`/app?tool=${b.toolId}`}
              className="group inline-flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 hover:border-orange-300 dark:hover:border-orange-700/60 px-2.5 py-1 transition-all"
            >
              <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-orange-600 dark:group-hover:text-orange-400">{label}</span>
              <ArrowRight className="w-3 h-3 text-neutral-300 dark:text-neutral-600 group-hover:text-orange-500 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Section 3 sub-components ────────────────────────────────────────── */

function ColumnCard({ col }: { col: ColumnStats }) {
  const distColor =
    col.distribution.confidence === "high"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
      : col.distribution.confidence === "medium"
        ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        : "text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700";
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{col.name}</span>
        <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${distColor}`}>{col.distribution.name}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
        <StatMini label="Mean" value={fmt(col.mean)} />
        <StatMini label="Median" value={fmt(col.median)} />
        <StatMini label="SD" value={fmt(col.sd)} />
        <StatMini label="Min" value={fmt(col.min)} />
        <StatMini label="Max" value={fmt(col.max)} />
        <StatMini label="n" value={String(col.count)} />
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-neutral-400 dark:text-neutral-500">{label}</div>
      <div className="text-neutral-700 dark:text-neutral-300 font-mono tabular-nums">{value}</div>
    </div>
  );
}

function CorrelationPill({ corr }: { corr: { col1: string; col2: string; r: number } }) {
  const color = Math.abs(corr.r) > 0.7
    ? "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20"
    : "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30";
  const sign = corr.r > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${color}`}>
      <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-[80px]">{corr.col1}</span>
      <span className="text-neutral-300 dark:text-neutral-600">↔</span>
      <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-[80px]">{corr.col2}</span>
      <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">{sign}{corr.r.toFixed(2)}</span>
    </span>
  );
}

function fmt(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e6) return String(n);
  if (Math.abs(n) < 0.01 && n !== 0) return n.toExponential(2);
  return n.toFixed(2);
}
