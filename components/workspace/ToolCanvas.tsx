"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Save, FolderOpen, Trash2, Download, Copy, Construction } from "lucide-react";
import { TOOLS, type Tool } from "@/lib/tools";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import { eventBus } from "@/lib/eventBus";

// Dynamic DB Helpers
async function saveWorkspaceToDbOrLocal(
  userId: string | undefined,
  toolId: string,
  title: string,
  dataset: any | null,
  toolState: any,
  queryString: string
) {
  const data = {
    dataset,
    toolState,
    queryString,
    createdAt: new Date().toISOString(),
  };

  if (userId) {
    try {
      const { saveAnalysis } = await import("@/lib/db");
      const saved = await saveAnalysis(userId, toolId, title, data);
      if (saved) return saved;
    } catch (err) {
      console.warn("Failed to save to Supabase, falling back to localStorage", err);
    }
  }

  const localKey = "statslab:saved-workspaces";
  const existingRaw = localStorage.getItem(localKey);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  const newWorkspace = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    user_id: userId || "anonymous",
    tool_id: toolId,
    title,
    data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(localKey, JSON.stringify([newWorkspace, ...existing]));
  return newWorkspace;
}

async function listWorkspacesFromDbOrLocal(userId: string | undefined) {
  if (userId) {
    try {
      const { listAnalyses } = await import("@/lib/db");
      const list = await listAnalyses(userId);
      if (list) return list;
    } catch (err) {
      console.warn("Failed to fetch from Supabase, falling back to localStorage", err);
    }
  }

  const localKey = "statslab:saved-workspaces";
  const existingRaw = localStorage.getItem(localKey);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  if (userId) {
    return existing.filter((w: any) => w.user_id === userId || w.user_id === "anonymous");
  }
  return existing;
}

async function deleteWorkspaceFromDbOrLocal(id: string, userId?: string) {
  if (userId) {
    try {
      const { deleteAnalysis } = await import("@/lib/db");
      const success = await deleteAnalysis(id, userId);
      if (success) return true;
    } catch (err) {
      // Ignore and proceed to local
    }
  }

  const localKey = "statslab:saved-workspaces";
  const existingRaw = localStorage.getItem(localKey);
  if (existingRaw) {
    const existing = JSON.parse(existingRaw);
    const updated = existing.filter((w: any) => w.id !== id);
    localStorage.setItem(localKey, JSON.stringify(updated));
  }
  return true;
}

export default function ToolCanvas({
  tool,
  showToast,
}: {
  tool: Tool;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const { dataset, loadCustomDataset } = useWorkspace();
  const router = useRouter();
  const { data: session } = useSession();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [showSavedList, setShowSavedList] = useState(false);
  const [savedWorkspaces, setSavedWorkspaces] = useState<any[]>([]);

  const refreshWorkspaces = async () => {
    const list = await listWorkspacesFromDbOrLocal((session?.user as any)?.id);
    setSavedWorkspaces(list || []);
  };

  useEffect(() => {
    refreshWorkspaces();
  }, [(session?.user as any)?.id]);

  if (!tool.built || !tool.Component) return <ComingSoon tool={tool} />;
  const C = tool.Component;

  const handleSave = async () => {
    const title = saveTitle.trim() || `My ${tool.name} Analysis`;
    const toolState = typeof window !== "undefined" ? (window.__statslab_tool_states?.[tool.id] || {}) : {};

    const datasetToSave = dataset
      ? {
          id: dataset.id,
          name: dataset.name,
          source: dataset.source,
          headers: dataset.headers,
          rows: dataset.rows,
        }
      : null;

    const queryString = typeof window !== "undefined" ? window.location.search : "";

    await saveWorkspaceToDbOrLocal(
      (session?.user as any)?.id,
      tool.id,
      title,
      datasetToSave,
      toolState,
      queryString
    );

    setShowSaveDialog(false);
    setSaveTitle("");
    refreshWorkspaces();
  };

  const handleDelete = async (id: string) => {
    await deleteWorkspaceFromDbOrLocal(id, (session?.user as any)?.id);
    refreshWorkspaces();
  };

  const loadWorkspace = (w: any) => {
    if (w.data?.dataset) {
      loadCustomDataset(w.data.dataset);
    } else {
      loadCustomDataset(null);
    }

    let targetUrl = `/app?tool=${w.tool_id}`;
    if (w.data?.queryString) {
      const params = new URLSearchParams(w.data.queryString);
      params.set("tool", w.tool_id);
      targetUrl = `/app?${params.toString()}`;
    }

    router.push(targetUrl);

    setTimeout(() => {
      if (w.data?.toolState) {
        Object.entries(w.data.toolState).forEach(([key, val]) => {
          eventBus.emit("statslab:set-tool-state", {
            targetToolId: w.tool_id,
            param: key,
            value: val,
          });
        });
      }
    }, 150);
  };

  const getSerializedSvg = (svgEl: SVGElement, includeBg: boolean = false) => {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);

    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+ xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
      source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    const isDarkMode = document.documentElement.classList.contains("dark");
    const bg = isDarkMode ? "#0a0a0a" : "#ffffff";
    const ink = isDarkMode ? "#e5e5e5" : "#171717";
    const muted = isDarkMode ? "#a3a3a3" : "#737373";
    const axis = isDarkMode ? "#262626" : "#e5e5e5";
    const grid = isDarkMode ? "#1a1a1a" : "#f3f3f3";
    const success = isDarkMode ? "#4ade80" : "#16a34a";
    const danger = isDarkMode ? "#f87171" : "#dc2626";
    const accent = "#fb923c";

    if (includeBg) {
      const bgRect = `<rect width="100%" height="100%" fill="${bg}"/>`;
      source = source.replace(/^<svg([^>]*)>/, `<svg$1>${bgRect}`);
    }

    source = source.replace(/var\(--chart-bg\)/g, bg);
    source = source.replace(/var\(--chart-ink\)/g, ink);
    source = source.replace(/var\(--chart-muted\)/g, muted);
    source = source.replace(/var\(--chart-axis\)/g, axis);
    source = source.replace(/var\(--chart-grid\)/g, grid);
    source = source.replace(/var\(--chart-success\)/g, success);
    source = source.replace(/var\(--chart-danger\)/g, danger);
    source = source.replace(/var\(--chart-accent\)/g, accent);

    return source;
  };

  const exportSvg = () => {
    const mainEl = document.querySelector("main");
    const svgEl = mainEl?.querySelector("svg:not(.lucide)");
    if (!svgEl) {
      showToast("No chart visualization (SVG) found on this page.", "error");
      return;
    }
    try {
      const source = getSerializedSvg(svgEl as SVGElement);
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tool.id}-chart.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Chart exported as SVG successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to export SVG chart.", "error");
    }
  };

  const exportPng = () => {
    const mainEl = document.querySelector("main");
    const svgEl = mainEl?.querySelector("svg:not(.lucide)");
    if (!svgEl) {
      showToast("No chart visualization (SVG) found on this page.", "error");
      return;
    }
    try {
      const rect = svgEl.getBoundingClientRect();
      const width = (svgEl as SVGSVGElement).viewBox?.baseVal?.width || rect.width || 720;
      const height = (svgEl as SVGSVGElement).viewBox?.baseVal?.height || rect.height || 320;

      let source = getSerializedSvg(svgEl as SVGElement, true);
      // Ensure SVG root has explicit width and height attributes for correct loading size
      source = source.replace(/^<svg/, `<svg width="${width}" height="${height}"`);

      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = 2; // high-dpi export
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Draw image to fill the entire scaled canvas
            ctx.drawImage(img, 0, 0, width * scale, height * scale);
            canvas.toBlob((pngBlob) => {
              if (pngBlob) {
                const pngUrl = URL.createObjectURL(pngBlob);
                const link = document.createElement("a");
                link.href = pngUrl;
                link.download = `${tool.id}-chart.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(pngUrl);
                showToast("Chart exported as PNG successfully!", "success");
              } else {
                showToast("Failed to generate PNG image.", "error");
              }
            }, "image/png");
          } else {
            showToast("Failed to get 2D rendering context.", "error");
          }
        } catch (innerErr) {
          console.error(innerErr);
          showToast("Failed to render canvas image.", "error");
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        showToast("Failed to load vector chart for PNG export.", "error");
      };
      img.src = url;
    } catch (err) {
      console.error(err);
      showToast("Failed to export PNG chart.", "error");
    }
  };

  const copySvgToClipboard = () => {
    const mainEl = document.querySelector("main");
    const svgEl = mainEl?.querySelector("svg:not(.lucide)");
    if (!svgEl) {
      showToast("No chart visualization (SVG) found on this page.", "error");
      return;
    }
    try {
      const source = getSerializedSvg(svgEl as SVGElement);
      navigator.clipboard.writeText(source);
      showToast("Vector SVG copied to clipboard! Paste directly into Figma or Illustrator.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to copy SVG to clipboard.", "error");
    }
  };

  const exportTable = () => {
    const mainEl = document.querySelector("main");
    const tableEl = mainEl?.querySelector("table");
    if (!tableEl) {
      showToast("No summary data table found on this page.", "error");
      return;
    }
    try {
      const rows = Array.from(tableEl.querySelectorAll("tr"));
      const csvContent = rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("th, td"));
          return cells
            .map((cell) => {
              const cellClone = cell.cloneNode(true) as HTMLElement;
              cellClone.querySelectorAll("button, svg, script, style, .sr-only").forEach((el) => el.remove());
              let text = cellClone.textContent?.trim() || "";
              text = text.replace(/"/g, '""');
              return `"${text}"`;
            })
            .join(",");
        })
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tool.id}-summary.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Table exported as CSV successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to export table as CSV.", "error");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap border-b border-neutral-200 dark:border-neutral-850 pb-5">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{tool.group}</div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="font-medium tracking-tight text-3xl text-neutral-900 dark:text-neutral-100">{tool.name}</h1>
            {tool.wikiUrl && (
              <a
                href={tool.wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 px-2.5 py-0.5 rounded-full transition-colors"
              >
                Learn
              </a>
            )}
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-2xl text-sm leading-relaxed">{tool.blurb}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative flex-wrap">
          <button
            onClick={() => setShowSaveDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            Save Workspace
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSavedList(!showSavedList)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Workspaces
              {savedWorkspaces.length > 0 && (
                <span className="ml-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">
                  {savedWorkspaces.length}
                </span>
              )}
            </button>

            {showSavedList && (
              <div className="absolute right-0 mt-2 w-80 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200/40 dark:border-neutral-800/40 rounded-2xl shadow-2xl p-4 z-45 max-h-96 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-200/30 dark:border-neutral-800/30 pb-2">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Saved Workspaces</h3>
                  <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full text-neutral-500">
                    {savedWorkspaces.length}
                  </span>
                </div>
                {savedWorkspaces.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">No saved workspaces found.</p>
                ) : (
                  <div className="space-y-2">
                    {savedWorkspaces.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-start justify-between gap-2 p-2 rounded-xl hover:bg-neutral-100/40 dark:hover:bg-neutral-800/40 transition-colors text-left group"
                      >
                        <button
                          onClick={() => {
                            loadWorkspace(w);
                            setShowSavedList(false);
                          }}
                          className="flex-1 min-w-0"
                        >
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">
                            {w.title}
                          </div>
                          <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mt-0.5">
                            <span>
                              {w.tool_id
                                .split("-")
                                .map((s: string) => s[0].toUpperCase() + s.slice(1))
                                .join(" ")}
                            </span>
                            <span>•</span>
                            <span>{new Date(w.created_at).toLocaleDateString()}</span>
                          </div>
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="text-neutral-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-500/10 transition-colors self-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-850 mx-1 hidden sm:block" />

          <button
            onClick={exportSvg}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export SVG
          </button>

          <button
            onClick={exportPng}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export PNG
          </button>

          <button
            onClick={copySvgToClipboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Vector
          </button>

          <button
            onClick={exportTable}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </header>
      <ErrorBoundary>
        <C />
      </ErrorBoundary>

      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-neutral-200/40 dark:border-neutral-800/40 rounded-2xl shadow-xl p-5 space-y-4">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Save Workspace</h3>
            <div className="space-y-1.5">
              <label htmlFor="workspace-title-input" className="text-xs text-neutral-500 uppercase tracking-wider">
                Workspace Title
              </label>
              <input
                id="workspace-title-input"
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={`My ${tool.name} Analysis`}
                className="w-full rounded-xl border border-neutral-300/40 dark:border-neutral-700/40 bg-white/30 dark:bg-neutral-900/25 px-4 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div className="flex justify-end gap-2 text-sm pt-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="rounded-xl px-4 py-2 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-350"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-xl px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
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

export function NotFound({ id }: { id: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center">
      <h2 className="font-medium text-xl">Unknown tool</h2>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        No tool registered for <code>{id}</code>.
      </p>
      <Link
        href="/app"
        className="mt-4 inline-flex rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 text-sm"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
