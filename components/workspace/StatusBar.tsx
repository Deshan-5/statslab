"use client";

import { useEffect, useState } from "react";
import { Database, ChevronRight, Download } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { eventBus } from "@/lib/eventBus";
import type { Tool } from "@/lib/tools";

interface Props {
  tool: Tool | null;
}

export default function StatusBar({ tool }: Props) {
  const { dataset } = useWorkspace();
  const [computing, setComputing] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = eventBus.on("statslab:computing", ({ label, done }) => {
      clearTimeout(timer);
      if (done) {
        timer = setTimeout(() => setComputing(null), 1400);
      } else {
        setComputing(label);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  const handleExport = () => {
    if (!dataset) return;
    const header = dataset.headers.join(",");
    const rows = dataset.rows.map(r =>
      r.map(v => (v === null ? "" : String(v).includes(",") ? `"${v}"` : String(v))).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPalette = () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));

  return (
    <div className="shrink-0 h-8 bg-neutral-900 dark:bg-[#111111] border-t border-neutral-800 flex items-center px-3 gap-0 text-[11px] font-mono text-neutral-500 select-none overflow-hidden z-10">
      {/* Left zone */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {dataset ? (
          <span className="flex items-center gap-1.5 text-neutral-300 cursor-default">
            <Database className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="font-medium truncate max-w-[120px]" title={dataset.name}>{dataset.name}</span>
            <span className="text-neutral-600">·</span>
            <span className="tabular-nums">{dataset.rows.length.toLocaleString()}r</span>
            <span className="text-neutral-600">·</span>
            <span className="tabular-nums">{dataset.columns.length}col</span>
          </span>
        ) : (
          <span className="text-neutral-600 italic">no dataset</span>
        )}

        {tool && (
          <>
            <span className="text-neutral-700 shrink-0">|</span>
            <span className="flex items-center gap-0.5 text-neutral-500 min-w-0">
              <span className="text-neutral-600 truncate max-w-[80px]">{tool.group}</span>
              <ChevronRight className="w-2.5 h-2.5 text-neutral-700 shrink-0" />
              <span className="text-neutral-400 truncate max-w-[100px]">{tool.name}</span>
            </span>
          </>
        )}
      </div>

      {/* Center: computing indicator */}
      {computing && (
        <div className="flex items-center gap-1.5 text-amber-400 mx-4 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
          <span>{computing}</span>
        </div>
      )}

      {/* Right zone */}
      <div className="flex items-center gap-3 shrink-0">
        {dataset && (
          <>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 hover:text-neutral-200 transition-colors"
              title="Export current dataset as CSV"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
            <span className="text-neutral-700">|</span>
          </>
        )}
        <button
          onClick={openPalette}
          className="hover:text-neutral-200 transition-colors"
          title="Open command palette (⌘K)"
        >
          ⌘K
        </button>
      </div>
    </div>
  );
}
