"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, ChevronUp, ChevronDown, X, Settings, RotateCcw, Undo2, Redo2, Zap } from "lucide-react";
import { useWorkspace, type Filter } from "./WorkspaceProvider";
import type { Column } from "@/lib/dataset";

type Badge = "NUM" | "CAT" | "TEXT";

function badgeFor(col: Column): Badge {
  if (col.type === "numeric") return "NUM";
  const nonNull = col.values.filter((v) => v !== null && v !== "");
  const unique = new Set(nonNull).size;
  if (nonNull.length >= 10 && unique / nonNull.length > 0.9) return "TEXT";
  return "CAT";
}

function badgeClasses(b: Badge): string {
  switch (b) {
    case "NUM":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "CAT":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "TEXT":
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  }
}

export default function DataStrip() {
  const {
    dataset, clearDataset,
    transformColumn, imputeColumn, dropMissing, deleteColumn,
    applyFilter, clearFilter, resetDataset,
    activeFilters, hasModifications,
    perfStats, undo, redo, canUndo, canRedo,
  } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [activeMenuCol, setActiveMenuCol] = useState<number | null>(null);

  // Filter form state
  const [filterColName, setFilterColName] = useState("");
  const [filterOp, setFilterOp] = useState<Filter["operator"]>("==");
  const [filterVal, setFilterVal] = useState("");

  // Initialize selected filter column
  useEffect(() => {
    if (dataset && dataset.columns.length > 0 && !filterColName) {
      setFilterColName(dataset.columns[0].name);
    }
  }, [dataset, filterColName]);

  if (!dataset) return null;

  const rows = dataset.rows.length;
  const cols = dataset.columns.length;
  const previewRows = dataset.rows.slice(0, 50);

  const selectedCol = dataset.columns.find((c) => c.name === filterColName);
  const isNumeric = selectedCol?.type === "numeric";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur font-mono text-xs">
      {/* Click outside overlay for column header menu */}
      {activeMenuCol !== null && (
        <div
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setActiveMenuCol(null)}
        />
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="data-strip-expanded"
            initial={{ height: 0 }}
            animate={{ height: 380 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-b border-neutral-200 dark:border-neutral-800"
          >
            <div className="h-[380px] flex flex-col">
              {/* Wrangle / Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-neutral-500 dark:text-neutral-400">Filter:</span>
                  <select
                    value={filterColName}
                    onChange={(e) => {
                      setFilterColName(e.target.value);
                      setFilterOp("==");
                    }}
                    className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs outline-none"
                  >
                    {dataset.columns.map((c) => (
                      <option key={c.index} value={c.name}>{c.name}</option>
                    ))}
                  </select>

                  <select
                    value={filterOp}
                    onChange={(e) => setFilterOp(e.target.value as Filter["operator"])}
                    className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs outline-none"
                  >
                    {isNumeric ? (
                      <>
                        <option value="==">equals</option>
                        <option value="!=">not equals</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="is_empty">is empty</option>
                        <option value="is_not_empty">is not empty</option>
                      </>
                    ) : (
                      <>
                        <option value="==">equals</option>
                        <option value="!=">not equals</option>
                        <option value="contains">contains</option>
                        <option value="is_empty">is empty</option>
                        <option value="is_not_empty">is not empty</option>
                      </>
                    )}
                  </select>

                  {filterOp !== "is_empty" && filterOp !== "is_not_empty" && (
                    <input
                      type="text"
                      placeholder="value"
                      value={filterVal}
                      onChange={(e) => setFilterVal(e.target.value)}
                      className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs outline-none w-28"
                    />
                  )}

                  <button
                    onClick={() => {
                      if (!filterColName) return;
                      applyFilter(filterColName, filterOp, filterVal);
                      setFilterVal("");
                    }}
                    className="bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded px-2.5 py-1 text-xs font-semibold transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-[200px] overflow-x-auto py-0.5">
                  {activeFilters.map((f, fi) => (
                    <span
                      key={fi}
                      className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 text-[10px] font-semibold"
                    >
                      <span>{f.colName}</span>
                      <span className="text-amber-500 font-bold">{f.operator}</span>
                      {f.operator !== "is_empty" && f.operator !== "is_not_empty" && (
                        <span>"{f.value}"</span>
                      )}
                      <button
                        onClick={() => clearFilter(fi)}
                        className="hover:bg-amber-200/50 dark:hover:bg-amber-900/50 rounded-full p-0.5 transition-colors ml-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Reset button */}
                {hasModifications && (
                  <button
                    onClick={resetDataset}
                    className="inline-flex items-center gap-1 bg-white hover:bg-neutral-50 dark:bg-neutral-950 dark:hover:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-600 dark:text-neutral-400 font-semibold transition-colors shadow-sm shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Table preview */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                      {dataset.columns.map((c) => {
                        const b = badgeFor(c);
                        return (
                          <th
                            key={c.index}
                            className="px-3 py-2 text-left font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap relative group"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span>{c.name}</span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] tracking-wider uppercase ${badgeClasses(b)}`}
                                >
                                  {b}
                                </span>
                              </div>

                              <button
                                onClick={() => setActiveMenuCol((prev) => (prev === c.index ? null : c.index))}
                                className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Column Header Dropdown Menu */}
                            {activeMenuCol === c.index && (
                              <div className="absolute right-0 top-full mt-1 w-48 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg z-50 text-left font-sans font-normal normal-case py-1">
                                {c.type === "numeric" && (
                                  <>
                                    <div className="px-2.5 py-1 text-[9px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                                      Transform (New Col)
                                    </div>
                                    <button
                                      onClick={() => {
                                        transformColumn(c.index, "log");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Log Transform (ln)
                                    </button>
                                    <button
                                      onClick={() => {
                                        transformColumn(c.index, "sqrt");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Square Root (√x)
                                    </button>
                                    <button
                                      onClick={() => {
                                        transformColumn(c.index, "zscore");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Z-score Normalization
                                    </button>
                                    <button
                                      onClick={() => {
                                        transformColumn(c.index, "sq");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Square (x²)
                                    </button>
                                    <button
                                      onClick={() => {
                                        transformColumn(c.index, "inverse");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Inverse (1/x)
                                    </button>
                                    <div className="border-t border-neutral-100 dark:border-neutral-900 my-1" />
                                  </>
                                )}

                                {c.type === "numeric" && (
                                  <>
                                    <div className="px-2.5 py-1 text-[9px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                                      Impute Missing
                                    </div>
                                    <button
                                      onClick={() => {
                                        imputeColumn(c.index, "mean");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Fill with Mean
                                    </button>
                                    <button
                                      onClick={() => {
                                        imputeColumn(c.index, "median");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Fill with Median
                                    </button>
                                    <button
                                      onClick={() => {
                                        imputeColumn(c.index, "zero");
                                        setActiveMenuCol(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                    >
                                      Fill with 0
                                    </button>
                                    <div className="border-t border-neutral-100 dark:border-neutral-900 my-1" />
                                  </>
                                )}

                                <div className="px-2.5 py-1 text-[9px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                                  Clean &amp; Delete
                                </div>
                                <button
                                  onClick={() => {
                                    dropMissing(c.index);
                                    setActiveMenuCol(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-xs"
                                >
                                  Drop Missing Rows
                                </button>
                                <button
                                  onClick={() => {
                                    deleteColumn(c.index);
                                    setActiveMenuCol(null);
                                  }}
                                  disabled={dataset.columns.length <= 1}
                                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 text-xs disabled:opacity-50"
                                >
                                  Delete Column
                                </button>
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, ri) => (
                      <tr
                        key={ri}
                        className={
                          ri % 2 === 0
                            ? "bg-white dark:bg-neutral-950"
                            : "bg-neutral-50 dark:bg-neutral-900/50"
                        }
                      >
                        {dataset.columns.map((c) => {
                          const v = r[c.index];
                          return (
                            <td
                              key={c.index}
                              className="px-3 py-1.5 text-neutral-700 dark:text-neutral-300 whitespace-nowrap"
                            >
                              {v === null || v === "" ? (
                                <span className="text-neutral-400 dark:text-neutral-600">—</span>
                              ) : (
                                String(v)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 text-neutral-500 dark:text-neutral-400">
                Showing {Math.min(50, rows)} of {rows} rows
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-10 px-4 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0 text-neutral-700 dark:text-neutral-200">
          <Database className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
          <span className="font-medium truncate max-w-[200px]">{dataset.name}</span>
          <span className="text-neutral-400 dark:text-neutral-500">
            · {rows} rows × {cols} cols
          </span>
        </div>

        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {dataset.columns.map((c) => {
              const b = badgeFor(c);
              return (
                <span
                  key={c.index}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-0.5"
                >
                  <span className="text-neutral-700 dark:text-neutral-200">{c.name}</span>
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] tracking-wider uppercase ${badgeClasses(b)}`}
                  >
                    {b}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Performance HUD Badge */}
          {perfStats && perfStats.totalRows > 0 && activeFilters.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium tabular-nums mr-1">
              <Zap className="w-2.5 h-2.5" />
              {perfStats.matchedRows.toLocaleString()}/{perfStats.totalRows.toLocaleString()} in {perfStats.filterTimeMs}ms
            </span>
          )}

          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse data preview" : "Expand data preview"}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={clearDataset}
            aria-label="Clear dataset"
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
