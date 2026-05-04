"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight, Clock, Star, Search, Command,
  Upload, MousePointerClick, Sparkles,
} from "lucide-react";
import { findTool, type Tool } from "@/lib/tools";
import DataDropZone from "@/components/DataDropZone";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const RECENT_KEY = "statslab_recent_tools";
const PINNED_KEY = "statslab_pinned_tools";

type RecentEntry = { id: string; ts: number };

/* ── Group accent mapping (used by pinned tool rows) ─────────────────── */
const GROUP_ACCENTS: Record<string, string> = {
  Models:        "group-hover:border-orange-300 dark:group-hover:border-orange-700",
  Distributions: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
  Inference:     "group-hover:border-sky-300 dark:group-hover:border-sky-700",
  Simulation:    "group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
  Charts:        "group-hover:border-amber-300 dark:group-hover:border-amber-700",
  Methods:       "group-hover:border-rose-300 dark:group-hover:border-rose-700",
};

const GROUP_ICON_ACCENTS: Record<string, string> = {
  Models:        "group-hover:text-orange-500",
  Distributions: "group-hover:text-violet-500",
  Inference:     "group-hover:text-sky-500",
  Simulation:    "group-hover:text-emerald-500",
  Charts:        "group-hover:text-amber-500",
  Methods:       "group-hover:text-rose-500",
};

function relativeTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

export default function LabDashboard() {
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isMac, setIsMac] = useState(true);
  const { loadExample } = useWorkspace();

  useEffect(() => {
    try {
      const r = localStorage.getItem(RECENT_KEY);
      if (r) {
        const parsed = JSON.parse(r);
        if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "string") {
          const migrated: RecentEntry[] = parsed.map((id: string) => ({ id, ts: Date.now() }));
          localStorage.setItem(RECENT_KEY, JSON.stringify(migrated));
          setRecent(migrated);
        } else {
          setRecent(parsed as RecentEntry[]);
        }
      }
      const p = localStorage.getItem(PINNED_KEY);
      if (p) setPinned(JSON.parse(p));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined") setIsMac(/mac/i.test(navigator.platform || ""));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const openPalette = useCallback(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac }));
  }, [isMac]);

  const recentResolved = recent
    .map((r) => ({ tool: findTool(r.id), ts: r.ts }))
    .filter((x): x is { tool: Tool; ts: number } => !!x.tool)
    .slice(0, 5);

  const pinnedResolved = pinned
    .map((id) => findTool(id))
    .filter((t): t is Tool => !!t);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 8);
      try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const greetText = greeting(now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ── Hero header (compact) ──────────────────────────────────── */}
      <header className="pt-1">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 mb-2">
          {dateLabel}
        </p>
        <h1 className="font-medium tracking-tight text-3xl md:text-4xl leading-[1.1] text-neutral-900 dark:text-neutral-100">
          {greetText}<span className="text-orange-400">.</span>
        </h1>

        {/* Search prompt — primary CTA */}
        <button
          onClick={openPalette}
          className="mt-4 w-full max-w-md flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm px-4 py-2.5 text-sm text-neutral-400 dark:text-neutral-500 transition-all group"
        >
          <Search className="w-4 h-4 shrink-0 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
          <span className="flex-1 text-left">Search tools…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {isMac ? <Command className="w-2.5 h-2.5" /> : "Ctrl"} K
          </kbd>
        </button>
      </header>

      {/* ── Data drop zone ──────────────────────────────────────────── */}
      <DataDropZone />

      {/* ── Recent strip (only if there's data) ─────────────────────── */}
      {recentResolved.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
              Recent tools
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {recentResolved.map(({ tool, ts }) => (
              <Link
                key={tool.id}
                href={`/app?tool=${tool.id}`}
                className="group shrink-0 flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm px-4 py-2.5 transition-all"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {tool.name}
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono mt-0.5">
                    {relativeTime(ts)}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Pinned tools (only if user has pins) ────────────────────── */}
      {pinnedResolved.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-3.5 h-3.5 text-orange-400" fill="currentColor" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
              Pinned
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedResolved.map((t) => (
              <ToolRow key={t.id} tool={t} pinned onTogglePin={togglePin} />
            ))}
          </div>
        </section>
      )}

      {/* ── Quick start — three onboarding cards ──────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
            Quick start
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1 — Drop a CSV */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Drop a CSV
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Drag a file onto the panel above, or click to browse local files.
            </p>
          </div>

          {/* Card 2 — Pick a tool */}
          <button
            onClick={openPalette}
            className="text-left rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm p-4 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <MousePointerClick className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Pick a tool
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Press {isMac ? "⌘K" : "Ctrl K"} to jump to any of 22 tools by name.
            </p>
          </button>

          {/* Card 3 — Try an example */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Try an example
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => loadExample("iris")}
                className="text-[12px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-600 dark:hover:text-orange-400 text-neutral-700 dark:text-neutral-300 px-2 py-1 transition-colors"
              >
                Iris
              </button>
              <button
                onClick={() => loadExample("heights")}
                className="text-[12px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-600 dark:hover:text-orange-400 text-neutral-700 dark:text-neutral-300 px-2 py-1 transition-colors"
              >
                Heights
              </button>
              <button
                onClick={() => loadExample("abtest")}
                className="text-[12px] rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-600 dark:hover:text-orange-400 text-neutral-700 dark:text-neutral-300 px-2 py-1 transition-colors"
              >
                A/B Test
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500">
        <span className="font-mono">v0.1 · beta</span>
      </footer>
    </div>
  );
}

/* ── Tool row card ────────────────────────────────────────────────── */
function ToolRow({ tool, pinned, onTogglePin }: { tool: Tool; pinned: boolean; onTogglePin: (id: string) => void }) {
  const accent = GROUP_ACCENTS[tool.group] || "";
  const iconAccent = GROUP_ICON_ACCENTS[tool.group] || "";

  return (
    <div className={`group relative rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:shadow-md dark:hover:shadow-black/20 hover:-translate-y-px transition-all ${accent}`}>
      <Link href={`/app?tool=${tool.id}`} className="block px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[14px] text-neutral-900 dark:text-neutral-100 truncate">
              {tool.name}
            </div>
            <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
              {tool.blurb}
            </p>
          </div>
          <ArrowRight className={`w-4 h-4 mt-0.5 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors shrink-0 ${iconAccent}`} />
        </div>
      </Link>
      <button
        onClick={() => onTogglePin(tool.id)}
        title={pinned ? "Unpin" : "Pin to top"}
        aria-label={pinned ? "Unpin tool" : "Pin tool"}
        className={`absolute bottom-2.5 right-3 p-1 rounded-md transition-all ${
          pinned
            ? "text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            : "text-neutral-300 dark:text-neutral-700 opacity-0 group-hover:opacity-100 hover:text-orange-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
      >
        <Star className="w-3 h-3" fill={pinned ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

/** Push a tool id onto the recent-tools list (with timestamp). */
export function recordRecentTool(id: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: RecentEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((x) => x && typeof x === "object" && x.id !== id);
    const next: RecentEntry[] = [{ id, ts: Date.now() }, ...filtered].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
