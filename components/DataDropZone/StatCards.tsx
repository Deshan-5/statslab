"use client";

/**
 * DataDropZone/StatCards.tsx
 *
 * Visual sub-components for the detailed-stats section:
 *   SuggestionCard, ColumnCard, CorrelationPill, StatMini
 *
 * All are pure render components — no state, no hooks.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { findTool } from "@/lib/tools";
import { fmt } from "./analyse";
import type { Suggestion, ColumnStats } from "./types";

/* ── Suggestion card ─────────────────────────────────────────────────── */

export function SuggestionCard({ s }: { s: Suggestion }) {
  const { Icon } = s;
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all p-3.5">
      <div className="flex items-start gap-3">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
            {s.title}
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {s.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {s.buttons.map((b) => {
            const label = findTool(b.toolId)?.name ?? b.label;
            return (
              <Link
                key={b.toolId}
                href={`/app?tool=${b.toolId}`}
                className="group inline-flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 px-2.5 py-1 transition-all"
              >
                <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                  {label}
                </span>
                <ArrowRight className="w-3 h-3 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-300 transition-colors" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Column stat card ────────────────────────────────────────────────── */

export function ColumnCard({ col }: { col: ColumnStats }) {
  const distColor =
    col.distribution.confidence === "high"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
      : col.distribution.confidence === "medium"
        ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        : "text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700";

  const qualityColor =
    col.qualityScore >= 90 ? "text-emerald-600 dark:text-emerald-400"
    : col.qualityScore >= 75 ? "text-green-600 dark:text-green-400"
    : col.qualityScore >= 60 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div id={`col-card-${col.name}`} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/20 px-3 py-2.5 transition-all duration-500">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
          {col.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-medium tabular-nums ${qualityColor}`} title="Column quality score (0-100)">
            {col.qualityScore}
          </span>
          <span
            className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${distColor}`}
          >
            {col.distribution.name}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
        <StatMini label="Mean"    value={fmt(col.mean)}    />
        <StatMini label="Median"  value={fmt(col.median)}  />
        <StatMini label="SD"      value={fmt(col.sd)}      />
        <StatMini label="Min"     value={fmt(col.min)}     />
        <StatMini label="Max"     value={fmt(col.max)}     />
        <StatMini label="n"       value={String(col.count)}/>
        {col.missingCount > 0 && (
          <StatMini
            label="Missing"
            value={`${col.missingCount} (${(col.missingRate * 100).toFixed(0)}%)`}
            warn
          />
        )}
        {col.outlierCount > 0 && (
          <StatMini
            label="Outliers"
            value={String(col.outlierCount)}
            warn
            title={`IQR fences: [${fmt(col.lowerFence)}, ${fmt(col.upperFence)}]`}
          />
        )}
      </div>
    </div>
  );
}

/* ── Stat mini cell ──────────────────────────────────────────────────── */

function StatMini({ label, value, warn, title }: { label: string; value: string; warn?: boolean; title?: string }) {
  return (
    <div title={title}>
      <div className="text-neutral-400 dark:text-neutral-500">{label}</div>
      <div className={`font-mono tabular-nums ${warn ? "text-orange-600 dark:text-orange-400" : "text-neutral-700 dark:text-neutral-300"}`}>
        {value}
      </div>
    </div>
  );
}

/* ── Correlation pill ────────────────────────────────────────────────── */

export function CorrelationPill({
  corr,
}: {
  corr: { col1: string; col2: string; r: number };
}) {
  const color =
    Math.abs(corr.r) > 0.7
      ? "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20"
      : "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/30";
  const sign = corr.r > 0 ? "+" : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${color}`}
    >
      <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-[80px]">
        {corr.col1}
      </span>
      <span className="text-neutral-400 dark:text-neutral-600">vs</span>
      <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-[80px]">
        {corr.col2}
      </span>
      <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
        {sign}{corr.r.toFixed(2)}
      </span>
    </span>
  );
}
