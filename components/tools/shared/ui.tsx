"use client";

import { useState, type RefObject, useEffect } from "react";
import { Clipboard, Check, Download, Sparkles } from "lucide-react";
import { eventBus } from "@/lib/eventBus";

/* ── Reusable field / stat / tabs ────────────────────────────────────────── */

export function Field({
  label, value, children,
}: { label: string; value: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
        <span>{label}</span>
        <span className="font-mono text-neutral-900 dark:text-neutral-100">{value}</span>
      </div>
      {children}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="font-mono text-base text-neutral-900 dark:text-neutral-100 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Verdict({
  reject, pValue, alpha,
}: { reject: boolean; pValue: number; alpha: number }) {
  return (
    <div
      className={`rounded-full inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium border ${
        reject
          ? "border-red-500 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30"
          : "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
      }`}
    >
      {reject ? "✕  Reject H₀" : "✓  Fail to reject H₀"}
      <span className="opacity-60 text-xs font-normal">
        p = {pValue.toFixed(4)}, α = {alpha}
      </span>
    </div>
  );
}

export function Tabs({
  tabs, active, onChange,
}: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mb-5 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            active === t
              ? "text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({
  label, value, onChange, step, min, max,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step} min={min} max={max}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-mono bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 dark:focus:ring-neutral-700"
      />
    </label>
  );
}

export function DataTextArea({
  label, value, onChange, placeholder, rows,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="block">
      {label && (
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Paste values separated by commas or newlines…"}
        rows={rows || 3}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-mono bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 dark:focus:ring-neutral-700 resize-y"
      />
    </label>
  );
}

export function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Collapsible({
  title, children, defaultOpen = false,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        {title}
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function SampleDataButton({ onClick, label = "Load sample data" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 underline underline-offset-2"
    >
      {label}
    </button>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ToolGrid({
  chart, controls,
}: { chart: React.ReactNode; controls: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2"><Panel>{chart}</Panel></div>
      <div><Panel className="space-y-5">{controls}</Panel></div>
    </div>
  );
}

export function Btn({
  children, onClick, primary = false, className = "", disabled = false,
}: { children: React.ReactNode; onClick: () => void; primary?: boolean; className?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-full px-4 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        primary
          ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90"
          : "border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function StepByStep({ steps }: { steps: { label: string; value: string }[] }) {
  return (
    <Collapsible title="Step-by-step calculation">
      <div className="space-y-2 font-mono text-xs text-neutral-700 dark:text-neutral-300">
        {steps.map((s, i) => (
          <div key={i} className="flex justify-between gap-4 py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
            <span className="text-neutral-500 dark:text-neutral-400">{s.label}</span>
            <span className="text-neutral-900 dark:text-neutral-100 font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

export function Formula({ text }: { text: string }) {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 font-mono text-sm text-neutral-700 dark:text-neutral-300 overflow-x-auto">
      {text}
    </div>
  );
}

/* ── Export helpers ─────────────────────────────────────────────────── */

const ICON_BTN_CLASS =
  "inline-flex items-center justify-center w-6 h-6 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors";

/** Copies a Markdown table to clipboard; flips icon to a check for 2s. */
export function CopyTableButton({
  data, headers,
}: { data: (string | number)[][]; headers: string[] }) {
  const [copied, setCopied] = useState(false);

  const buildMarkdown = (): string => {
    const headerRow = `| ${headers.join(" | ")} |`;
    const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
    const bodyRows = data.map(
      (row) => `| ${row.map((v) => String(v)).join(" | ")} |`,
    );
    return [headerRow, sepRow, ...bodyRows].join("\n");
  };

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? "Copied!" : "Copy as Markdown table"}
      aria-label={copied ? "Copied" : "Copy table as Markdown"}
      className={ICON_BTN_CLASS}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-orange-500" />
        : <Clipboard className="w-3.5 h-3.5" />}
    </button>
  );
}

/** Downloads a chart SVG as a PNG via an offscreen canvas. */
export function DownloadChartButton({
  svgRef, filename = "chart.png",
}: { svgRef: RefObject<SVGSVGElement | null>; filename?: string }) {
  const onClick = () => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(svg);
      const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const rect = svg.getBoundingClientRect();
      const width = svg.viewBox?.baseVal?.width || rect.width || 800;
      const height = svg.viewBox?.baseVal?.height || rect.height || 600;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        const dataUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Download chart as PNG"
      aria-label="Download chart as PNG"
      className={ICON_BTN_CLASS}
    >
      <Download className="w-3.5 h-3.5" />
    </button>
  );
}

export function Interpretation({ text }: { text: string | null }) {
  if (!text) return null;
  const askTutor = () => {
    eventBus.emit("statslab:ask-tutor", { prompt: text });
  };
  return (
    <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3 text-left">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
        Interpretation
      </div>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
        {text}
      </p>
      <div className="flex justify-end mt-3 border-t border-neutral-200/40 dark:border-neutral-800/40 pt-2.5">
        <button
          type="button"
          onClick={askTutor}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 dark:bg-white hover:opacity-90 text-white dark:text-neutral-900 px-3.5 py-1.5 text-[11px] font-semibold shadow-sm transition-all"
        >
          <Sparkles className="w-3 h-3 text-orange-400" />
          Explain with AI Tutor
        </button>
      </div>
    </div>
  );
}

export function useTutorInput(handlers: Record<string, (val: any) => void>) {
  useEffect(() => {
    const unsubscribe = eventBus.on("statslab:set-input", ({ param, value }) => {
      if (param && handlers[param]) {
        handlers[param](value);
      }
    });
    return unsubscribe;
  }, [handlers]);
}

export { useRegisterToolState } from "@/hooks/useRegisterToolState";
