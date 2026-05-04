"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  buildDataset, clearStorage, loadFromStorage, saveToStorage,
  type Column, type Dataset,
} from "@/lib/dataset";
import { findExample } from "@/lib/examples";

type Ctx = {
  dataset: Dataset | null;
  loadExample: (id: string) => void;
  loadCSV: (text: string, name?: string) => boolean;
  clearDataset: () => void;
  numericColumns: Column[];
  categoricalColumns: Column[];

  // Linked selection — row indices into dataset.rows. null = nothing selected.
  selection: Set<number> | null;
  setSelection: (rows: Set<number> | null) => void;
  isSelected: (i: number) => boolean;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selection, setSelectionState] = useState<Set<number> | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const s = loadFromStorage();
    if (!s) return;
    if (s.datasetSource === "example" && s.datasetId) {
      const ex = findExample(s.datasetId);
      if (ex) {
        const built = ex.build();
        setDataset(buildDataset(ex.id, ex.name, "example", built.headers, built.rows));
      }
    } else if (s.pastedHeaders && s.pastedRows) {
      setDataset(buildDataset(
        s.datasetId ?? "pasted",
        s.pastedName ?? "Pasted data",
        "paste", s.pastedHeaders, s.pastedRows
      ));
    }
  }, []);

  const loadExample = useCallback((id: string) => {
    const ex = findExample(id);
    if (!ex) return;
    const built = ex.build();
    const ds = buildDataset(ex.id, ex.name, "example", built.headers, built.rows);
    setDataset(ds);
    setSelectionState(null);
    saveToStorage({ datasetId: ex.id, datasetSource: "example" });
  }, []);

  const loadCSV = useCallback((text: string, name?: string): boolean => {
    // Lightweight CSV / TSV / paste parser. Reuses the same logic as parseCSV
    // but stores rows raw (numbers stay numeric, strings stay strings) so
    // categorical columns survive.
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
    setDataset(ds);
    setSelectionState(null);
    saveToStorage({
      datasetId: "pasted",
      datasetSource: null,
      pastedHeaders: headers,
      pastedRows: rows,
      pastedName: dsName,
    });
    return true;
  }, []);

  const clearDataset = useCallback(() => {
    setDataset(null);
    setSelectionState(null);
    clearStorage();
  }, []);

  const setSelection = useCallback((rows: Set<number> | null) => {
    setSelectionState(rows && rows.size > 0 ? rows : null);
  }, []);

  const isSelected = useCallback(
    (i: number) => (selection ? selection.has(i) : false),
    [selection]
  );

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
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
