"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, ChevronUp, ChevronDown, X } from "lucide-react";
import { useWorkspace } from "./WorkspaceProvider";
import type { Column } from "@/lib/dataset";

type Badge = "NUM" | "CAT" | "TEXT";

function badgeFor(col: Column): Badge {
  if (col.type === "numeric") return "NUM";
  // Heuristic: if a categorical column has many unique values relative to row
  // count, treat it as free-form TEXT rather than a true category.
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
  const { dataset, clearDataset } = useWorkspace();
  const [expanded, setExpanded] = useState(false);

  if (!dataset) return null;

  const rows = dataset.rows.length;
  const cols = dataset.columns.length;
  const previewRows = dataset.rows.slice(0, 50);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur font-mono text-xs">
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="data-strip-expanded"
            initial={{ height: 0 }}
            animate={{ height: 320 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-b border-neutral-200 dark:border-neutral-800"
          >
            <div className="h-[320px] flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                      {dataset.columns.map((c) => {
                        const b = badgeFor(c);
                        return (
                          <th
                            key={c.index}
                            className="px-3 py-2 text-left font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap"
                          >
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] tracking-wider uppercase ${badgeClasses(b)}`}
                              >
                                {b}
                              </span>
                            </div>
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
