"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  buildDataset, clearStorage, loadFromStorage, saveToStorage,
  type Column, type Dataset,
} from "@/lib/dataset";
import { findExample } from "@/lib/examples";
import { mean, sd, median } from "@/components/tools/shared/stats";
import { useMultiplayer } from "@/hooks/useMultiplayer";
import { TableIndex } from "@/lib/indexer";

export type Filter = {
  colName: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "is_empty" | "is_not_empty";
  value: string;
};

type PerfStats = {
  filterTimeMs: number;
  totalRows: number;
  matchedRows: number;
};

type HistoryEntry = {
  dataset: Dataset;
  filters: Filter[];
  label: string;
};

type Ctx = {
  dataset: Dataset | null;
  loadExample: (id: string) => void;
  loadCSV: (text: string, name?: string) => boolean;
  clearDataset: () => void;
  numericColumns: Column[];
  categoricalColumns: Column[];

  // Linked selection
  selection: Set<number> | null;
  setSelection: (rows: Set<number> | null) => void;
  isSelected: (i: number) => boolean;
  loadCustomDataset: (ds: Dataset | null) => void;

  // Wrangling APIs
  transformColumn: (colIdx: number, type: "log" | "sqrt" | "sq" | "zscore" | "inverse") => void;
  imputeColumn: (colIdx: number, method: "mean" | "median" | "zero") => void;
  dropMissing: (colIdx?: number) => void;
  deleteColumn: (colIdx: number) => void;
  applyFilter: (colName: string, operator: Filter["operator"], value: string) => void;
  clearFilter: (filterIdx: number) => void;
  resetDataset: () => void;
  activeFilters: Filter[];
  hasModifications: boolean;
  updateCell: (rowIdx: number, colIdx: number, val: number | string | null) => void;

  // Performance HUD
  perfStats: PerfStats | null;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry[];
  historyIndex: number;
  jumpToHistory: (index: number) => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [originalDataset, setOriginalDataset] = useState<Dataset | null>(null);
  const [baseDataset, setBaseDataset] = useState<Dataset | null>(null);
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [selection, setSelectionState] = useState<Set<number> | null>(null);
  const hydrated = useRef(false);
  const indexRef = useRef<TableIndex | null>(null);
  const lastIncomingDatasetJSON = useRef<string | null>(null);
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoing = useRef(false);

  const pushHistory = useCallback((ds: Dataset, filters: Filter[], label: string) => {
    if (isUndoRedoing.current) return;
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1);
      const next = [...truncated, { dataset: ds, filters, label }];
      // Cap at 50 entries to prevent memory bloat
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoing.current = true;
    const entry = history[historyIndex - 1];
    setBaseDataset(entry.dataset);
    setActiveFilters(entry.filters);
    setHistoryIndex(prev => prev - 1);
    setSelectionState(null);
    setTimeout(() => { isUndoRedoing.current = false; }, 0);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoing.current = true;
    const entry = history[historyIndex + 1];
    setBaseDataset(entry.dataset);
    setActiveFilters(entry.filters);
    setHistoryIndex(prev => prev + 1);
    setSelectionState(null);
    setTimeout(() => { isUndoRedoing.current = false; }, 0);
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const jumpToHistory = useCallback((index: number) => {
    if (index < 0 || index >= history.length) return;
    isUndoRedoing.current = true;
    const entry = history[index];
    setBaseDataset(entry.dataset);
    setActiveFilters(entry.filters);
    setHistoryIndex(index);
    setSelectionState(null);
    setTimeout(() => { isUndoRedoing.current = false; }, 0);
  }, [history]);

  useEffect(() => {
    if (baseDataset) {
      indexRef.current = new TableIndex(baseDataset);
    } else {
      indexRef.current = null;
    }
  }, [baseDataset]);

  const [roomId, setRoomId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setRoomId(new URLSearchParams(window.location.search).get("room"));
    }
  }, []);
  const { connected, peers, sharedState } = useMultiplayer(roomId);

  const setSelection = useCallback((rows: Set<number> | null) => {
    setSelectionState(rows);
    if (sharedState) {
      sharedState.set("selection", rows ? Array.from(rows) : null);
    }
  }, [sharedState]);

  useEffect(() => {
    if (!sharedState) return;
    const observer = (event: any) => {
      if (event.keysChanged.has("selection")) {
        const sel = sharedState.get("selection");
        setSelectionState(sel ? new Set(sel) : null);
      }
      if (event.keysChanged.has("dataset") && !event.transaction.local) {
        const dsJson = sharedState.get("dataset");
        if (dsJson) {
          try {
            lastIncomingDatasetJSON.current = dsJson;
            const ds = JSON.parse(dsJson);
            setBaseDataset(ds);
            setOriginalDataset(ds);
          } catch(e) {}
        }
      }
    };
    sharedState.observe(observer);
    return () => sharedState.unobserve(observer);
  }, [sharedState]);

  useEffect(() => {
    if (!sharedState || !baseDataset) return;
    const dsJson = JSON.stringify(baseDataset);
    if (dsJson !== lastIncomingDatasetJSON.current) {
      sharedState.set("dataset", dsJson);
    }
  }, [baseDataset, sharedState]);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const s = loadFromStorage();
    if (!s) return;

    let orig: Dataset | null = null;
    let base: Dataset | null = null;
    const filters: Filter[] = s.activeFilters || [];

    if (s.datasetSource === "example" && s.datasetId) {
      const ex = findExample(s.datasetId);
      if (ex) {
        const built = ex.build();
        const originalDs = buildDataset(ex.id, ex.name, "example", built.headers, built.rows);
        orig = originalDs;
        
        if (s.pastedHeaders && s.pastedRows) {
          base = buildDataset(ex.id, ex.name, "example", s.pastedHeaders, s.pastedRows);
        } else {
          base = originalDs;
        }
      }
    } else if (s.pastedHeaders && s.pastedRows) {
      const name = s.pastedName ?? "Pasted data";
      const headers = s.originalHeaders || s.pastedHeaders;
      const rows = s.originalRows || s.pastedRows;
      orig = buildDataset(s.datasetId ?? "pasted", name, "paste", headers, rows);
      base = buildDataset(s.datasetId ?? "pasted", name, "paste", s.pastedHeaders, s.pastedRows);
    }
    
    if (orig && base) {
      setOriginalDataset(orig);
      setBaseDataset(base);
      setActiveFilters(filters);
    }
  }, []);

  const loadExample = useCallback((id: string) => {
    const ex = findExample(id);
    if (!ex) return;
    const built = ex.build();
    const ds = buildDataset(ex.id, ex.name, "example", built.headers, built.rows);
    setOriginalDataset(ds);
    setBaseDataset(ds);
    setActiveFilters([]);
    setSelectionState(null);
    saveToStorage({ datasetId: ex.id, datasetSource: "example" });
  }, []);

  const loadCSV = useCallback((text: string, name?: string): boolean => {
    const cleaned = text.replace(/^﻿/, "");
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return false;
    const first = lines[0];
    const tabs = (first.match(/\t/g) || []).length;
    const commas = (first.match(/,/g) || []).length;
    const semis = (first.match(/;/g) || []).length;
    const delim = tabs > commas && tabs > semis ? "\t" : semis > commas ? ";" : ",";
    const split = (line: string) => {
      const out: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
          } else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === delim) { out.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    };
    const firstFields = split(first);
    const numericInFirst = firstFields.filter((c) => c !== "" && !isNaN(Number(c))).length;
    const hasHeader = numericInFirst < firstFields.length * 0.5;
    const headers = hasHeader
      ? firstFields.map((h, i) => h.replace(/^["']|["']$/g, "") || `Col ${i + 1}`)
      : firstFields.map((_, i) => `Col ${i + 1}`);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows: (number | string | null)[][] = [];
    for (const line of dataLines) {
      const fields = split(line);
      while (fields.length < headers.length) fields.push("");
      const row: (number | string | null)[] = fields.slice(0, headers.length).map((f) => {
        const cleaned = f.replace(/^["']|["']$/g, "").trim();
        if (cleaned === "" || cleaned === "NA" || cleaned === "N/A" || cleaned === "null") return null;
        const n = Number(cleaned);
        return isNaN(n) ? cleaned : n;
      });
      rows.push(row);
    }
    if (rows.length < 1) return false;
    const dsName = name || "Pasted data";
    const ds = buildDataset("pasted", dsName, "paste", headers, rows);
    setOriginalDataset(ds);
    setBaseDataset(ds);
    setActiveFilters([]);
    setSelectionState(null);
    setSelection(null);
    saveToStorage({
      datasetId: "pasted",
      datasetSource: null,
      pastedHeaders: headers,
      pastedRows: rows,
      pastedName: dsName,
    });
    pushHistory(ds, [], "Load CSV");
    return true;
  }, [setSelection, pushHistory]);

  const clearDataset = useCallback(() => {
    setOriginalDataset(null);
    setBaseDataset(null);
    setActiveFilters([]);
    setSelectionState(null);
    clearStorage();
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  const loadCustomDataset = useCallback((ds: Dataset | null) => {
    setOriginalDataset(ds);
    setBaseDataset(ds);
    setActiveFilters([]);
    setSelectionState(null);
    if (ds) {
      if (ds.source === "example") {
        saveToStorage({ datasetId: ds.id, datasetSource: "example" });
      } else {
        saveToStorage({
          datasetId: ds.id,
          datasetSource: null,
          pastedHeaders: ds.headers,
          pastedRows: ds.rows,
          pastedName: ds.name,
        });
      }
    } else {
      clearStorage();
    }
  }, []);



  const isSelected = useCallback(
    (i: number) => (selection ? selection.has(i) : false),
    [selection]
  );

  const transformColumn = useCallback((colIdx: number, type: "log" | "sqrt" | "sq" | "zscore" | "inverse") => {
    if (!baseDataset) return;
    const col = baseDataset.columns[colIdx];
    if (!col || col.type !== "numeric") return;

    let newName = "";
    switch (type) {
      case "log": newName = `${col.name}_log`; break;
      case "sqrt": newName = `${col.name}_sqrt`; break;
      case "sq": newName = `${col.name}_sq`; break;
      case "zscore": newName = `${col.name}_z`; break;
      case "inverse": newName = `${col.name}_inv`; break;
    }

    let finalName = newName;
    let idx = 1;
    while (baseDataset.headers.includes(finalName)) {
      finalName = `${newName}_${idx++}`;
    }

    let meanVal = 0;
    let sdVal = 1;
    if (type === "zscore") {
      meanVal = mean(col.numeric);
      sdVal = sd(col.numeric);
      if (sdVal === 0) sdVal = 1;
    }

    const newRows = baseDataset.rows.map((row) => {
      const val = row[colIdx];
      let newVal: number | null = null;
      if (val !== null && val !== "") {
        const num = Number(val);
        if (!isNaN(num)) {
          switch (type) {
            case "log":
              newVal = num > 0 ? Math.log(num) : null;
              break;
            case "sqrt":
              newVal = num >= 0 ? Math.sqrt(num) : null;
              break;
            case "sq":
              newVal = num * num;
              break;
            case "zscore":
              newVal = (num - meanVal) / sdVal;
              break;
            case "inverse":
              newVal = num !== 0 ? 1 / num : null;
              break;
          }
        }
      }
      return [...row, newVal];
    });

    const newHeaders = [...baseDataset.headers, finalName];
    const newDs = buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, newHeaders, newRows);
    setBaseDataset(newDs);
    pushHistory(newDs, activeFilters, `Transform: ${type}(${col.name})`);
    
    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      pastedHeaders: newHeaders,
      pastedRows: newRows,
      originalHeaders: origState.originalHeaders || originalDataset?.headers,
      originalRows: origState.originalRows || originalDataset?.rows,
    });
  }, [baseDataset, originalDataset]);

  const imputeColumn = useCallback((colIdx: number, method: "mean" | "median" | "zero") => {
    if (!baseDataset) return;
    const col = baseDataset.columns[colIdx];
    if (!col || col.type !== "numeric") return;

    let fillValue = 0;
    if (method === "mean") {
      fillValue = mean(col.numeric);
    } else if (method === "median") {
      fillValue = median(col.numeric);
    } else if (method === "zero") {
      fillValue = 0;
    }

    const newRows = baseDataset.rows.map((row) => {
      const val = row[colIdx];
      const newRow = [...row];
      if (val === null || val === "") {
        newRow[colIdx] = fillValue;
      }
      return newRow;
    });

    const newDs = buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, baseDataset.headers, newRows);
    setBaseDataset(newDs);
    pushHistory(newDs, activeFilters, `Impute: ${method}(${col.name})`);

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      pastedHeaders: baseDataset.headers,
      pastedRows: newRows,
      originalHeaders: origState.originalHeaders || originalDataset?.headers,
      originalRows: origState.originalRows || originalDataset?.rows,
    });
  }, [baseDataset, originalDataset]);

  const dropMissing = useCallback((colIdx?: number) => {
    if (!baseDataset) return;

    const newRows = baseDataset.rows.filter((row) => {
      if (colIdx !== undefined) {
        const val = row[colIdx];
        return val !== null && val !== "";
      } else {
        return row.every((val) => val !== null && val !== "");
      }
    });

    const newDs = buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, baseDataset.headers, newRows);
    setBaseDataset(newDs);
    setSelectionState(null);
    pushHistory(newDs, activeFilters, "Drop missing rows");

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      pastedHeaders: baseDataset.headers,
      pastedRows: newRows,
      originalHeaders: origState.originalHeaders || originalDataset?.headers,
      originalRows: origState.originalRows || originalDataset?.rows,
    });
  }, [baseDataset, originalDataset]);

  const deleteColumn = useCallback((colIdx: number) => {
    if (!baseDataset) return;
    if (baseDataset.headers.length <= 1) return;

    const deletedColName = baseDataset.headers[colIdx];
    const newHeaders = baseDataset.headers.filter((_, i) => i !== colIdx);
    const newRows = baseDataset.rows.map((row) => row.filter((_, i) => i !== colIdx));

    const nextFilters = activeFilters.filter((f) => f.colName !== deletedColName);
    if (nextFilters.length !== activeFilters.length) {
      setActiveFilters(nextFilters);
    }

    const newDs = buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, newHeaders, newRows);
    setBaseDataset(newDs);
    setSelectionState(null);
    pushHistory(newDs, nextFilters, `Delete column: ${deletedColName}`);

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      pastedHeaders: newHeaders,
      pastedRows: newRows,
      originalHeaders: origState.originalHeaders || originalDataset?.headers,
      originalRows: origState.originalRows || originalDataset?.rows,
      activeFilters: nextFilters,
    });
  }, [baseDataset, originalDataset, activeFilters]);

  const applyFilter = useCallback((colName: string, operator: Filter["operator"], value: string) => {
    if (!baseDataset) return;
    const nextFilters = [...activeFilters, { colName, operator, value }];
    setActiveFilters(nextFilters);
    setSelectionState(null);

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      activeFilters: nextFilters,
    });
  }, [activeFilters, baseDataset]);

  const clearFilter = useCallback((filterIdx: number) => {
    if (!baseDataset) return;
    const nextFilters = activeFilters.filter((_, i) => i !== filterIdx);
    setActiveFilters(nextFilters);
    setSelectionState(null);

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      activeFilters: nextFilters,
    });
  }, [activeFilters, baseDataset]);

  const resetDataset = useCallback(() => {
    if (!originalDataset) return;
    
    setBaseDataset(originalDataset);
    setActiveFilters([]);
    setSelectionState(null);

    if (originalDataset.source === "example") {
      saveToStorage({
        datasetId: originalDataset.id,
        datasetSource: "example",
      });
    } else {
      saveToStorage({
        datasetId: originalDataset.id,
        datasetSource: null,
        pastedHeaders: originalDataset.headers,
        pastedRows: originalDataset.rows,
        pastedName: originalDataset.name,
      });
    }
  }, [originalDataset]);

  const updateCell = useCallback((rowIdx: number, colIdx: number, val: number | string | null) => {
    if (!baseDataset) return;
    const newRows = baseDataset.rows.map((row, rIdx) => {
      if (rIdx === rowIdx) {
        const newRow = [...row];
        newRow[colIdx] = val;
        return newRow;
      }
      return row;
    });

    const newDs = buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, baseDataset.headers, newRows);
    setBaseDataset(newDs);

    const origState = loadFromStorage() || {
      datasetId: baseDataset.id,
      datasetSource: baseDataset.source === "example" ? "example" : null,
      pastedName: baseDataset.name,
    };
    saveToStorage({
      ...origState,
      pastedHeaders: baseDataset.headers,
      pastedRows: newRows,
      originalHeaders: origState.originalHeaders || originalDataset?.headers,
      originalRows: origState.originalRows || originalDataset?.rows,
    });
  }, [baseDataset, originalDataset]);

  const dataset = useMemo(() => {
    if (!baseDataset) { setPerfStats(null); return null; }
    if (activeFilters.length === 0) {
      setPerfStats({ filterTimeMs: 0, totalRows: baseDataset.rows.length, matchedRows: baseDataset.rows.length });
      return baseDataset;
    }
    if (!indexRef.current) return baseDataset;
    
    // Performance HUD: measure query execution time
    const t0 = performance.now();
    const matchingIndices = indexRef.current.query(activeFilters);
    const filteredRows = matchingIndices.map(i => baseDataset.rows[i]);
    const t1 = performance.now();
    
    setPerfStats({ filterTimeMs: Math.round((t1 - t0) * 100) / 100, totalRows: baseDataset.rows.length, matchedRows: filteredRows.length });
    
    return buildDataset(baseDataset.id, baseDataset.name, baseDataset.source, baseDataset.headers, filteredRows);
  }, [baseDataset, activeFilters]);

  const hasModifications = useMemo(() => {
    if (activeFilters.length > 0) return true;
    if (!originalDataset || !baseDataset) return false;
    if (baseDataset !== originalDataset) {
      if (originalDataset.headers.length !== baseDataset.headers.length) return true;
      if (originalDataset.rows.length !== baseDataset.rows.length) return true;
      for (let i = 0; i < originalDataset.headers.length; i++) {
        if (originalDataset.headers[i] !== baseDataset.headers[i]) return true;
      }
    }
    return false;
  }, [originalDataset, baseDataset, activeFilters]);

  const numericColumns = useMemo(
    () => dataset?.columns.filter((c) => c.type === "numeric") ?? [],
    [dataset]
  );
  const categoricalColumns = useMemo(
    () => dataset?.columns.filter((c) => c.type === "categorical") ?? [],
    [dataset]
  );

  const value: Ctx = {
    dataset, loadExample, loadCSV, clearDataset,
    numericColumns, categoricalColumns,
    selection, setSelection, isSelected,
    loadCustomDataset,
    transformColumn, imputeColumn, dropMissing, deleteColumn,
    applyFilter, clearFilter, resetDataset,
    activeFilters, hasModifications,
    updateCell,
    perfStats,
    undo, redo, canUndo, canRedo,
    history, historyIndex, jumpToHistory,
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
