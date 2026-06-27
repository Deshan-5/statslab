"use client";

import { Clock, Undo2, Redo2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function HistoryView() {
  const { history, historyIndex, jumpToHistory, undo, redo, canUndo, canRedo } = useWorkspace();

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 px-4 text-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
          <Clock className="w-4 h-4 text-neutral-400" />
        </div>
        <p className="text-sm text-neutral-500">No history yet</p>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Load a dataset and start wrangling — transforms, filters, and imputations appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 px-2 py-2 border-b border-neutral-100 dark:border-neutral-800/60">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-400"
          title="Undo (⌘Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
        <div className="w-px bg-neutral-100 dark:bg-neutral-800 my-1" />
        <button
          onClick={redo}
          disabled={!canRedo}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-400"
          title="Redo (⌘Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
          Redo
        </button>
      </div>

      <div className="py-1">
        {[...history].reverse().map((entry, reversedIdx) => {
          const i = history.length - 1 - reversedIdx;
          const isCurrent = i === historyIndex;
          const isFuture = i > historyIndex;
          return (
            <button
              key={i}
              onClick={() => jumpToHistory(i)}
              className={`w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-3 py-2 text-left rounded-lg transition-colors ${
                isCurrent
                  ? "bg-indigo-50 dark:bg-indigo-950/40"
                  : isFuture
                  ? "opacity-35 hover:opacity-60 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isCurrent
                  ? "bg-indigo-500"
                  : isFuture
                  ? "bg-neutral-300 dark:bg-neutral-700"
                  : "bg-neutral-300 dark:bg-neutral-600"
              }`} />
              <div className="min-w-0 flex-1">
                <div className={`text-sm truncate leading-snug ${
                  isCurrent
                    ? "text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-neutral-600 dark:text-neutral-400"
                }`}>
                  {entry.label}
                </div>
                <div className="text-[10px] text-neutral-400 tabular-nums mt-0.5">
                  {entry.dataset.rows.length.toLocaleString()}r · {entry.dataset.columns.length}col
                  {entry.filters.length > 0 && ` · ${entry.filters.length} filter${entry.filters.length > 1 ? "s" : ""}`}
                </div>
              </div>
              {isCurrent && (
                <span className="text-[9px] uppercase tracking-wider text-indigo-500 font-bold shrink-0">now</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
