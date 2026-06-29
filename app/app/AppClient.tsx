"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Menu, X, GraduationCap, Construction, Search, Command, SendHorizonal,
  TrendingUp, Activity, FlaskConical, GitBranch, BarChart3, Layers,
  Database, ChevronRight, ChevronLeft, PlusCircle, Undo2, Redo2
} from "lucide-react";

import { TOOLS, findTool, type Tool } from "@/lib/tools";
import { eventBus } from "@/lib/eventBus";
import LabDashboard, { recordRecentTool } from "@/components/LabDashboard";
import CommandPalette from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace/WorkspaceProvider";
import DataView from "@/components/workspace/DataView";
import { useTabHistory } from "@/components/workspace/useTabHistory";

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Models: TrendingUp, Distributions: Activity, Inference: FlaskConical,
  Simulation: GitBranch, Charts: BarChart3, Methods: Layers,
};

const GROUP_COLORS: Record<string, string> = {
  Models: "text-blue-500", Distributions: "text-indigo-500", Inference: "text-purple-500",
  Simulation: "text-emerald-500", Charts: "text-orange-500", Methods: "text-rose-500",
};

export default function AppClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const toolParam = sp.get("tool");
  const tool = (toolParam ? findTool(toolParam) : null) ?? null;
  const { tabs, closeTab } = useTabHistory(tool?.id ?? null);

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

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const openPalette = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac }));

  // Phase 1 + 2 States
  const [activeSidebarView, setActiveSidebarView] = useState<"tools" | "data">("tools");
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const [sidebarSearch, setSidebarSearch] = useState("");
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        let newWidth = e.clientX - 40; // 40 is activity bar width
        if (newWidth < 180) newWidth = 180;
        if (newWidth > 400) newWidth = 400;
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };
    if (isDraggingSidebar) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Tutor panel split-view state
  const [tutorWidth, setTutorWidth] = useState(384);
  const [isDraggingTutor, setIsDraggingTutor] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Derived — drives open/close via URL
  const tutorOpen = sp.get("tab") === "tutor";

  const handleTutorMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingTutor(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTutor) return;
      const mainRight = mainRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      let newWidth = mainRight - e.clientX;
      newWidth = Math.max(280, Math.min(600, newWidth));
      setTutorWidth(newWidth);
    };
    const handleMouseUp = () => setIsDraggingTutor(false);
    if (isDraggingTutor) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingTutor]);

  return (
    <WorkspaceProvider>
      <div className={`flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 ${(isDraggingSidebar || isDraggingTutor) ? 'select-none cursor-col-resize' : ''}`}>
        <CommandPalette />

        <header className="sticky top-0 z-30 bg-white/85 dark:bg-neutral-950/85 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 print:hidden">
          <div className="h-14 px-4 md:px-6 flex items-center gap-2">
            {/* LEFT: Logo + Undo + Dataset */}
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <button
                className="md:hidden p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setNavOpen(v => !v)}
              >
                {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <Link href="/" className="font-medium tracking-tight text-neutral-900 dark:text-neutral-100 shrink-0">
                Stats Lab
              </Link>
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
                <UndoRedoButtons />
                <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
                <DatasetChip />
              </div>
            </div>

            {/* CENTER: Mega-nav breadcrumb */}
            <div className="flex-1 hidden md:flex items-center justify-center">
              {tool && (
                <MegaNavBreadcrumb
                  tool={tool}
                  groups={groups}
                  onNavigate={(path) => router.push(path)}
                  openPalette={openPalette}
                />
              )}
            </div>

            {/* RIGHT: Computing + Search + Theme + Copy + Ask */}
            <div className="flex items-center gap-2 shrink-0">
              <ComputingChip />
              <button
                onClick={openPalette}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 transition-colors"
                aria-label="Open command palette"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden lg:inline text-xs">Search</span>
                <kbd className="ml-1 hidden lg:inline-flex items-center gap-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-1 py-0.5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                  {isMac ? <Command className="w-2.5 h-2.5" /> : "Ctrl"} K
                </kbd>
              </button>

              <ThemeToggle compact />

              <Link
                href={tool ? `/app?tool=${tool.id}&tab=tutor` : "/app?tab=tutor"}
                className={`hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  sp.get("tab") === "tutor"
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

        {/* Browser-like Tab Bar */}
        {tabs.length > 0 && (
          <div className="shrink-0 h-11 bg-neutral-50 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-800 flex items-center px-4 overflow-x-auto scrollbar-none gap-1 select-none print:hidden">
            {tabs.map((t) => {
              const Icon = GROUP_ICONS[t.group] || Layers;
              return (
                <div
                  key={t.id}
                  onClick={() => router.push(t.built ? `/app?tool=${t.id}` : "#")}
                  className={`group h-8 flex items-center gap-2 px-3 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 ${
                    t.isActive
                      ? "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "bg-transparent border border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/30"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${GROUP_COLORS[t.group] || "text-neutral-450"}`} />
                  <span className="truncate max-w-[120px]">{t.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                      if (t.isActive) {
                        const remaining = tabs.filter(x => x.id !== t.id);
                        if (remaining.length > 0) {
                          router.push(`/app?tool=${remaining[remaining.length - 1].id}`);
                        } else {
                          router.push("/app");
                        }
                      }
                    }}
                    className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ml-1"
                    title="Close tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => router.push("/app")}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ml-1"
              title="Open dashboard"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 flex min-h-0 overflow-hidden relative">

          {/* Phase 1: Activity Bar + Sidebar */}
          <aside
            className={`relative flex shrink-0 h-full border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 z-20 print:hidden ${
              isDraggingSidebar ? "" : "transition-all duration-300"
            } ${navOpen ? "absolute inset-0 w-full" : "hidden md:flex"}`}
            style={{ width: typeof window !== "undefined" && window.innerWidth >= 768 ? (sidebarCollapsed ? 48 : sidebarWidth + 48) : undefined }}
          >
            {/* Activity Bar */}
            <div className="w-12 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col items-center py-3 gap-2">
              {[
                { id: "tools" as const, icon: Layers, label: "Tools" },
                { id: "data" as const, icon: Database, label: "Data Workspace" },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSidebarView(item.id);
                    if (sidebarCollapsed) setSidebarCollapsed(false);
                  }}
                  className={`relative p-2 rounded-xl transition-colors ${
                    activeSidebarView === item.id && !sidebarCollapsed
                      ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40"
                      : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                  title={item.label}
                >
                  <item.icon className="w-5 h-5" />
                  {activeSidebarView === item.id && !sidebarCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r bg-indigo-600" />
                  )}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            </div>

            {/* Sidebar Content */}
            {!sidebarCollapsed && (
              <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-neutral-950">
                <div className="h-10 shrink-0 px-4 flex items-center border-b border-neutral-100 dark:border-neutral-800/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    {activeSidebarView === "tools" ? "Tools" : "Data Workspace"}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
                  {activeSidebarView === "tools" && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-neutral-400" />
                        <input
                          ref={sidebarSearchRef}
                          value={sidebarSearch}
                          onChange={e => setSidebarSearch(e.target.value)}
                          placeholder="Filter tools..."
                          className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        {groups.map(([group, ts]) => {
                          const Icon = GROUP_ICONS[group] || Layers;
                          const isCollapsed = collapsedGroups.has(group);
                          const matches = sidebarSearch
                            ? ts.filter(t => t.name.toLowerCase().includes(sidebarSearch.toLowerCase()) || group.toLowerCase().includes(sidebarSearch.toLowerCase()))
                            : ts;

                          if (matches.length === 0) return null;

                          return (
                            <div key={group}>
                              <button
                                onClick={() => toggleGroup(group)}
                                className="w-full flex items-center justify-between p-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 rounded-lg transition-colors group/gb"
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className={`w-3.5 h-3.5 ${GROUP_COLORS[group]}`} />
                                  <span className="text-xs font-semibold">{group}</span>
                                </div>
                                <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                              </button>
                              {!isCollapsed && (
                                <ul className="mt-1 space-y-0.5 ml-1 border-l border-neutral-100 dark:border-neutral-800/60 pl-2">
                                  {matches.map(t => (
                                    <li key={t.id}>
                                      <Link
                                        href={t.built ? `/app?tool=${t.id}` : "#"}
                                        onClick={() => setNavOpen(false)}
                                        className={`flex items-center justify-between p-1.5 rounded-lg text-sm transition-colors ${
                                          t.id === toolParam
                                            ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium"
                                            : t.built
                                            ? "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                            : "text-neutral-400 opacity-60"
                                        }`}
                                      >
                                        <span className="truncate">{t.name}</span>
                                        {!t.built && <span className="text-[9px] uppercase tracking-wider">Soon</span>}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {activeSidebarView === "data" && (
                    <DataView />
                  )}
                </div>
              </div>
            )}
            {!sidebarCollapsed && (
              <div
                onMouseDown={handleSidebarMouseDown}
                className="absolute right-0 top-0 bottom-0 w-2 -translate-x-px cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-500/70 transition-colors"
              />
            )}
          </aside>

          {/* Center Canvas + Tutor Panel (inline split view) */}
          <main
            ref={mainRef}
            className="flex-1 flex min-h-0 overflow-hidden relative bg-neutral-50/50 dark:bg-neutral-950/50"
          >
            {/* Canvas column — grows to fill remaining width */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto scrollbar-thin p-6 md:p-8">
                <div className="max-w-[1600px] w-full mx-auto">
                  {!toolParam ? (
                    <LabDashboard />
                  ) : tool ? (
                    <ToolCanvas tool={tool} />
                  ) : (
                    <NotFound id={toolParam} />
                  )}
                </div>
              </div>
            </div>

            {/* Tutor panel — always mounted, open/close via width */}
            <TutorPanel
              tool={tool}
              onClose={() => router.push(tool ? `/app?tool=${tool.id}` : "/app")}
              isOpen={tutorOpen}
              width={tutorWidth}
              onResizeStart={handleTutorMouseDown}
              isMobile={isMobile}
              autoaskPrompt={sp.get("autoask")}
            />
          </main>

        </div>
      </div>
    </WorkspaceProvider>
  );
}

type ChatMsg = { role: "user" | "assistant"; content: string };

function TutorPanel({
  tool,
  onClose,
  isOpen,
  width,
  onResizeStart,
  isMobile,
  autoaskPrompt,
}: {
  tool: Tool | null;
  onClose: () => void;
  isOpen: boolean;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  isMobile: boolean;
  autoaskPrompt: string | null;
}) {
  const greeting = tool
    ? `I can see your current ${tool.name} setup. Ask me anything — or just say "show me" and I'll demonstrate a concept live.`
    : "Pick a tool from the sidebar. I'll be able to see your parameters and change them to demonstrate concepts.";

  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ role: "assistant", content: greeting }]);
    setActions([]);
  }, [tool?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const router = useRouter();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const send = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;
    const next: ChatMsg[] = [...messagesRef.current, { role: "user", content: content.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setErr(null);
    setActions([]);

    // Snapshot the live tool state at send time
    const toolState = tool?.id
      ? (window as any).__statslab_tool_states?.[tool.id] ?? {}
      : {};

    const context = tool
      ? { tool: tool.name, group: tool.group, description: tool.blurb, currentState: toolState }
      : null;

    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${r.status}`);
      }

      // Stream the response
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let fullText = "";

      // Append placeholder for streaming assistant message
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        // Strip command tags from display text as we stream
        const display = fullText.replace(/<command>[\s\S]*?<\/command>/g, "").trim();
        setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: display }]);
      }

      // After full response: extract and execute <command> tags
      const cmdRegex = /<command>([\s\S]*?)<\/command>/g;
      const fired: string[] = [];
      let match;
      while ((match = cmdRegex.exec(fullText)) !== null) {
        try {
          const cmd = JSON.parse(match[1]);
          if (cmd.param !== undefined && cmd.value !== undefined && tool) {
            eventBus.emit("statslab:set-tool-state", {
              targetToolId: tool.id,
              param: cmd.param,
              value: cmd.value,
            });
            fired.push(`${cmd.param} → ${cmd.value}`);
          }
        } catch {
          // malformed command — ignore
        }
      }
      if (fired.length > 0) setActions(fired);

    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
      // Remove the empty placeholder on error
      setMessages(prev => prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev);
    } finally {
      setLoading(false);
    }
  }, [tool, loading]);

  // Auto-send prompt from onboarding link (?autoask=...)
  const [autoasked, setAutoasked] = useState(false);
  useEffect(() => {
    if (!autoaskPrompt || autoasked || !tool) return;
    setAutoasked(true);
    const params = new URLSearchParams(window.location.search);
    params.delete("autoask");
    router.replace(`${window.location.pathname}?${params.toString()}`);
    const timer = setTimeout(() => send(autoaskPrompt), 900);
    return () => clearTimeout(timer);
  }, [autoaskPrompt, autoasked, tool, send, router]);

  useEffect(() => {
    const unsubscribe = eventBus.on("statslab:ask-tutor", ({ prompt }) => {
      // 1. Open the tutor panel tab in the URL
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "tutor");
      router.push(`${window.location.pathname}?${params.toString()}`);
      
      // 2. Send the prompt to the AI tutor
      send(prompt);
    });
    return unsubscribe;
  }, [send, router]);

  return (
    <div
      className={[
        // always-on structural classes
        "flex flex-col shrink-0 print:hidden",
        "bg-white dark:bg-neutral-950",
        "overflow-hidden",
        "transition-[width,border-color] duration-300 ease-in-out",
        // mobile: absolute overlay (scoped to <main> which is `relative`)
        isMobile
          ? "absolute inset-y-0 right-0 z-40 shadow-2xl h-full"
          : "relative h-full",
        // border: only visible when open
        isOpen
          ? "border-l border-neutral-200 dark:border-neutral-800"
          : "border-l border-transparent",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: isOpen
          ? isMobile ? "100%" : `${width}px`
          : "0px",
      }}
    >
      {/* Drag-to-resize handle — desktop only, left edge of panel */}
      {!isMobile && (
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-500/70 transition-colors z-10"
        />
      )}

      <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-4 h-4 text-neutral-500 shrink-0" />
          <span className="text-xs uppercase tracking-wider text-neutral-500 truncate">
            {tool ? `Ask about ${tool.name}` : "Ask a question"}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((m, i) => (
          <Bubble key={i} who={m.role === "user" ? "user" : "bot"}>{m.content}</Bubble>
        ))}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce inline-block mr-1" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce inline-block mr-1" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce inline-block" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 text-[11px] font-medium">
                <span className="w-1 h-1 rounded-full bg-indigo-500" />
                {a}
              </span>
            ))}
          </div>
        )}
        {err && <div className="text-xs text-red-500 px-1">{err}</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-4 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="flex gap-2">
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading}
            placeholder="Ask a question…"
            className="flex-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm"
          />
          <button type="submit" disabled={!input.trim() || loading} className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900">
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ who, children }: { who: "user" | "bot"; children: React.ReactNode }) {
  return (
    <div className={`flex ${who === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${who === "user" ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-br-sm" : "bg-neutral-100 dark:bg-neutral-800 rounded-bl-sm"}`}>
        {children}
      </div>
    </div>
  );
}

function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useWorkspace();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return (
    <div className="hidden sm:flex items-center gap-0.5">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (⌘Y)"
        className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function DatasetChip() {
  const { dataset } = useWorkspace();
  if (!dataset) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full px-2.5 py-1 max-w-[180px]">
      <Database className="w-3 h-3 text-indigo-500 shrink-0" />
      <span className="truncate">{dataset.name}</span>
      <span className="text-neutral-300 dark:text-neutral-700 shrink-0">·</span>
      <span className="shrink-0">{dataset.rows.length}r</span>
      <span className="text-neutral-300 dark:text-neutral-700 shrink-0">·</span>
      <span className="shrink-0">{dataset.columns.length}col</span>
    </div>
  );
}

function ComputingChip() {
  const [label, setLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return eventBus.on("statslab:computing", ({ label: l, done }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (done) {
        timerRef.current = setTimeout(() => setLabel(null), 1500);
      } else {
        setLabel(l);
      }
    });
  }, []);

  if (!label) return null;
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
      {label}
    </div>
  );
}

function MegaNavBreadcrumb({
  tool,
  groups,
  onNavigate,
  openPalette,
}: {
  tool: Tool;
  groups: [string, Tool[]][];
  onNavigate: (path: string) => void;
  openPalette: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const Icon = GROUP_ICONS[tool.group] || Layers;

  return (
    <div ref={ref} className="relative flex items-center gap-0.5 text-sm select-none">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${GROUP_COLORS[tool.group] ?? "text-neutral-500"}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{tool.group}</span>
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      <ChevronRight className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-700 shrink-0" />

      <button
        onClick={openPalette}
        className="px-2 py-1 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors font-medium truncate max-w-[180px]"
        title={`Search tools in ${tool.group} (⌘K)`}
      >
        {tool.name}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl shadow-black/10 dark:shadow-black/40 p-1 z-50">
          {groups.map(([group, tools]) => {
            const GIcon = GROUP_ICONS[group] || Layers;
            const firstBuilt = tools.find(t => t.built);
            const builtCount = tools.filter(t => t.built).length;
            return (
              <button
                key={group}
                onClick={() => {
                  setOpen(false);
                  if (firstBuilt) onNavigate(`/app?tool=${firstBuilt.id}`);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  group === tool.group
                    ? "bg-neutral-50 dark:bg-neutral-900"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GIcon className={`w-3.5 h-3.5 shrink-0 ${GROUP_COLORS[group] ?? "text-neutral-500"}`} />
                  <span className={group === tool.group ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-400"}>
                    {group}
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 tabular-nums">{builtCount} tools</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

function ToolCanvas({ tool }: { tool: Tool }) {
  if (!tool.built || !tool.Component) return <ComingSoon tool={tool} />;
  const C = tool.Component;
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold">{tool.group}</div>
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
      <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center shadow-sm">
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
    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center shadow-sm">
      <h2 className="font-medium text-xl">Unknown tool</h2>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">No tool registered for <code>{id}</code>.</p>
      <Link href="/app" className="mt-4 inline-flex rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm shadow-sm">
        Back to dashboard
      </Link>
    </div>
  );
}
