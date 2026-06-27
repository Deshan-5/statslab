"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star, StarOff, Layers, TrendingUp, Activity, FlaskConical, GitBranch, BarChart3 } from "lucide-react";
import { TOOLS } from "@/lib/tools";

const STORAGE_KEY = "statslab:saved-tools";

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Models: TrendingUp,
  Distributions: Activity,
  Inference: FlaskConical,
  Simulation: GitBranch,
  Charts: BarChart3,
  Methods: Layers,
};

const GROUP_COLORS: Record<string, string> = {
  Models: "text-blue-500",
  Distributions: "text-indigo-500",
  Inference: "text-purple-500",
  Simulation: "text-emerald-500",
  Charts: "text-orange-500",
  Methods: "text-rose-500",
};

function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[]; } catch { return []; }
}

function writeSaved(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

interface Props {
  currentToolId: string | null;
}

export default function SavedView({ currentToolId }: Props) {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  const toggle = useCallback((id: string) => {
    setSaved(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      writeSaved(next);
      return next;
    });
  }, []);

  const savedTools = TOOLS.filter(t => saved.includes(t.id));
  const currentTool = currentToolId ? TOOLS.find(t => t.id === currentToolId) ?? null : null;
  const currentIsSaved = currentToolId ? saved.includes(currentToolId) : false;

  return (
    <div>
      {currentTool && (
        <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800/60">
          <button
            onClick={() => toggle(currentTool.id)}
            className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
              currentIsSaved
                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Star className={`w-3.5 h-3.5 shrink-0 ${currentIsSaved ? "fill-amber-400 text-amber-400" : ""}`} />
            {currentIsSaved ? `Remove "${currentTool.name}"` : `Bookmark "${currentTool.name}"`}
          </button>
        </div>
      )}

      {savedTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 px-4 text-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
            <Star className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-sm text-neutral-500">No bookmarks yet</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            {currentTool
              ? `Click the button above to bookmark ${currentTool.name}.`
              : "Open a tool and bookmark it for quick access here."}
          </p>
        </div>
      ) : (
        <div className="py-1">
          {savedTools.map(t => {
            const Icon = GROUP_ICONS[t.group] || Layers;
            const isActive = t.id === currentToolId;
            return (
              <div key={t.id} className="flex items-center gap-1 px-2 py-0.5">
                <Link
                  href={t.built ? `/app?tool=${t.id}` : "#"}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors min-w-0 ${
                    isActive
                      ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${GROUP_COLORS[t.group] || "text-neutral-400"}`} />
                  <span className="truncate">{t.name}</span>
                  {!t.built && <span className="text-[9px] uppercase tracking-wider text-neutral-400 shrink-0">soon</span>}
                </Link>
                <button
                  onClick={() => toggle(t.id)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-amber-400 hover:text-neutral-400 transition-colors shrink-0"
                  title="Remove bookmark"
                >
                  <StarOff className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
