"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Menu, X, GraduationCap, Construction, Search, Command, SendHorizonal,
  TrendingUp, Activity, FlaskConical, GitBranch, BarChart3, Layers, Link2,
  Database,
} from "lucide-react";

import { TOOLS, findTool, type Tool } from "@/lib/tools";
import LabDashboard, { recordRecentTool } from "@/components/LabDashboard";
import CommandPalette from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import DataStrip from "@/components/workspace/DataStrip";

export default function AppClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const toolParam = sp.get("tool");
  const tab = sp.get("tab");
  const tool = (toolParam ? findTool(toolParam) : null) ?? null;

  useEffect(() => {
    if (tool) recordRecentTool(tool.id);
  }, [tool]);

  const [navOpen, setNavOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, Tool[]>();
    for (const t of TOOLS) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return Array.from(map.entries());
  }, []);

  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator !== "undefined") setIsMac(/mac/i.test(navigator.platform || ""));
  }, []);

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac }));
  };

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLink = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: best-effort, swallow errors so UX still flashes "Copied!"
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  return (
    <WorkspaceProvider>
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors pb-12">
      <CommandPalette />

      <header className="sticky top-0 z-30 bg-white/85 dark:bg-neutral-950/85 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="h-14 px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
            >
              {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/" className="font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
              Stats Lab
            </Link>
            <span className="hidden sm:inline rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase">
              Lab
            </span>
            {tool && (
              <Link href="/app" className="hidden md:inline ml-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 truncate">
                / {tool.name}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openPalette}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 transition-colors"
              aria-label="Open command palette"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Search</span>
              <kbd className="ml-1 hidden md:inline-flex items-center gap-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-1 py-0.5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                {isMac ? <Command className="w-2.5 h-2.5" /> : "Ctrl"} K
              </kbd>
            </button>

            <ThemeToggle compact />

            <div className="relative">
              <button
                onClick={copyLink}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-3 py-1.5 text-sm transition-colors"
                aria-label="Copy link to this view"
              >
                <Link2 className="w-4 h-4" />
                <span className="hidden md:inline">{copied ? "Copied!" : "Copy link"}</span>
              </button>
              {copied && (
                <span
                  role="status"
                  className="md:hidden absolute -bottom-7 right-0 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2 py-0.5 text-[10px] tracking-wider uppercase"
                >
                  Copied!
                </span>
              )}
            </div>

            <Link
              href={tool ? `/app?tool=${tool.id}&tab=tutor` : "/app?tab=tutor"}
              className={`hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
                tab === "tutor"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Ask
            </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className={`md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:border-r md:border-neutral-200 md:dark:border-neutral-800 md:bg-white md:dark:bg-neutral-950 md:overflow-y-auto ${
            navOpen ? "block bg-white dark:bg-neutral-950" : "hidden md:block"
          }`}
        >
          <nav className="p-4 space-y-1">
            <Link
              href="/app"
              onClick={() => setNavOpen(false)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                !toolParam
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Data
            </Link>
            {groups.map(([group, ts], gi) => {
              const SIDEBAR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
                Models: TrendingUp, Distributions: Activity, Inference: FlaskConical,
                Simulation: GitBranch, Charts: BarChart3, Methods: Layers,
              };
              const Icon = SIDEBAR_ICONS[group] || Layers;
              return (
                <div key={group}>
                  {gi > 0 && <div className="my-2 border-t border-neutral-100 dark:border-neutral-800/60" />}
                  <div className="flex items-center gap-2 px-2 mb-1 mt-3">
                    <Icon className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      {group}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {ts.map((t) => {
                      const active = t.id === toolParam;
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/app?tool=${t.id}`}
                            onClick={() => setNavOpen(false)}
                            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                              active
                                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                                : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            }`}
                          >
                            <span className="truncate">{t.name}</span>
                            {!t.built && (
                              <span className={`text-[9px] uppercase tracking-wider ${active ? "text-neutral-300 dark:text-neutral-500" : "text-neutral-400"}`}>
                                Soon
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="px-4 md:px-8 py-6 md:py-10 max-w-6xl">
          {!toolParam ? (
            <LabDashboard />
          ) : tool ? (
            <ToolCanvas tool={tool} />
          ) : (
            <NotFound id={toolParam} />
          )}
        </main>
      </div>

      {tab === "tutor" && (
        <TutorPanel
          tool={tool}
          onClose={() => router.push(tool ? `/app?tool=${tool.id}` : "/app")}
        />
      )}

      <DataStrip />
    </div>
    </WorkspaceProvider>
  );
}

function ToolCanvas({ tool }: { tool: Tool }) {
  if (!tool.built || !tool.Component) return <ComingSoon tool={tool} />;
  const C = tool.Component;
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{tool.group}</div>
        <h1 className="font-medium tracking-tight text-3xl mt-1 text-neutral-900 dark:text-neutral-100">{tool.name}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-2xl">{tool.blurb}</p>
      </header>
      <C />
    </div>
  );
}

function ComingSoon({ tool }: { tool: Tool }) {
  const builtTools = TOOLS.filter((t) => t.built).slice(0, 4);
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{tool.group}</div>
        <h1 className="font-medium tracking-tight text-3xl mt-1 text-neutral-900 dark:text-neutral-100">{tool.name}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-2xl">{tool.blurb}</p>
      </header>
      <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 mb-4">
          <Construction className="w-5 h-5 text-neutral-500" />
        </div>
        <h2 className="font-medium text-xl text-neutral-900 dark:text-neutral-100">Coming soon</h2>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
          We&apos;re still building this one. In the meantime, try a tool that&apos;s ready to go.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {builtTools.map((t) => (
            <Link
              key={t.id}
              href={`/app?tool=${t.id}`}
              className="rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-1.5 text-sm hover:opacity-90 transition-opacity"
            >
              {t.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center">
      <h2 className="font-medium text-xl">Unknown tool</h2>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">No tool registered for <code>{id}</code>.</p>
      <Link href="/app" className="mt-4 inline-flex rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm">
        Back to dashboard
      </Link>
    </div>
  );
}

type ChatMsg = { role: "user" | "assistant"; content: string };

function TutorPanel({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  const greeting = tool
    ? `What would you like to know about ${tool.name}?`
    : "Pick a tool from the sidebar and ask me anything about it.";

  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refresh greeting when tool changes (only if no real conversation has started yet).
  useEffect(() => {
    setMessages((prev) => (prev.length <= 1 ? [{ role: "assistant", content: greeting }] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool?.id]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send(content: string) {
    if (!content.trim() || loading) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: content.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m.role !== "assistant" || next.indexOf(m) > 0), // drop initial greeting from history
          context: tool ? { tool: tool.name, group: tool.group, blurb: tool.blurb } : null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "(empty)" }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "request failed";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl shadow-black/5 dark:shadow-black/30 flex flex-col">
      <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
          <span className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 truncate">
            {tool ? `Ask about ${tool.name}` : "Ask a question"}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close tutor">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((m, i) => (
          <Bubble key={i} who={m.role === "user" ? "user" : "bot"}>{m.content}</Bubble>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-3 inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" />
            </div>
          </div>
        )}
        {err && (
          <div className="text-xs rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-2">
            {err}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="p-4 border-t border-neutral-200 dark:border-neutral-800"
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500 disabled:opacity-60"
            aria-label="Tutor input"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-30 hover:opacity-90 transition-opacity"
            aria-label="Send"
          >
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-neutral-400 uppercase tracking-wider">For learning, not graded work</p>
      </form>
    </div>
  );
}

function Bubble({ who, children }: { who: "user" | "bot"; children: React.ReactNode }) {
  return (
    <div className={`flex ${who === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        who === "user"
          ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-br-sm"
          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-bl-sm"
      }`}>
        {children}
      </div>
    </div>
  );
}
