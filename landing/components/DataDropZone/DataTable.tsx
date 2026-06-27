"use client";

/**
 * DataDropZone/DataTable.tsx
 *
 * Paginated, sortable, filterable, inline-editable data table.
 * Extracted verbatim from the original DataDropZone.tsx (lines 592–941).
 * Accepts dataset + suggestions as props; owns only its own UI state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search, X, ChevronUp, ChevronDown, Maximize2, Minimize2, BarChart3
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { findTool } from "@/lib/tools";
import { formatCell } from "./analyse";
import type { Column, Dataset } from "@/lib/dataset";

/* ── Spark histogram (inline SVG mini-chart in column header) ─────────── */

function SparkHistogram({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;

  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }

  if (min === max) {
    return (
      <svg width="60" height="16" className="mt-1.5 opacity-70">
        <rect x="0" y="0" width="60" height="16" fill="var(--chart-ink)" opacity={0.6} rx={1} />
      </svg>
    );
  }

  const binCount = 8;
  const bins = Array(binCount).fill(0);
  const binWidth = (max - min) / binCount;

  for (const v of values) {
    const binIdx = Math.min(binCount - 1, Math.floor((v - min) / binWidth));
    bins[binIdx]++;
  }

  const maxBin = Math.max(...bins);
  if (maxBin === 0) return null;

  const w = 60;
  const h = 16;
  const barWidth = w / binCount - 1;

  return (
    <svg width={w} height={h} className="mt-1.5 opacity-60 hover:opacity-100 transition-opacity">
      {bins.map((count, i) => {
        const barHeight = (count / maxBin) * h;
        return (
          <rect
            key={i}
            x={i * (barWidth + 1)}
            y={h - barHeight}
            width={barWidth}
            height={Math.max(1.5, barHeight)}
            fill="var(--chart-ink)"
            opacity={0.7}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

/* ── Column type badge ────────────────────────────────────────────────── */

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

/* ── Main DataTable component ─────────────────────────────────────────── */

type DataTableProps = {
  dataset: Dataset;
  onColumnStatsClick?: (colName: string) => void;
};

export function DataTable({ dataset, onColumnStatsClick }: DataTableProps) {
  const { updateCell } = useWorkspace();
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isCancellingRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const cols = dataset.columns;

  // Unique group counts for categorical columns.
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

  const rowsWithIndex = useMemo(
    () => dataset.rows.map((row, idx) => ({ idx, row })),
    [dataset.rows],
  );

  const filteredRows = useMemo(() => {
    if (!debouncedSearch.trim()) return rowsWithIndex;
    const term = debouncedSearch.toLowerCase().trim();
    return rowsWithIndex.filter(({ row }) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(term)),
    );
  }, [rowsWithIndex, debouncedSearch]);

  // 2. Sort
  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    const col = cols.find((c) => c.name === sortCol);
    if (!col) return filteredRows;

    const idx = col.index;
    const isNumeric = col.type === "numeric";

    return [...filteredRows].sort((a, b) => {
      const vA = a.row[idx];
      const vB = b.row[idx];

      const nullA = vA === null || vA === undefined || vA === "";
      const nullB = vB === null || vB === undefined || vB === "";
      if (nullA && nullB) return 0;
      if (nullA) return 1;
      if (nullB) return -1;

      if (isNumeric) {
        const nA = Number(vA);
        const nB = Number(vB);
        return sortDir === "asc" ? nA - nB : nB - nA;
      }
      const sA = String(vA);
      const sB = String(vB);
      return sortDir === "asc"
        ? sA.localeCompare(sB, undefined, { numeric: true, sensitivity: "base" })
        : sB.localeCompare(sA, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [filteredRows, sortCol, sortDir, cols]);

  // 3. Virtualize
  const totalRows = sortedRows.length;
  
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // Approximate height of a row
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end || 0)
    : 0;

  const handleSort = useCallback((colName: string) => {
    setSortCol((prev) => {
      if (prev !== colName) { setSortDir("asc"); return colName; }
      if (sortDir === "asc") { setSortDir("desc"); return colName; }
      return null;
    });
  }, [sortDir]);

  const saveEdit = useCallback(
    (rowIdx: number, colIdx: number) => {
      if (isCancellingRef.current) return;
      const col = cols[colIdx];
      let parsed: number | string | null = editValue.trim();
      if (
        parsed === "" ||
        parsed.toLowerCase() === "na" ||
        parsed.toLowerCase() === "n/a" ||
        parsed.toLowerCase() === "null"
      ) {
        parsed = null;
      } else if (col.type === "numeric") {
        const num = Number(parsed);
        if (!isNaN(num)) parsed = num;
      }
      updateCell(rowIdx, colIdx, parsed);
      setEditingCell(null);
    },
    [cols, editValue, updateCell],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
      if (e.key === "Enter") {
        saveEdit(rowIdx, colIdx);
      } else if (e.key === "Escape") {
        isCancellingRef.current = true;
        setEditingCell(null);
        setTimeout(() => { isCancellingRef.current = false; }, 0);
      }
    },
    [saveEdit],
  );

  return (
    <div 
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-neutral-100 dark:bg-neutral-950 p-4 sm:p-6 flex flex-col space-y-3"
          : "flex-1 min-h-0 flex flex-col space-y-3 relative"
      }
    >
      {/* ── Search + rows-per-page controls ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800/60 rounded-2xl p-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search dataset..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-0.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Info + Fullscreen toggle */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            {searchTerm ? (
              <span>Found {totalRows.toLocaleString()} rows</span>
            ) : (
              <span>Total: {dataset.rows.length.toLocaleString()} rows</span>
            )}
          </div>
          
          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="hidden sm:inline-flex items-center justify-center p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-sm hover:shadow transition-all ml-1"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div 
        ref={parentRef}
        className="flex-1 min-h-0 overflow-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/75 dark:bg-neutral-900/65 backdrop-blur-md shadow-sm"
      >
        <table className="w-full font-mono text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-2 py-1.5 text-right font-normal text-[10px] text-neutral-300 dark:text-neutral-600 sticky left-0 bg-neutral-50 dark:bg-neutral-900 z-20 w-10">
                #
              </th>
              {cols.map((c) => {
                const isSorted = sortCol === c.name;
                return (
                  <th
                    key={c.name}
                    onClick={() => handleSort(c.name)}
                    className="px-3 py-1.5 text-left align-top whitespace-nowrap min-w-[120px] border-l border-neutral-100 dark:border-neutral-800/60 cursor-pointer hover:bg-neutral-100/50 dark:hover:bg-neutral-800/30 group transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5 justify-between">
                      <div className="font-medium text-[11px] text-neutral-800 dark:text-neutral-200 truncate max-w-[180px]">
                        {c.name}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onColumnStatsClick && (
                          <button
                            title="View detailed statistics"
                            onClick={(e) => {
                              e.stopPropagation();
                              onColumnStatsClick(c.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:text-neutral-900 dark:hover:text-neutral-100 text-neutral-450 dark:text-neutral-600 transition-all p-0.5 rounded hover:bg-neutral-200/60 dark:hover:bg-neutral-800"
                          >
                            <BarChart3 className="w-3 h-3" />
                          </button>
                        )}
                        <span className="shrink-0 text-neutral-400 dark:text-neutral-650 group-hover:text-neutral-600 dark:group-hover:text-neutral-400 transition-colors">
                          {isSorted ? (
                            sortDir === "asc"
                              ? <ChevronUp className="w-3 h-3 text-orange-500" />
                              : <ChevronDown className="w-3 h-3 text-orange-500" />
                          ) : (
                            <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-0.5">
                      <TypeBadge col={c} groups={uniqueCounts.get(c.name)} />
                    </div>
                    {c.type === "numeric" && <SparkHistogram values={c.numeric} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {totalRows === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  className="px-4 py-8 text-center text-xs text-neutral-400 dark:text-neutral-500 italic"
                >
                  No matching data found
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={cols.length + 1} style={{ height: paddingTop }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const rowIndex = virtualRow.index;
                  const { idx, row } = sortedRows[rowIndex];
                  return (
                    <tr
                      key={idx}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={rowIndex % 2 === 0 ? "bg-white/40 dark:bg-transparent" : "bg-neutral-50/50 dark:bg-neutral-800/10"}
                    >
                    <td className="px-2 py-1 text-right text-[10px] text-neutral-300 dark:text-neutral-600 sticky left-0 bg-inherit z-[1] w-10 tabular-nums">
                      {idx + 1}
                    </td>
                    {cols.map((c, j) => {
                      const v = row[c.index];
                      const isEditing = editingCell?.rowIdx === idx && editingCell?.colIdx === c.index;
                      const isNum = typeof v === "number" && Number.isFinite(v);
                      const text =
                        v === null || v === undefined || v === ""
                          ? null
                          : isNum
                            ? formatCell(v as number)
                            : String(v);
                      const align = isNum
                        ? "text-right tabular-nums text-neutral-700 dark:text-neutral-300"
                        : "text-left text-neutral-600 dark:text-neutral-400";

                      if (isEditing) {
                        return (
                          <td key={j} className="px-1 py-0.5 border-l border-neutral-100 dark:border-neutral-800/60 min-w-[120px] bg-orange-50/20 dark:bg-orange-950/20">
                            <input
                              type="text"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, c.index)}
                              onBlur={() => saveEdit(idx, c.index)}
                              className="w-full px-1.5 py-0.5 bg-white dark:bg-neutral-950 border border-orange-500 rounded text-neutral-850 dark:text-neutral-100 focus:outline-none font-mono text-xs"
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={j}
                          onDoubleClick={() => {
                            setEditingCell({ rowIdx: idx, colIdx: c.index });
                            setEditValue(v === null || v === undefined ? "" : String(v));
                          }}
                          className={`px-3 py-1 whitespace-nowrap max-w-[260px] truncate border-l border-neutral-100 dark:border-neutral-800/60 select-none cursor-cell hover:bg-neutral-50/50 dark:hover:bg-neutral-800/10 ${align}`}
                          title="Double click to edit"
                        >
                          {text ?? <span className="text-neutral-300 dark:text-neutral-700 italic">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td colSpan={cols.length + 1} style={{ height: paddingBottom }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  </div>
  );
}
