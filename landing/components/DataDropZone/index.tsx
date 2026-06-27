"use client";

/**
 * DataDropZone/index.tsx
 *
 * Thin orchestrator (~80 lines of JSX).
 * All logic lives in useDataAnalysis(); all sub-UI in DropZone / DataTable / StatCards.
 *
 * Public import path unchanged:
 *   import DataDropZone from "@/components/DataDropZone";
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, CheckCircle2, Sparkles, X } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { useDataAnalysis } from "./useDataAnalysis";
import { DropZone } from "./DropZone";
import { DataTable } from "./DataTable";
import { ColumnCard, CorrelationPill, SuggestionCard } from "./StatCards";
import { DataQualityBadge } from "./DataQualityBadge";
import NarrativeReport from "@/components/workspace/NarrativeReport";
import InsightsBar from "@/components/InsightsBar";

export default function DataDropZone() {
  const { dataset } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"table" | "report">("table");
  const {
    analysis, parseError, fileName, workspaceLoaded, suggestions,
    dragOver, showPaste, pasteText, showDetailed,
    fileRef,
    onDrop, onDragOver, onDragLeave, onFileInput,
    onPasteSubmit, setPasteText, setShowPaste, setShowDetailed,
    loadExampleDataset, explainDatasetWithTutor, reset,
  } = useDataAnalysis();

  const handleColumnStatsClick = (name: string) => {
    const wasAlreadyOpen = showDetailed;
    if (!wasAlreadyOpen) {
      setShowDetailed(true);
    }
    
    setTimeout(() => {
      const section = document.getElementById("detailed-stats-section");
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      
      const el = document.getElementById(`col-card-${name}`);
      if (el) {
        const container = el.closest(".overflow-y-auto");
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const relativeTop = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({
            top: relativeTop - (containerRect.height / 2) + (elRect.height / 2),
            behavior: "smooth",
          });
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        el.classList.add("ring-2", "ring-orange-500/40", "scale-[1.02]", "bg-orange-550/5");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-orange-500/40", "scale-[1.02]", "bg-orange-550/5");
        }, 2200);
      }
    }, wasAlreadyOpen ? 50 : 380);
  };

  /* ── Empty state: show drop zone ─────────────────────────────────── */
  if (!analysis) {
    return (
      <DropZone
        dragOver={dragOver}
        showPaste={showPaste}
        pasteText={pasteText}
        parseError={parseError}
        fileRef={fileRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onFileInput={onFileInput}
        onPasteSubmit={onPasteSubmit}
        setPasteText={setPasteText}
        setShowPaste={setShowPaste}
        loadExample={loadExampleDataset}
      />
    );
  }

  /* ── Post-drop: header + table + detailed stats ──────────────────── */
  const totalCols = analysis.columns.length + analysis.textColumns.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col space-y-4 w-full"
    >
      {/* ── Header row ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {fileName || dataset?.name || "Dataset"}
            </div>
            <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5">
              {analysis.rowCount.toLocaleString()} rows × {analysis.colCount} cols
            </div>
          </div>
          {workspaceLoaded && (
            <span className="hidden md:inline-flex items-center gap-1 ml-2 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Loaded
            </span>
          )}
        </div>

        {/* Quality badge — centre of header */}
        <DataQualityBadge
          quality={analysis.quality}
          analysis={analysis}
          fileName={fileName}
        />

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all duration-200 active:scale-95"
            aria-label="Reset dataset"
          >
            <X className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* ── Tabs selector & AI CTA ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-200 dark:border-neutral-800 gap-4 overflow-x-auto print:hidden">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("table")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              activeTab === "table"
                ? "text-neutral-900 dark:text-neutral-100 border-b-2 border-orange-500 font-bold"
                : "text-neutral-500 dark:text-neutral-450 hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            Dataset Overview
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              activeTab === "report"
                ? "text-neutral-900 dark:text-neutral-100 border-b-2 border-orange-500 font-bold"
                : "text-neutral-500 dark:text-neutral-450 hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            AI Narrative Report
          </button>
        </div>

        <div className="flex items-center pb-1.5 sm:pb-0 shrink-0">
          <button
            onClick={explainDatasetWithTutor}
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 dark:border-orange-900/30 bg-orange-50/50 hover:bg-orange-100/60 dark:bg-orange-950/15 dark:hover:bg-orange-950/30 text-orange-650 dark:text-orange-400 px-4 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm active:scale-95"
            aria-label="Explain dataset with AI tutor"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            Explain with AI
          </button>
        </div>
      </div>

      {activeTab === "report" ? (
        <NarrativeReport />
      ) : (
        <>
          {/* ── Auto-Insights ─────────────────────────────────────────── */}
          {dataset && <InsightsBar />}

          {/* ── Data table ────────────────────────────────────────────── */}
          {dataset && (
            <div className="h-[650px] flex flex-col shrink-0">
              <DataTable dataset={dataset} onColumnStatsClick={handleColumnStatsClick} />
            </div>
          )}

          {/* ── Recommended Analyses ──────────────────────────────────── */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 font-semibold select-none">
                Recommended Analyses
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestions.map((s, i) => (
                  <SuggestionCard key={i} s={s} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Collapsible detailed column statistics ─────────────────── */}
      {activeTab === "table" && totalCols > 0 && (
        <div id="detailed-stats-section" className="flex flex-col min-h-0 shrink-0">
          <button
            onClick={() => setShowDetailed((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors self-start mb-2"
          >
            <span className={`transition-transform inline-block ${showDetailed ? "rotate-90" : ""}`}>›</span>
            Detailed column statistics ({totalCols} columns)
          </button>

          <AnimatePresence>
            {showDetailed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm"
              >
                <div className="p-4 space-y-6 max-h-[40vh] overflow-y-auto custom-scrollbar">
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

                  {analysis.columns.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 font-semibold">
                        Numeric Columns
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {analysis.columns.map((col) => (
                          <ColumnCard key={col.name} col={col} />
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.textColumns.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 font-semibold">
                        Categorical & Text Columns
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.textColumns.map((name) => (
                          <span
                            key={name}
                            id={`col-card-${name}`}
                            className="inline-flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30 px-2.5 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 font-medium shadow-sm transition-all duration-500"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.correlations && analysis.correlations.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-500 font-semibold">
                        Notable Correlations
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.correlations
                          .filter((c) => Math.abs(c.r) > 0.3)
                          .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
                          .slice(0, 10)
                          .map((c) => (
                            <CorrelationPill key={`${c.col1}-${c.col2}`} corr={c} />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
