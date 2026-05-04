"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Sparkles, Database } from "lucide-react";
import { TOOLS, type Tool } from "@/lib/tools";
import { EXAMPLES } from "@/lib/examples";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

type Item =
  | { kind: "tool"; tool: Tool; label: string; sub: string }
  | { kind: "page"; href: string; label: string; sub: string }
  | { kind: "dataset"; id: string; label: string; sub: string };

const PAGES: Item[] = [
  { kind: "page", href: "/app",            label: "Dashboard",        sub: "Lab home" },
  { kind: "page", href: "/app?tab=tutor",  label: "Tutor",            sub: "AI assistant" },
  { kind: "page", href: "/",               label: "Landing",          sub: "Marketing site" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { loadExample } = useWorkspace();

  // Open on ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(""); setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const all = useMemo<Item[]>(() => [
    ...PAGES,
    ...EXAMPLES.map((e) => ({
      kind: "dataset" as const,
      id: e.id,
      label: `Load: ${e.name}`,
      sub: `Dataset · ${e.description}`,
    })),
    ...TOOLS.map((t) => ({
      kind: "tool" as const,
      tool: t,
      label: t.name,
      sub: `${t.group} · ${t.blurb}`,
    })),
  ], []);

  const items = useMemo(() => {
    if (!q.trim()) return all.slice(0, 12);
    const ql = q.toLowerCase();
    return all
      .map((it) => {
        const haystack = `${it.label} ${it.sub}`.toLowerCase();
        let score = 0;
        if (haystack.startsWith(ql)) score += 10;
        if (it.label.toLowerCase().includes(ql)) score += 5;
        if (haystack.includes(ql)) score += 1;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it)
      .slice(0, 16);
  }, [q, all]);

  const go = (it: Item) => {
    setOpen(false);
    if (it.kind === "tool") router.push(`/app?tool=${it.tool.id}`);
    else if (it.kind === "dataset") loadExample(it.id);
    else router.push(it.href);
  };

  if (!open) return null;

  return (
    <div
      className="cmdk-overlay fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="cmdk-panel w-full max-w-xl rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-black/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === "Enter")     { e.preventDefault(); if (items[active]) go(items[active]); }
            }}
            placeholder="Search tools, pages…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100"
            aria-label="Search"
          />
          <kbd className="hidden md:inline text-[10px] uppercase tracking-wider text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5 bg-neutral-50 dark:bg-neutral-800 font-mono">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-400">
              No matches. Try &ldquo;regression&rdquo; or &ldquo;Bayes&rdquo;.
            </div>
          ) : (
            items.map((it, i) => {
              const isActive = i === active;
              const sub = it.sub;
              const key = it.kind === "tool" ? `tool-${it.tool.id}`
                        : it.kind === "dataset" ? `dataset-${it.id}`
                        : `page-${it.href}`;
              return (
                <button
                  key={key}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <span className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md ${
                    it.kind === "tool"    ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                    : it.kind === "dataset" ? "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                    : "bg-orange-100 dark:bg-orange-950/40 text-orange-600"
                  }`}>
                    {it.kind === "tool" ? <Sparkles className="w-3 h-3" />
                     : it.kind === "dataset" ? <Database className="w-3 h-3" />
                     : <ArrowRight className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{it.label}</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">{sub}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mt-1.5" />
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[10px] text-neutral-400">
          <span className="flex items-center gap-1">
            <kbd className="font-mono">↑↓</kbd> navigate
            <span className="mx-2">·</span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span>{items.length} result{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
