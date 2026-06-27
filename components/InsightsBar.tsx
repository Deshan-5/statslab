"use client";

/**
 * InsightsBar — Auto-generated insight cards that appear above the data table.
 * Refactored to be collapsible and slim to prevent visual overwhelm.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { X, TrendingUp, AlertTriangle, BarChart3, HelpCircle, ChevronDown, ChevronUp, Sparkles, Users, Layers } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { generateInsights, type Insight } from "@/lib/insights";

const ICON_MAP: Record<Insight["type"], React.ComponentType<{ className?: string }>> = {
  correlation: TrendingUp,
  outlier: AlertTriangle,
  skewness: BarChart3,
  missing: HelpCircle,
  comparison: Users,
  bimodality: Layers,
};

const SEVERITY_CLASSES: Record<Insight["severity"], string> = {
  critical: "border-neutral-200 dark:border-neutral-800/60 bg-neutral-50/30 dark:bg-neutral-900/30",
  warning: "border-neutral-200 dark:border-neutral-800/60 bg-neutral-50/30 dark:bg-neutral-900/30",
  info: "border-neutral-200 dark:border-neutral-800/60 bg-neutral-50/30 dark:bg-neutral-900/30",
};

const ICON_CLASSES: Record<Insight["severity"], string> = {
  critical: "text-red-550 dark:text-red-400/80",
  warning: "text-amber-550 dark:text-amber-450/85",
  info: "text-blue-550 dark:text-blue-400/80",
};

export default function InsightsBar() {
  const { dataset } = useWorkspace();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  const insights = useMemo(() => {
    if (!dataset || dataset.rows.length < 3) return [];
    return generateInsights(dataset);
  }, [dataset]);

  const visible = insights.filter(i => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  // Summarize counts
  const outlierCount = visible.filter(i => i.type === "outlier").length;
  const skewCount = visible.filter(i => i.type === "skewness").length;
  const corrCount = visible.filter(i => i.type === "correlation").length;
  const missingCount = visible.filter(i => i.type === "missing").length;
  const compareCount = visible.filter(i => i.type === "comparison").length;
  const bimodalCount = visible.filter(i => i.type === "bimodality").length;

  const summaryParts: string[] = [];
  if (compareCount > 0) summaryParts.push(`${compareCount} group difference${compareCount > 1 ? "s" : ""}`);
  if (corrCount > 0) summaryParts.push(`${corrCount} key driver${corrCount > 1 ? "s" : ""}`);
  if (bimodalCount > 0) summaryParts.push(`${bimodalCount} bimodal variable${bimodalCount > 1 ? "s" : ""}`);
  if (outlierCount > 0) summaryParts.push(`${outlierCount} outlier column${outlierCount > 1 ? "s" : ""}`);
  if (skewCount > 0) summaryParts.push(`${skewCount} skewed distribution${skewCount > 1 ? "s" : ""}`);
  if (missingCount > 0) summaryParts.push(`${missingCount} column${missingCount > 1 ? "s" : ""} with missing values`);

  const summaryText = summaryParts.join(", ");


  return (
    <div className="w-full border border-neutral-200/50 dark:border-neutral-800/40 rounded-xl bg-neutral-50/20 dark:bg-neutral-950/15 transition-all duration-300">
      {/* Summary Row */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-neutral-100/30 dark:hover:bg-neutral-800/20 transition-all rounded-xl select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-orange-450 shrink-0 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-450">
            Auto-Insights
          </span>
          <span className="text-neutral-300 dark:text-neutral-700">|</span>
          <span className="text-xs text-neutral-600 dark:text-neutral-300 truncate">
            {summaryText ? `Found ${summaryText}.` : "No notable anomalies detected."}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="text-[11px] font-semibold text-orange-600 dark:text-orange-450 hover:underline">
            {isExpanded ? "Collapse" : "Show Observations"}
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          )}
        </div>
      </div>

      {/* Expanded grid of cards */}
      {isExpanded && (
        <div className="border-t border-neutral-150 dark:border-neutral-800/40 p-3 bg-neutral-50/[0.01] dark:bg-neutral-950/5 rounded-b-xl">
          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {visible.map((insight) => {
              const Icon = ICON_MAP[insight.type];
              return (
                <div
                  key={insight.id}
                  className={`relative group shrink-0 w-72 rounded-xl border px-3.5 py-3 text-xs ${SEVERITY_CLASSES[insight.severity]} transition-all hover:shadow-sm flex flex-col justify-between`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissed(prev => new Set(prev).add(insight.id));
                    }}
                    className="absolute top-1.5 right-1.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/50 dark:hover:bg-neutral-800/50 transition-all"
                    aria-label="Dismiss"
                  >
                    <X className="w-3 h-3 text-neutral-450" />
                  </button>

                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${ICON_CLASSES[insight.severity]}`} />
                    <div className="min-w-0 flex-1 flex flex-col justify-between h-full min-h-[72px]">
                      <div>
                        <div className="font-semibold text-neutral-850 dark:text-neutral-200 leading-snug whitespace-normal">
                          {insight.title}
                        </div>
                        <div className="text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed whitespace-normal">
                          {insight.description}
                        </div>
                      </div>
                      {insight.suggestedTool && (
                        <div className="mt-2.5">
                          <Link
                            href={`/app?tool=${insight.suggestedTool}`}
                            className="inline-block text-[10px] font-medium text-neutral-550 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2 transition-colors"
                          >
                            Open in {insight.suggestedTool.replace(/-/g, " ")} →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
