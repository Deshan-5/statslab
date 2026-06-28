"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight, Clock, Star, Search, Command,
  Upload, MousePointerClick, Sparkles, GraduationCap, X,
} from "lucide-react";
import { findTool, type Tool } from "@/lib/tools";
import DataDropZone from "@/components/DataDropZone";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const RECENT_KEY = "statslab_recent_tools";
const PINNED_KEY = "statslab_pinned_tools";
const ONBOARDED_KEY = "statslab:onboarded";

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
  const [onboarded, setOnboarded] = useState(true); // assume true until we read localStorage
  const { loadExample, dataset } = useWorkspace();

  const dismiss = useCallback(() => {
    try { localStorage.setItem(ONBOARDED_KEY, "true"); } catch { /* ignore */ }
    setOnboarded(true);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARDED_KEY) !== "true") setOnboarded(false);
    } catch { /* ignore */ }
  }, []);

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

  if (dataset) {
    return (
      <div className="h-full flex flex-col">
        <DataDropZone />
      </div>
    );
  }

  return (
    <div className="relative min-h-full w-full py-2 overflow-visible flex flex-col items-center">

      <div className="space-y-8 max-w-4xl w-full mx-auto relative flex flex-col items-center text-center">
        {/* ── Hero header (compact) ──────────────────────────────────── */}
        <header className="pt-2 text-center flex flex-col items-center select-none">
          <p className="text-[10px] tracking-[0.25em] font-light text-neutral-400 dark:text-neutral-500 mb-2 uppercase">
            {dateLabel}
          </p>
          <h1 className="font-medium tracking-tight text-3xl md:text-4xl leading-[1.1] text-neutral-900 dark:text-neutral-100">
            {greetText}<span className="text-orange-400">.</span>
          </h1>
        </header>

        {/* ── Data drop zone ──────────────────────────────────────────── */}
        <div className="w-full max-w-2xl mx-auto">
          <DataDropZone />
        </div>

        {/* ── Pinned tools (only if user has pins) ────────────────────── */}
        {pinnedResolved.length > 0 && (
          <section className="w-full max-w-3xl">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Star className="w-3.5 h-3.5 text-orange-400" fill="currentColor" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500 font-bold">
                Pinned
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 justify-center">
              {pinnedResolved.map((t) => (
                <ToolRow key={t.id} tool={t} pinned onTogglePin={togglePin} />
              ))}
            </div>
          </section>
        )}

        {/* ── Onboarding card — first-time visitors only ───────────── */}
        {!onboarded && (
          <section className="w-full max-w-3xl">
            <div className="relative rounded-2xl border border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-neutral-950 p-6 text-left shadow-sm">
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-4 pr-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-100">
                    The AI teaches by controlling the tool
                  </h2>
                  <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400 max-w-md leading-relaxed">
                    Ask it to demonstrate something and it changes the sliders live — you watch your results shift as it explains why. Not a chatbot next to a demo. One thing.
                  </p>
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <Link
                      href="/app?tool=hypothesis-test&tab=tutor&autoask=show+me+why+sample+size+matters"
                      onClick={dismiss}
                      className="inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-2 text-sm font-medium transition-colors shadow-sm"
                    >
                      <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                      See it live
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </Link>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                      "show me why sample size matters"
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Quick start — three onboarding cards ──────────────────── */}
        <section className="space-y-4 w-full max-w-3xl">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 font-bold select-none">
              Workspace Quick Start
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1 — Drop a CSV */}
            <div className="group rounded-2xl border border-neutral-250 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/30 backdrop-blur-md p-5 flex flex-col items-center justify-between text-center hover:border-orange-400/40 dark:hover:border-orange-500/30 hover:shadow-[0_12px_32px_rgba(249,115,22,0.05)] dark:hover:shadow-[0_12px_32px_rgba(249,115,22,0.12)] hover:-translate-y-1 hover:bg-orange-500/[0.01] transition-all duration-300">
              <div className="space-y-3 flex flex-col items-center">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center transition-colors group-hover:bg-orange-500/20">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Load a Dataset
                </h3>
                <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Drag and drop any CSV or TSV file onto the workspace drop zone above, or paste raw text.
                </p>
              </div>
            </div>

            {/* Card 2 — Pick a tool */}
            <button
              onClick={openPalette}
              className="group rounded-2xl border border-neutral-250 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/30 backdrop-blur-md p-5 flex flex-col items-center justify-between text-center hover:border-violet-400/40 dark:hover:border-violet-500/30 hover:shadow-[0_12px_32px_rgba(139,92,246,0.05)] dark:hover:shadow-[0_12px_32px_rgba(139,92,246,0.12)] hover:-translate-y-1 hover:bg-violet-500/[0.01] active:scale-[0.99] transition-all duration-300"
            >
              <div className="space-y-3 flex flex-col items-center">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 dark:text-violet-400 flex items-center justify-center transition-colors group-hover:bg-violet-500/20">
                  <MousePointerClick className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Interactive Instruments
                </h3>
                <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Select a statistical tool from the sidebar or press <kbd className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-mono text-[10px] mx-0.5">{isMac ? "⌘" : "Ctrl-"}K</kbd> to quickly search.
                </p>
              </div>
            </button>

            {/* Card 3 — Try an example */}
            <div className="group rounded-2xl border border-neutral-250 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/30 backdrop-blur-md p-5 flex flex-col items-center justify-between text-center hover:border-emerald-400/40 dark:hover:border-emerald-500/30 hover:shadow-[0_12px_32px_rgba(16,185,129,0.05)] dark:hover:shadow-[0_12px_32px_rgba(16,185,129,0.12)] hover:-translate-y-1 hover:bg-emerald-500/[0.01] transition-all duration-300">
              <div className="space-y-3 flex flex-col items-center w-full">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center transition-colors group-hover:bg-emerald-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Try Sandbox Datasets
                </h3>
                <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400 mb-1">
                  Instantly load statistical sample data to test workflows:
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                  <button
                    onClick={() => loadExample("iris")}
                    className="text-[10px] font-semibold rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 hover:border-emerald-500 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-450 text-neutral-700 dark:text-neutral-300 px-2.5 py-1 active:scale-95 transition-all duration-150"
                  >
                    Iris
                  </button>
                  <button
                    onClick={() => loadExample("heights")}
                    className="text-[10px] font-semibold rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 hover:border-emerald-500 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-450 text-neutral-700 dark:text-neutral-300 px-2.5 py-1 active:scale-95 transition-all duration-150"
                  >
                    Heights
                  </button>
                  <button
                    onClick={() => loadExample("abtest")}
                    className="text-[10px] font-semibold rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 hover:border-emerald-500 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-450 text-neutral-700 dark:text-neutral-300 px-2.5 py-1 active:scale-95 transition-all duration-150"
                  >
                    A/B Test
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500 w-full select-none">
          <span className="font-mono">v0.1 · beta</span>
        </footer>
      </div>
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
