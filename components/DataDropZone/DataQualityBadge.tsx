"use client";

/**
 * DataDropZone/DataQualityBadge.tsx
 *
 * Compact quality score pill shown in the dataset header + an expandable
 * detail panel with per-column missing bars, outlier counts, warnings list,
 * and download buttons for the template and error report.
 */
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  ChevronDown, Download, Info,
} from "lucide-react";
import { generateTemplateCsv, generateWarningsCsv, fmt } from "./analyse";
import type { DataQualityInfo, AnalysisResult, ColumnRole } from "./types";

/* ── Grade config ────────────────────────────────────────────────────── */

type GradeConfig = {
  color: string;        // Tailwind text-* class
  bg: string;           // Tailwind bg-* class
  border: string;       // Tailwind border-* class
  Icon: typeof ShieldCheck;
};

const GRADE_CONFIG: Record<string, GradeConfig> = {
  Excellent: {
    color: "text-emerald-700 dark:text-emerald-300",
    bg:    "bg-emerald-50 dark:bg-emerald-950/40",
    border:"border-emerald-200 dark:border-emerald-800",
    Icon:  ShieldCheck,
  },
  Good: {
    color: "text-green-700 dark:text-green-300",
    bg:    "bg-green-50 dark:bg-green-950/30",
    border:"border-green-200 dark:border-green-800",
    Icon:  ShieldCheck,
  },
  Fair: {
    color: "text-amber-700 dark:text-amber-300",
    bg:    "bg-amber-50 dark:bg-amber-950/30",
    border:"border-amber-200 dark:border-amber-800",
    Icon:  ShieldAlert,
  },
  Poor: {
    color: "text-orange-700 dark:text-orange-300",
    bg:    "bg-orange-50 dark:bg-orange-950/30",
    border:"border-orange-200 dark:border-orange-800",
    Icon:  ShieldAlert,
  },
  Critical: {
    color: "text-red-700 dark:text-red-300",
    bg:    "bg-red-50 dark:bg-red-950/30",
    border:"border-red-200 dark:border-red-800",
    Icon:  ShieldX,
  },
};

/* ── Column role badge ───────────────────────────────────────────────── */

const ROLE_LABEL: Record<ColumnRole, string> = {
  numeric:     "NUM",
  boolean:     "BOOL",
  date:        "DATE",
  categorical: "CAT",
  id_like:     "ID",
  text:        "TEXT",
};

const ROLE_COLOR: Record<ColumnRole, string> = {
  numeric:     "text-blue-600   bg-blue-50   dark:bg-blue-950/40  dark:text-blue-300  border-blue-200   dark:border-blue-800",
  boolean:     "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  date:        "text-teal-600   bg-teal-50   dark:bg-teal-950/40  dark:text-teal-300  border-teal-200   dark:border-teal-800",
  categorical: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  id_like:     "text-neutral-500 bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700",
  text:        "text-neutral-500 bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
};

/* ── Download helper ─────────────────────────────────────────────────── */

function downloadText(content: string, filename: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Missing bar (per-column horizontal bar) ─────────────────────────── */

function MissingBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.round(rate * 100);
  const color =
    pct === 0 ? "bg-emerald-400 dark:bg-emerald-500"
    : pct < 5  ? "bg-amber-400 dark:bg-amber-500"
    : pct < 20 ? "bg-orange-400 dark:bg-orange-500"
               : "bg-red-400 dark:bg-red-500";

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-24 truncate text-neutral-500 dark:text-neutral-400 text-right shrink-0" title={label}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden min-w-0">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(pct === 0 ? 0 : 2, pct)}%` }}
        />
      </div>
      <span className={`w-8 text-right font-mono shrink-0 ${pct > 0 ? "text-orange-600 dark:text-orange-400" : "text-neutral-400 dark:text-neutral-600"}`}>
        {pct}%
      </span>
    </div>
  );
}

/* ── Warning row ─────────────────────────────────────────────────────── */

const WARNING_COLOR: Record<string, string> = {
  injection:       "text-red-600 dark:text-red-400",
  wrong_col_count: "text-orange-600 dark:text-orange-400",
  type_mismatch:   "text-amber-600 dark:text-amber-400",
  missing_value:   "text-neutral-500 dark:text-neutral-400",
};

/* ── Main badge component ────────────────────────────────────────────── */

type Props = {
  quality: DataQualityInfo;
  analysis: AnalysisResult;
  fileName: string | null;
};

export function DataQualityBadge({ quality, analysis, fileName }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "issues" | "schema">("overview");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const cfg = GRADE_CONFIG[quality.grade] ?? GRADE_CONFIG.Fair;
  const { Icon } = cfg;

  const hasWarnings = quality.warnings.length > 0 || quality.injectionCount > 0;
  const baseName = (fileName ?? "dataset").replace(/\.[^.]+$/, "");

  return (
    <div ref={containerRef} className="relative text-xs">
      {/* ── Compact pill shown in header ──────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium transition-all hover:opacity-90 ${cfg.color} ${cfg.bg} ${cfg.border}`}
        title="Data quality report"
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{quality.score}</span>
        <span className="opacity-70">{quality.grade}</span>
        {hasWarnings && (
          <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[9px]">
            <AlertTriangle className="w-2.5 h-2.5" />
            {quality.warnings.length + (quality.injectionCount > 0 ? 1 : 0)}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 transition-transform opacity-60 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Expandable detail panel ────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-[485px] max-w-[calc(100vw-2rem)]"
          >
            <div className={`rounded-xl border ${cfg.border} bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-2xl p-4 flex flex-col max-h-[min(540px,75vh)] text-left`}>
              {/* Scoped CSS for beautiful scrollbars */}
              <style dangerouslySetInnerHTML={{__html: `
                .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
                  height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: rgba(156, 163, 175, 0.35);
                  border-radius: 9999px;
                }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: rgba(75, 85, 99, 0.5);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: rgba(156, 163, 175, 0.5);
                }
              `}} />

              {/* ── Tabs Navigation ───────────────────────────────────────── */}
              <div className="flex items-center gap-1 mt-3 pb-2 border-b border-neutral-100 dark:border-neutral-800/80 shrink-0">
                {(["overview", "issues", "schema"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                      activeTab === tab
                        ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === "issues" && hasWarnings && (
                      <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-[9px] font-bold text-red-600 dark:text-red-400">
                        !
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Scrollable Body Area ────────────────────────────── */}
              <div className="flex-1 overflow-y-auto py-3 min-h-[150px] pr-1.5 -mr-1.5 custom-scrollbar relative">
                <AnimatePresence mode="wait">
                  {activeTab === "overview" && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {/* Sticky Header: Score + meta moved to Overview tab */}
                      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-neutral-100 dark:border-neutral-800">
                        <div className="space-y-1">
                          <div className={`text-3xl font-bold tabular-nums ${cfg.color}`}>
                            {quality.score}
                            <span className="text-sm font-normal ml-1 opacity-60">/ 100</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 mt-2">
                            {quality.delimiter !== "none" && (
                              <span>Delimiter: <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">{quality.delimiter === "\\t" ? "tab" : `"${quality.delimiter}"`}</span></span>
                            )}
                            {quality.hasBOM && <span className="text-amber-500 font-medium">BOM stripped</span>}
                            <span>Completeness: <span className="font-medium text-neutral-700 dark:text-neutral-300">{quality.completeness}%</span></span>
                            {quality.duplicateRows > 0 && (
                              <span className="text-orange-500 font-medium">{quality.duplicateRows} duplicate rows</span>
                            )}
                          </div>
                        </div>

                        {/* Score gauge with glow */}
                        <div className="relative w-16 h-16 shrink-0">
                          <div className={`absolute inset-0 rounded-full blur-xl opacity-20 ${cfg.bg.replace('bg-', 'bg-')}`} />
                          <svg viewBox="0 0 36 36" className="relative w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none"
                              className="stroke-neutral-100 dark:stroke-neutral-800" strokeWidth="3.5" />
                            <circle cx="18" cy="18" r="15.9" fill="none"
                              strokeDasharray={`${quality.score} 100`}
                              strokeLinecap="round" strokeWidth="3.5"
                              className={quality.score >= 90 ? "stroke-emerald-500 drop-shadow-md"
                                : quality.score >= 75 ? "stroke-green-500 drop-shadow-md"
                                : quality.score >= 60 ? "stroke-amber-500 drop-shadow-md"
                                : quality.score >= 40 ? "stroke-orange-500 drop-shadow-md"
                                : "stroke-red-500 drop-shadow-md"} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Icon className={`w-6 h-6 ${cfg.color}`} />
                          </div>
                        </div>
                      </div>

                      {/* Missing values per column */}
                      {analysis.columns.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500 mb-3 font-semibold">
                            Missing Values Summary
                          </div>
                          <div className="space-y-1.5">
                            {analysis.columns.map((c) => (
                              <MissingBar key={c.name} rate={c.missingRate} label={c.name} />
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === "issues" && (
                    <motion.div
                      key="issues"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      {/* CSV Injection Alert */}
                      {quality.injectionCount > 0 && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/15 p-3.5 text-xs text-red-700 dark:text-red-400 shadow-sm">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="leading-relaxed">
                            <span className="font-semibold block mb-1">CSV Injection Risk Detected</span>
                            {quality.injectionCount} cell{quality.injectionCount > 1 ? "s" : ""} start with formula characters (=, +, -, @).
                            This is a potential security risk if you open this file in Excel or Google Sheets.
                          </div>
                        </div>
                      )}

                      {/* Warnings List */}
                      {quality.warnings.length > 0 ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500 mb-2 font-semibold flex items-center justify-between">
                            <span>Parse Warnings ({quality.warnings.length})</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/40 dark:bg-neutral-900/30 p-2.5 custom-scrollbar">
                            {quality.warnings.slice(0, 20).map((w, i) => (
                              <div key={i} className="flex items-start gap-2.5 text-[10.5px] leading-relaxed border-b border-neutral-200/50 dark:border-neutral-800/50 last:border-0 pb-1.5 last:pb-0">
                                <span className="text-neutral-400 dark:text-neutral-500 font-mono shrink-0 mt-px bg-white dark:bg-neutral-800 px-1 rounded shadow-sm">
                                  r{w.row}
                                </span>
                                {w.col && (
                                  <span className="text-neutral-600 dark:text-neutral-300 shrink-0 mt-px truncate max-w-[75px] font-medium" title={w.col}>
                                    {w.col}
                                  </span>
                                )}
                                <span className={`flex-1 ${WARNING_COLOR[w.kind] ?? "text-neutral-500"}`}>
                                  {w.detail}
                                  {w.rawValue && (
                                    <span className="ml-1.5 font-mono opacity-70 text-[9px] bg-white dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-100 dark:border-neutral-700">{w.rawValue.slice(0, 25)}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                            {quality.warnings.length > 20 && (
                              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 text-center pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800">
                                +{quality.warnings.length - 20} more — please download the error report.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                         <div className="text-center py-6 text-neutral-500 dark:text-neutral-400 text-xs">
                           <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                           No parsing warnings found.
                         </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === "schema" && (
                    <motion.div
                      key="schema"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      {/* Outliers */}
                      {analysis.columns.some((c) => c.outlierCount > 0) && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500 mb-2 font-semibold">
                            Outliers (1.5×IQR method)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {analysis.columns
                              .filter((c) => c.outlierCount > 0)
                              .sort((a, b) => b.outlierCount - a.outlierCount)
                              .map((c) => (
                                <span
                                  key={c.name}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700/80 bg-white dark:bg-neutral-800 px-2.5 py-1 text-[11px] shadow-sm"
                                  title={`Fences: [${fmt(c.lowerFence)}, ${fmt(c.upperFence)}]`}
                                >
                                  <span className="text-neutral-700 dark:text-neutral-300 truncate max-w-[100px] font-medium">{c.name}</span>
                                  <span className="text-orange-600 dark:text-orange-400 font-mono font-bold bg-orange-50 dark:bg-orange-900/30 px-1.5 rounded-md">×{c.outlierCount}</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Column roles */}
                      {(analysis.textColumns.length > 0) && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500 mb-2 font-semibold">
                            Inferred Column Roles
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {analysis.textColumns.map((name) => {
                              const role = analysis.textColumnRoles.get(name) ?? "text";
                              return (
                                <span
                                  key={name}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] shadow-sm ${ROLE_COLOR[role]}`}
                                >
                                  <span className="font-bold text-[9px] uppercase tracking-wider bg-white/50 dark:bg-black/20 px-1 rounded">{ROLE_LABEL[role]}</span>
                                  <span className="opacity-90 truncate max-w-[120px] font-medium">{name}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Sticky Footer: Action buttons ───────────────────── */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 shrink-0 items-center">
                <button
                  onClick={() =>
                    downloadText(generateTemplateCsv(analysis.headers), `${baseName}_template.csv`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Template CSV
                </button>
                {quality.warnings.length > 0 && (
                  <button
                    onClick={() =>
                      downloadText(
                        generateWarningsCsv(quality.warnings),
                        `${baseName}_quality_report.csv`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Error Report CSV
                  </button>
                )}
                <div className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-505 ml-auto">
                  <Info className="w-3 h-3" />
                  Outliers via 1.5×IQR fence
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
