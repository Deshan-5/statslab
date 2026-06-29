"use client";

import { useState, useMemo, useEffect } from "react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  FileText, Sparkles, Download, Printer, Settings, RefreshCw, BarChart2,
  AlertCircle, ChevronRight, CheckCircle2, TrendingUp, Info
} from "lucide-react";
import {
  mean, sd, median, skewness, kurtosis, detectDistribution,
  pearsonR, tCDF, oneWayANOVA, welchTest, normalPDF
} from "@/components/tools/shared/stats";

// Helper to compute p-value of correlation
function correlationPValue(r: number, n: number): number {
  if (n <= 2 || Math.abs(r) >= 1) return 1;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - tCDF(Math.abs(t), n - 2));
  return isNaN(p) ? 1 : Math.max(0, Math.min(1, p));
}

// Chart suggestion type
type ChartSuggestion = {
  type: "scatter" | "bar" | "box" | "distribution";
  xCol: string;
  yCol: string;
};

// Report JSON type returned by Gemini API
type ReportData = {
  title: string;
  executiveSummary: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
    chart?: ChartSuggestion;
  }>;
  recommendations: string[];
};

export default function NarrativeReport() {
  const { dataset } = useWorkspace();

  // Settings
  const [alpha, setAlpha] = useState(0.05);
  const [focus, setFocus] = useState("general");
  const [tone, setTone] = useState("academic");

  // State
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loading animation triggers
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const intervals = [1200, 2400, 3600];
    const timers = intervals.map((ms, idx) =>
      setTimeout(() => setLoadingStep(idx + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // Client-side statistical relationship detector
  const statisticsContext = useMemo(() => {
    if (!dataset) return null;

    const numericCols = dataset.columns.filter((c) => c.type === "numeric");
    const categoricalCols = dataset.columns.filter((c) => c.type === "categorical");

    // 1. Column summaries
    const columnsSummary = numericCols.map((c) => {
      const vals = c.numeric;
      const sorted = [...vals].sort((a, b) => a - b);
      let outlierCount = 0;
      if (sorted.length >= 4) {
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lf = q1 - 1.5 * iqr;
        const uf = q3 + 1.5 * iqr;
        outlierCount = vals.filter((v) => v < lf || v > uf).length;
      }
      return {
        name: c.name,
        mean: mean(vals) || 0,
        median: median(vals) || 0,
        sd: sd(vals) || 0,
        skewness: skewness(vals) || 0,
        kurtosis: kurtosis(vals) || 0,
        outlierCount,
        distributionName: detectDistribution(vals)?.name || "unknown"
      };
    });

    const categoricalSummary = categoricalCols.map((c) => {
      const uniques = new Set(c.values.filter(v => v !== null && v !== ""));
      return {
        name: c.name,
        cardinality: uniques.size
      };
    });

    // 2. Correlations (bivariate relationships)
    const correlations: Array<{ col1: string; col2: string; r: number; pValue: number }> = [];
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const c1 = numericCols[i];
        const c2 = numericCols[j];
        // Align rows by index
        const commonIndices = c1.numericIndex.filter((idx) => c2.numericIndex.includes(idx));
        if (commonIndices.length >= 5) {
          const xs = commonIndices.map((idx) => c1.values[idx] as number);
          const ys = commonIndices.map((idx) => c2.values[idx] as number);
          const r = pearsonR(xs, ys);
          const pVal = correlationPValue(r, commonIndices.length);
          correlations.push({ col1: c1.name, col2: c2.name, r, pValue: pVal });
        }
      }
    }

    // 3. Group comparisons (categorized numerical values)
    const groupComparisons: Array<{
      numericCol: string;
      categoricalCol: string;
      testName: string;
      statistic: number;
      pValue: number;
      df: number | number[];
    }> = [];

    for (const numCol of numericCols) {
      for (const catCol of categoricalCols) {
        // Group numeric values by category
        const groupsMap = new Map<string, number[]>();
        for (let r = 0; r < dataset.rows.length; r++) {
          const catVal = String(dataset.rows[r][catCol.index] ?? "").trim();
          const numVal = dataset.rows[r][numCol.index];
          if (catVal !== "" && numVal !== null && typeof numVal === "number" && !isNaN(numVal)) {
            if (!groupsMap.has(catVal)) groupsMap.set(catVal, []);
            groupsMap.get(catVal)!.push(numVal);
          }
        }

        const validGroups = Array.from(groupsMap.values()).filter(g => g.length >= 3);
        if (validGroups.length === 2) {
          // Welch's t-test
          const res = welchTest(validGroups[0], validGroups[1], alpha, "two");
          groupComparisons.push({
            numericCol: numCol.name,
            categoricalCol: catCol.name,
            testName: "Welch's t-test",
            statistic: res.testStat,
            pValue: res.pValue,
            df: res.df ?? 0
          });
        } else if (validGroups.length > 2 && validGroups.length <= 8) {
          // One-way ANOVA
          const res = oneWayANOVA(validGroups, alpha);
          const dfBetween = validGroups.length - 1;
          const dfWithin = validGroups.reduce((acc, g) => acc + g.length, 0) - validGroups.length;
          groupComparisons.push({
            numericCol: numCol.name,
            categoricalCol: catCol.name,
            testName: "One-way ANOVA",
            statistic: res.testStat,
            pValue: res.pValue,
            df: [dfBetween, dfWithin]
          });
        }
      }
    }

    return {
      datasetName: dataset.name,
      rowCount: dataset.rows.length,
      colCount: dataset.headers.length,
      columns: columnsSummary,
      categoricalColumns: categoricalSummary,
      correlations: correlations.sort((a, b) => a.pValue - b.pValue).slice(0, 8),
      groupComparisons: groupComparisons.sort((a, b) => a.pValue - b.pValue).slice(0, 8)
    };
  }, [dataset, alpha]);

  // API Call to generate narrative report
  const generateReport = async () => {
    if (!statisticsContext) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...statisticsContext,
          focus,
          tone,
          alpha
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to generate report");
      }

      const reportData: ReportData = await response.json();
      setReport(reportData);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Export report to Markdown
  const exportMarkdown = () => {
    if (!report) return;

    let md = `# ${report.title}\n\n`;
    md += `*Generated: ${new Date().toLocaleDateString()} | Dataset: ${dataset?.name} (${dataset?.rows.length} rows) | α = ${alpha}*\n\n`;
    md += `## Executive Summary\n\n${report.executiveSummary}\n\n`;

    report.sections.forEach((sec) => {
      md += `## ${sec.title}\n\n`;
      sec.paragraphs.forEach((p) => {
        md += `${p}\n\n`;
      });
      if (sec.chart) {
        md += `*Chart suggestion embedded: [${sec.chart.type} - X: ${sec.chart.xCol}${sec.chart.yCol ? `, Y: ${sec.chart.yCol}` : ""}]*\n\n`;
      }
    });

    md += `## Key Insights & Recommendations\n\n`;
    report.recommendations.forEach((rec) => {
      md += `- ${rec}\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${dataset?.name || "data"}_narrative_report.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print layout triggers
  const triggerPrint = () => {
    window.print();
  };

  if (!dataset) return null;

  // Render Setup Options screen if no report generated
  if (!report && !loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 space-y-6 max-w-4xl mx-auto shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">AI Narrative Report Builder</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Configure analysis parameters to generate a complete written report backed by verified client-side tests.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Focus */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Report Focus</label>            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 text-sm text-neutral-700 dark:text-neutral-350 focus:border-orange-500 focus:outline-none transition-colors"
            >
              <option value="general">General Exploratory</option>
              <option value="correlation">Trends & Relationships</option>
              <option value="difference">Group Differences (ANOVA/t-test)</option>
              <option value="distribution">Variable Distributions</option>
            </select>
          </div>
 
          {/* Tone */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Audience / Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 text-sm text-neutral-700 dark:text-neutral-350 focus:border-orange-500 focus:outline-none transition-colors"
            >
              <option value="academic">Academic Statistician</option>
              <option value="executive">Business Executive</option>
              <option value="tutor">Educational Tutor</option>
            </select>
          </div>

          {/* Significance level */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Significance Level (α)</label>
            <select
              value={alpha}
              onChange={(e) => setAlpha(parseFloat(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 text-sm text-neutral-700 dark:text-neutral-350 focus:border-orange-500 focus:outline-none transition-colors"
            >
              <option value="0.05">α = 0.05 (Default)</option>
              <option value="0.01">α = 0.01 (Strict)</option>
              <option value="0.10">α = 0.10 (Exploratory)</option>
            </select>
          </div>
        </div>

        {/* Pre-run relationships count check */}
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950/40 p-4 border border-neutral-150 dark:border-neutral-850 flex gap-3 items-start">
          <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-neutral-800 dark:text-neutral-200">Pre-flight Relationship Analysis</div>
            <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Based on your dataset, Stats Lab detected:
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{statisticsContext?.columns.length} continuous columns</span>,
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{(statisticsContext?.categoricalColumns.length ?? 0)} categorical columns</span>,
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{(statisticsContext?.correlations.length ?? 0)} bivariate correlations</span>, and
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{(statisticsContext?.groupComparisons.length ?? 0)} group comparison tests</span>.
              These exact mathematical properties will be loaded directly into Gemini.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 p-3.5 text-xs flex gap-2.5 items-center">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={generateReport}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold px-5 py-3 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Generate Narrative Report
        </button>
      </div>
    );
  }

  // Loading skeleton layout
  if (loading) {
    const steps = [
      "Running exploratory descriptive stats...",
      "Testing bivariate correlation coefficients...",
      "Conducting Welch's t-test and ANOVA models...",
      "Drafting clinical narrative report with Gemini..."
    ];
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-12 max-w-2xl mx-auto shadow-sm flex flex-col items-center justify-center space-y-6">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
          <Sparkles className="w-5 h-5 text-orange-500 absolute animate-pulse" />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Generating Report</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Processing calculations and synthesizing findings.</p>
        </div>

        <div className="w-full max-w-xs space-y-3 pt-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2.5 text-xs">
              {loadingStep > idx ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : loadingStep === idx ? (
                <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-200 dark:border-neutral-800 shrink-0" />
              )}
              <span className={loadingStep === idx ? "text-neutral-800 dark:text-neutral-200 font-medium" : "text-neutral-400"}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Report Render View
  if (report) {
    return (
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto min-h-0 print:block">
        
        {/* Printable/Saveable Academic Document */}
        <div className="flex-1 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 md:p-12 shadow-sm space-y-8 select-text overflow-y-auto print:border-none print:shadow-none print:p-0 print:bg-white print:text-black">
          {/* Scientific Title Block */}
          <div className="space-y-4 text-center border-b pb-6 border-neutral-150 dark:border-neutral-850 print:border-neutral-300">
            <div className="text-[10px] tracking-[0.2em] font-mono text-neutral-400 uppercase print:text-neutral-500">
              STATS LAB NARRATIVE REPORT
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100 print:text-neutral-900 print:text-3xl">
              {report.title}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-neutral-500 dark:text-neutral-400 font-medium print:text-neutral-600">
              <span>Dataset: <span className="font-semibold text-neutral-700 dark:text-neutral-300 print:text-neutral-800">{dataset.name}</span></span>
              <span>•</span>
              <span>Shape: <span className="font-semibold text-neutral-700 dark:text-neutral-300 print:text-neutral-800">{dataset.rows.length} rows × {dataset.headers.length} columns</span></span>
              <span>•</span>
              <span>α = {alpha}</span>
              <span>•</span>
              <span>Generated: {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Executive Summary Block */}
          <div className="space-y-3">
            <h2 className="font-serif text-lg font-bold tracking-tight text-neutral-800 dark:text-neutral-200 border-l-2 border-orange-500 pl-3">
              Executive Summary
            </h2>
            <p className="text-sm leading-relaxed text-neutral-650 dark:text-neutral-350 print:text-neutral-850 print:text-sm font-sans">
              {report.executiveSummary}
            </p>
          </div>

          {/* Sections Interleaved with Charts */}
          <div className="space-y-8">
            {report.sections.map((sec, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="font-serif text-base font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
                  {sec.title}
                </h3>
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-sm leading-relaxed text-neutral-650 dark:text-neutral-350 print:text-neutral-850 font-sans">
                    {p}
                  </p>
                ))}

                {/* Inline interactive chart embed */}
                {sec.chart && (
                  <div className="my-5 border border-neutral-150 dark:border-neutral-850 rounded-xl p-4 bg-neutral-50/50 dark:bg-neutral-950/20 shadow-sm print:break-inside-avoid print:bg-white print:border-neutral-300">
                    <InlineChartWidget chart={sec.chart} dataset={dataset} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recommendations Block */}
          <div className="space-y-4 border-t pt-6 border-neutral-150 dark:border-neutral-850 print:border-neutral-300">
            <h3 className="font-serif text-base font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
              Key Insights & Recommendations
            </h3>
            <ul className="space-y-2.5">
              {report.recommendations.map((rec, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-neutral-650 dark:text-neutral-350 print:text-neutral-850">
                  <span className="text-orange-500 font-bold shrink-0 mt-0.5">•</span>
                  <span className="font-sans leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Floating Settings & Actions Sidebar (Hidden in Print) */}
        <div className="w-full lg:w-72 flex flex-col gap-4 print:hidden">
          {/* Metadata Card */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 space-y-3 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Report Status</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                <span>Focus:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">{focus}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                <span>Tone:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">{tone}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                <span>Significance Level:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">α = {alpha}</span>
              </div>
            </div>
          </div>

          {/* Action List */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-2.5 space-y-1 shadow-sm">
            <button
              onClick={exportMarkdown}
              className="w-full flex items-center gap-2.5 rounded-lg text-left px-3 py-2 text-xs text-neutral-700 dark:text-neutral-350 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors font-semibold"
            >
              <Download className="w-4 h-4 text-neutral-400" />
              Download Markdown (.md)
            </button>

            <button
              onClick={triggerPrint}
              className="w-full flex items-center gap-2.5 rounded-lg text-left px-3 py-2 text-xs text-neutral-700 dark:text-neutral-350 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors font-semibold"
            >
              <Printer className="w-4 h-4 text-neutral-400" />
              Print / Save PDF
            </button>

            <div className="my-1 border-t border-neutral-150 dark:border-neutral-800" />

            <button
              onClick={() => { setReport(null); setError(null); }}
              className="w-full flex items-center gap-2.5 rounded-lg text-left px-3 py-2 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-500/5 transition-colors font-semibold"
            >
              <Settings className="w-4 h-4 text-orange-500/80" />
              Reconfigure Report
            </button>
          </div>
        </div>

      </div>
    );
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   INLINE INTERACTIVE CHART WIDGETS
   ───────────────────────────────────────────────────────────────────────────── */

function InlineChartWidget({ chart, dataset }: { chart: ChartSuggestion; dataset: any }) {
  const { type, xCol, yCol } = chart;

  // Retrieve columns
  const c1 = dataset.columns.find((c: any) => c.name === xCol);
  const c2 = dataset.columns.find((c: any) => c.name === yCol);

  if (!c1 || (type !== "distribution" && !c2)) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-xs text-neutral-400 dark:text-neutral-500 select-none">
        <AlertCircle className="w-4 h-4 mb-1.5 text-neutral-300 dark:text-neutral-700" />
        <span>Could not render requested chart ({xCol} {yCol ? `vs ${yCol}` : ""})</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 font-sans select-none">
      <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
        <span className="capitalize">{type} chart: {xCol} {yCol ? `vs ${yCol}` : ""}</span>
        <button
          onClick={() => {
            const toolId = type === "scatter" ? "linear-regression" : type === "bar" ? "bar-chart" : type === "box" ? "box-plot" : "normal-distribution";
            window.location.href = `/app?tool=${toolId}`;
          }}
          className="text-[10px] text-orange-500 hover:underline font-bold print:hidden"
        >
          Open Tool →
        </button>
      </div>

      {type === "scatter" && <InlineScatterChart c1={c1} c2={c2} dataset={dataset} />}
      {type === "bar" && <InlineBarChart c1={c1} c2={c2} dataset={dataset} />}
      {type === "box" && <InlineBoxChart c1={c1} c2={c2} dataset={dataset} />}
      {type === "distribution" && <InlineDistributionChart c1={c1} />}
    </div>
  );
}

/* ── 1. Inline Scatter Plot with Regression ───────────────────────────────── */
function InlineScatterChart({ c1, c2, dataset }: { c1: any; c2: any; dataset: any }) {
  const commonIndices = c1.numericIndex.filter((idx: number) => c2.numericIndex.includes(idx));
  if (commonIndices.length < 3) return null;

  const rawX = commonIndices.map((idx: number) => c1.values[idx] as number);
  const rawY = commonIndices.map((idx: number) => c2.values[idx] as number);

  const minX = Math.min(...rawX);
  const maxX = Math.max(...rawX);
  const minY = Math.min(...rawY);
  const maxY = Math.max(...rawY);

  const padX = (maxX - minX) * 0.1 || 1;
  const padY = (maxY - minY) * 0.1 || 1;

  const domainX = [minX - padX, maxX + padX];
  const domainY = [minY - padY, maxY + padY];

  const W = 450;
  const H = 220;
  const pL = 40;
  const pR = 20;
  const pT = 15;
  const pB = 30;

  const scaleX = (x: number) => pL + ((x - domainX[0]) / (domainX[1] - domainX[0])) * (W - pL - pR);
  const scaleY = (y: number) => H - pB - ((y - domainY[0]) / (domainY[1] - domainY[0])) * (H - pT - pB);

  // Compute trendline using OLS
  const n = rawX.length;
  const meanX = mean(rawX);
  const meanY = mean(rawY);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (rawX[i] - meanX) * (rawY[i] - meanY);
    den += (rawX[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const lineStartValY = slope * domainX[0] + intercept;
  const lineEndValY = slope * domainX[1] + intercept;

  const [tooltip, setTooltip] = useState<{ x: number; y: number; valX: number; valY: number } | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
        {/* Grids */}
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
        <line x1={pL} y1={pT} x2={pL} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />

        {/* Trendline */}
        <line
          x1={scaleX(domainX[0])}
          y1={scaleY(lineStartValY)}
          x2={scaleX(domainX[1])}
          y2={scaleY(lineEndValY)}
          className="stroke-orange-500 dark:stroke-orange-400"
          strokeWidth={2}
          strokeDasharray="4"
        />

        {/* Data points */}
        {rawX.map((x: number, idx: number) => {
          const cx = scaleX(x);
          const cy = scaleY(rawY[idx]);
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={3.5}
              className="fill-neutral-400 hover:fill-orange-500 dark:fill-neutral-600 dark:hover:fill-orange-400 transition-colors cursor-pointer"
              onMouseEnter={() => setTooltip({ x: cx, y: cy, valX: x, valY: rawY[idx] })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Axis Titles */}
        <text x={W / 2} y={H - 5} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold text-center" textAnchor="middle">
          {c1.name}
        </text>
        <text x={12} y={H / 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
          {c2.name}
        </text>
      </svg>

      {/* Tooltip Overlay */}
      {tooltip && (
        <div
          style={{ left: tooltip.x, top: tooltip.y - 45 }}
          className="absolute -translate-x-1/2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-2 py-1 text-[9px] font-mono leading-normal shadow-md pointer-events-none z-10 space-y-0.5"
        >
          <div>{c1.name}: {tooltip.valX.toFixed(2)}</div>
          <div>{c2.name}: {tooltip.valY.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}

/* ── 2. Inline Bar Chart (Means with SEM errors) ─────────────────────────── */
function InlineBarChart({ c1, c2, dataset }: { c1: any; c2: any; dataset: any }) {
  // Let's assume c1 is numeric (grouped by c2, which is categorical) or vice versa.
  // Standard bar chart expects: Categorical X (c2 or c1), Numeric Y.
  const numCol = c1.type === "numeric" ? c1 : c2;
  const catCol = c1.type === "categorical" ? c1 : c2;

  // Group
  const groupsMap = new Map<string, number[]>();
  for (let r = 0; r < dataset.rows.length; r++) {
    const catVal = String(dataset.rows[r][catCol.index] ?? "").trim();
    const numVal = dataset.rows[r][numCol.index];
    if (catVal !== "" && numVal !== null && typeof numVal === "number" && !isNaN(numVal)) {
      if (!groupsMap.has(catVal)) groupsMap.set(catVal, []);
      groupsMap.get(catVal)!.push(numVal);
    }
  }

  const groupStats = Array.from(groupsMap.entries())
    .map(([cat, vals]) => {
      const m = mean(vals) || 0;
      const s = sd(vals) || 0;
      const sem = vals.length > 1 ? s / Math.sqrt(vals.length) : 0;
      return { cat, mean: m, sem, count: vals.length };
    })
    .filter((g) => g.count >= 2)
    .slice(0, 6); // Limit categories for clean chart

  if (groupStats.length === 0) return null;

  const maxVal = Math.max(...groupStats.map((g) => g.mean + g.sem * 1.5)) * 1.1 || 1;
  const minVal = Math.min(0, ...groupStats.map((g) => g.mean - g.sem * 1.5)) * 1.1;

  const W = 450;
  const H = 220;
  const pL = 40;
  const pR = 20;
  const pT = 15;
  const pB = 30;

  const scaleY = (y: number) => H - pB - ((y - minVal) / (maxVal - minVal)) * (H - pT - pB);
  const bandW = (W - pL - pR) / groupStats.length;

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
        {/* Baseline (Y=0) */}
        <line x1={pL} y1={scaleY(0)} x2={W - pR} y2={scaleY(0)} className="stroke-neutral-350 dark:stroke-neutral-700" strokeWidth={1} />
        <line x1={pL} y1={pT} x2={pL} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />

        {/* Bars */}
        {groupStats.map((g, idx) => {
          const x = pL + idx * bandW + bandW * 0.15;
          const barWidth = bandW * 0.7;
          const yZero = scaleY(0);
          const yMean = scaleY(g.mean);
          const barY = Math.min(yZero, yMean);
          const barHeight = Math.abs(yZero - yMean);

          // Error bar coordinates
          const errTop = scaleY(g.mean + g.sem);
          const errBottom = scaleY(g.mean - g.sem);
          const errX = x + barWidth / 2;

          return (
            <g key={idx}>
              {/* Bar Rect */}
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={barHeight || 1}
                rx={3}
                className={`${hoverIndex === idx ? "fill-orange-500 dark:fill-orange-400" : "fill-neutral-200 dark:fill-neutral-800"} transition-all cursor-pointer`}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />

              {/* Error Bars */}
              <line x1={errX} y1={errTop} x2={errX} y2={errBottom} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />
              <line x1={errX - 4} y1={errTop} x2={errX + 4} y2={errTop} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />
              <line x1={errX - 4} y1={errBottom} x2={errX + 4} y2={errBottom} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />

              {/* X Category Label */}
              <text x={errX} y={H - 12} className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-medium" textAnchor="middle">
                {g.cat.length > 8 ? `${g.cat.slice(0, 6)}..` : g.cat}
              </text>
            </g>
          );
        })}

        {/* Axis Labels */}
        <text x={W / 2} y={H - 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" textAnchor="middle">
          {catCol.name}
        </text>
        <text x={12} y={H / 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
          Mean of {numCol.name}
        </text>
      </svg>

      {/* Tooltip */}
      {hoverIndex !== null && groupStats[hoverIndex] && (
        <div
          style={{ left: pL + hoverIndex * bandW + bandW * 0.5, top: scaleY(groupStats[hoverIndex].mean) - 40 }}
          className="absolute -translate-x-1/2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-2.5 py-1 text-[9px] font-mono leading-normal shadow-md pointer-events-none z-10 text-center"
        >
          <div>Group: {groupStats[hoverIndex].cat}</div>
          <div>Mean: {groupStats[hoverIndex].mean.toFixed(2)} ± {groupStats[hoverIndex].sem.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}

/* ── 3. Inline Box Plot ──────────────────────────────────────────────────── */
function InlineBoxChart({ c1, c2, dataset }: { c1: any; c2: any; dataset: any }) {
  const numCol = c1.type === "numeric" ? c1 : c2;
  const catCol = c1.type === "categorical" ? c1 : c2;

  // Group
  const groupsMap = new Map<string, number[]>();
  for (let r = 0; r < dataset.rows.length; r++) {
    const catVal = String(dataset.rows[r][catCol.index] ?? "").trim();
    const numVal = dataset.rows[r][numCol.index];
    if (catVal !== "" && numVal !== null && typeof numVal === "number" && !isNaN(numVal)) {
      if (!groupsMap.has(catVal)) groupsMap.set(catVal, []);
      groupsMap.get(catVal)!.push(numVal);
    }
  }

  const groupStats = Array.from(groupsMap.entries())
    .map(([cat, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const med = median(sorted);
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      return { cat, min, q1, med, q3, max, count: vals.length };
    })
    .filter((g) => g.count >= 4)
    .slice(0, 4); // Keep categories small

  if (groupStats.length === 0) return null;

  const globalMin = Math.min(...groupStats.map((g) => g.min));
  const globalMax = Math.max(...groupStats.map((g) => g.max));
  const pad = (globalMax - globalMin) * 0.1 || 1;
  const minVal = globalMin - pad;
  const maxVal = globalMax + pad;

  const W = 450;
  const H = 220;
  const pL = 40;
  const pR = 20;
  const pT = 15;
  const pB = 30;

  const scaleY = (y: number) => H - pB - ((y - minVal) / (maxVal - minVal)) * (H - pT - pB);
  const bandW = (W - pL - pR) / groupStats.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
      <line x1={pL} y1={pT} x2={pL} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />

      {groupStats.map((g, idx) => {
        const x = pL + idx * bandW;
        const cX = x + bandW / 2;
        const boxWidth = bandW * 0.5;
        const boxX = cX - boxWidth / 2;

        const yMin = scaleY(g.min);
        const yMax = scaleY(g.max);
        const yQ1 = scaleY(g.q1);
        const yMed = scaleY(g.med);
        const yQ3 = scaleY(g.q3);

        return (
          <g key={idx} className="group cursor-pointer">
            {/* Whiskers */}
            <line x1={cX} y1={yMin} x2={cX} y2={yQ1} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />
            <line x1={cX} y1={yMax} x2={cX} y2={yQ3} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />
            <line x1={cX - 8} y1={yMin} x2={cX + 8} y2={yMin} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />
            <line x1={cX - 8} y1={yMax} x2={cX + 8} y2={yMax} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.2} />

            {/* Box Rect */}
            <rect
              x={boxX}
              y={yQ3}
              width={boxWidth}
              height={Math.max(1, yQ1 - yQ3)}
              className="fill-neutral-100 group-hover:fill-orange-50 dark:fill-neutral-900 dark:group-hover:fill-orange-950/20 stroke-neutral-400 dark:stroke-neutral-500 transition-colors"
              strokeWidth={1.2}
            />

            {/* Median Line */}
            <line x1={boxX} y1={yMed} x2={boxX + boxWidth} y2={yMed} className="stroke-orange-500 dark:stroke-orange-400" strokeWidth={2} />

            {/* Labels */}
            <text x={cX} y={H - 12} className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-medium" textAnchor="middle">
              {g.cat.length > 8 ? `${g.cat.slice(0, 6)}..` : g.cat}
            </text>
          </g>
        );
      })}

      <text x={W / 2} y={H - 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" textAnchor="middle">
        {catCol.name}
      </text>
      <text x={12} y={H / 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
        {numCol.name}
      </text>
    </svg>
  );
}

/* ── 4. Inline Distribution Plot (Histogram with Normal Curve Overlay) ── */
function InlineDistributionChart({ c1 }: { c1: any }) {
  const vals = c1.numeric;
  if (vals.length < 5) return null;

  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  // Compute 10-bin histogram
  const numBins = 10;
  const binW = range / numBins;
  const bins = new Array(numBins).fill(0);
  for (const v of vals) {
    const binIdx = Math.min(numBins - 1, Math.floor((v - minVal) / binW));
    if (binIdx >= 0) bins[binIdx]++;
  }

  const maxBin = Math.max(...bins) || 1;

  const W = 450;
  const H = 220;
  const pL = 40;
  const pR = 20;
  const pT = 15;
  const pB = 30;

  const scaleX = (val: number) => pL + ((val - minVal) / range) * (W - pL - pR);
  const scaleY = (count: number) => H - pB - (count / maxBin) * (H - pT - pB);

  // Normal Curve Overlay points
  const mVal = mean(vals) || 0;
  const sVal = sd(vals) || 1;
  const numCurvePts = 80;
  const curvePts: [number, number][] = [];
  for (let i = 0; i <= numCurvePts; i++) {
    const xVal = minVal + (i / numCurvePts) * range;
    const pdfY = normalPDF(xVal, mVal, sVal);
    // Scale curve height to fit relative bin max
    const maxPDF = normalPDF(mVal, mVal, sVal) || 1;
    const scaledPDFCount = (pdfY / maxPDF) * maxBin;
    curvePts.push([scaleX(xVal), scaleY(scaledPDFCount)]);
  }

  const curvePath = curvePts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
      <line x1={pL} y1={pT} x2={pL} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />

      {/* Hist Rects */}
      {bins.map((count, idx) => {
        const binMin = minVal + idx * binW;
        const x = scaleX(binMin);
        const nextX = scaleX(binMin + binW);
        const rectW = Math.max(1, nextX - x - 1);
        const yLimit = scaleY(0);
        const rectY = scaleY(count);
        const rectH = Math.max(1, yLimit - rectY);

        return (
          <rect
            key={idx}
            x={x}
            y={rectY}
            width={rectW}
            height={rectH}
            className="fill-neutral-200 dark:fill-neutral-800 hover:fill-neutral-300 dark:hover:fill-neutral-700 transition-colors"
          />
        );
      })}

      {/* Bell Curve Line */}
      <path
        d={curvePath}
        fill="none"
        className="stroke-orange-500 dark:stroke-orange-400"
        strokeWidth={1.8}
      />

      <text x={W / 2} y={H - 5} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" textAnchor="middle">
        {c1.name} (Fitted Mean: {mVal.toFixed(2)}, SD: {sVal.toFixed(2)})
      </text>
      <text x={12} y={H / 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
        Frequency
      </text>
    </svg>
  );
}
