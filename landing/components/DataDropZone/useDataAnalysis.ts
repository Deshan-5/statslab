"use client";

/**
 * DataDropZone/useDataAnalysis.ts
 *
 * Custom hook encapsulating ALL state and side-effects that were previously
 * scattered across the DataDropZone component body. Extracted so the
 * orchestrating component becomes a thin render shell.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { parseAndAnalyse, analyzeCSV, buildSuggestions } from "./analyse";
import type { AnalysisResult, Suggestion } from "./types";
import type { ParsedCSV } from "@/components/tools/shared/stats";
import { eventBus } from "@/lib/eventBus";

export type UseDataAnalysisReturn = {
  // Data state
  analysis: AnalysisResult | null;
  parseError: string | null;
  fileName: string | null;
  workspaceLoaded: boolean;
  suggestions: Suggestion[];

  // Drop zone interaction state
  dragOver: boolean;
  showPaste: boolean;
  pasteText: string;
  showDetailed: boolean;

  // Refs
  fileRef: React.RefObject<HTMLInputElement>;

  // Handlers
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteSubmit: () => void;
  setPasteText: (t: string) => void;
  setShowPaste: (v: boolean) => void;
  setShowDetailed: (v: boolean | ((prev: boolean) => boolean)) => void;
  loadExampleDataset: (name: string) => void;
  explainDatasetWithTutor: () => void;
  reset: () => void;
};

export function useDataAnalysis(): UseDataAnalysisReturn {
  const { dataset, loadCSV, clearDataset, loadExample } = useWorkspace();

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [showDetailed, setShowDetailed] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Process raw text ────────────────────────────────────────────── */
  const processData = useCallback(
    (text: string, name?: string) => {
      setParseError(null);
      setFileName(name ?? null);
      setShowDetailed(false);
      setWorkspaceLoaded(false);

      const parsed = parseAndAnalyse(text, name);
      if (parsed.kind === "error") {
        setAnalysis(null);
        setParseError(parsed.message);
        return;
      }

      setAnalysis(parsed.result);
      setWorkspaceLoaded(loadCSV(parsed.csvText, name ?? "Numbers"));
    },
    [loadCSV],
  );

  /* ── File handlers ───────────────────────────────────────────────── */
  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > 50 * 1024 * 1024) {
        setParseError("File too large (max 50 MB)");
        return;
      }
      try {
        const stream = file.stream();
        const reader = stream.getReader();
        const decoder = new TextDecoder("utf-8");
        let result = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
          // Yield to main thread to prevent UI freezing
          await new Promise(r => setTimeout(r, 0));
        }
        result += decoder.decode();
        processData(result, file.name);
      } catch (err) {
        setParseError("Failed to read file stream");
      }
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

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onPasteSubmit = useCallback(() => {
    if (pasteText.trim()) processData(pasteText.trim(), "Pasted data");
  }, [pasteText, processData]);

  const loadExampleDataset = useCallback(
    (name: string) => loadExample(name),
    [loadExample],
  );

  /* ── AI tutor explainer ──────────────────────────────────────────── */
  const explainDatasetWithTutor = useCallback(() => {
    if (!analysis) return;

    const numSummary = analysis.columns
      .map(
        (c) =>
          `- ${c.name} (numeric): mean=${c.mean.toFixed(2)}, median=${c.median.toFixed(2)}, range=[${c.min}, ${c.max}], distribution=${c.distribution.name}`,
      )
      .join("\n");

    const catSummary = analysis.textColumns
      .map(
        (c) =>
          `- ${c} (categorical): unique values count=${analysis.categoricalGroupCounts.get(c) ?? 0}`,
      )
      .join("\n");

    const prompt = `Please provide an educational briefing for this dataset. Here is its structure:
- Rows: ${analysis.rowCount}
- Columns: ${analysis.colCount}
- Numerical Columns:
${numSummary || "None"}
- Categorical Columns:
${catSummary || "None"}

Please explain this dataset in plain English as a statistics tutor. Highlight any key characteristics (like skewness, ranges, unique groups), and recommend 3 specific tools from the sidebar to analyze this data, detailing why they are useful here. Keep your explanation structured and easy to read!`;

    eventBus.emit("statslab:ask-tutor", { prompt });
  }, [analysis]);

  /* ── Reset ───────────────────────────────────────────────────────── */
  const reset = useCallback(() => {
    setAnalysis(null);
    setFileName(null);
    setShowPaste(false);
    setPasteText("");
    setShowDetailed(false);
    setWorkspaceLoaded(false);
    clearDataset();
  }, [clearDataset]);

  /* ── Sync analysis when workspace dataset changes externally ─────── */
  useEffect(() => {
    if (!dataset) {
      setAnalysis(null);
      setFileName(null);
      setWorkspaceLoaded(false);
      return;
    }

    // Already in sync — avoid redundant re-analysis.
    if (analysis && fileName === dataset.name) return;

    const numericColumns = new Map<string, number[]>();
    dataset.columns.forEach((col) => {
      if (col.type === "numeric") numericColumns.set(col.name, col.numeric);
    });

    const parsed: ParsedCSV = {
      headers: dataset.headers,
      rows: dataset.rows.map((row) =>
        row.map((cell) => (cell === null ? "" : String(cell))),
      ),
      numericColumns,
      rowCount: dataset.rows.length,
      colCount: dataset.headers.length,
    };

    // analyzeCSV will compute quality internally via its qualityOverride=undefined path.
    setAnalysis(analyzeCSV(parsed));
    setFileName(dataset.name);
    setWorkspaceLoaded(true);
    // Intentionally omitting `analysis` and `fileName` from deps: we only want
    // to re-sync when the workspace dataset itself changes, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  /* ── Derived: suggestions ────────────────────────────────────────── */
  const suggestions = analysis ? buildSuggestions(analysis) : [];

  return {
    analysis,
    parseError,
    fileName,
    workspaceLoaded,
    suggestions,
    dragOver,
    showPaste,
    pasteText,
    showDetailed,
    fileRef,
    onDrop,
    onDragOver,
    onDragLeave,
    onFileInput,
    onPasteSubmit,
    setPasteText,
    setShowPaste,
    setShowDetailed,
    loadExampleDataset,
    explainDatasetWithTutor,
    reset,
  };
}
