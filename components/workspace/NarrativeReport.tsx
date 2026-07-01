"use client";

import { useState, useMemo, useEffect } from "react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  FileText, Sparkles, Download, Printer, Settings, RefreshCw, BarChart2,
  AlertCircle, ChevronRight, CheckCircle2, TrendingUp, Info
} from "lucide-react";
import {
  mean, sd, variance, median, skewness, kurtosis, detectDistribution,
  pearsonR, spearmanRho, tCDF, tCrit, oneWayANOVA, welchTest, normalPDF,
  benjaminiHochberg, pearsonCI, mannWhitneyU, kruskalWallis, driverAnalysis,
} from "@/components/tools/shared/stats";
import type { DriverResult } from "@/components/tools/shared/stats";

// Helper to compute p-value of correlation
function correlationPValue(r: number, n: number): number {
  if (n <= 2 || Math.abs(r) >= 1) return 1;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - tCDF(Math.abs(t), n - 2));
  return isNaN(p) ? 1 : Math.max(0, Math.min(1, p));
}

// Chart suggestion the LLM may attach to a section (validated against column names)
type ChartSuggestion = {
  type: "scatter" | "bar" | "box" | "distribution";
  xCol: string;
  yCol: string;
};

/* System-attached figures. These are built on the CLIENT after the report
   returns and never round-trip through the API, so they can carry rich data
   (coefficients, matrices, rates) at zero token cost. Each notable signal gets
   the correct chart, guaranteeing the figure is present even with no tool. */
type Figure =
  | { kind: "scatter"; xCol: string; yCol: string; caption: string; tool?: string }
  | { kind: "distribution"; col: string; caption: string; tool?: string }
  | { kind: "box"; numCol: string; catCol: string; caption: string; tool?: string }
  | { kind: "ci"; numCol: string; catCol: string; caption: string; tool?: string }
  | { kind: "heatmap"; cols: string[]; matrix: number[][]; caption: string }
  | { kind: "coefficient"; target: string; r2: number; drivers: { name: string; beta: number; pValue: number }[]; caption: string }
  | { kind: "missingness"; items: { name: string; rate: number }[]; caption: string };

// A single scannable headline finding
type KeyFinding = {
  finding: string;
  detail: string;
  significance: "significant" | "not-significant" | "descriptive";
};

// Report JSON type returned by Gemini API
type ReportData = {
  title: string;
  executiveSummary: string;
  dataOverview?: string;
  keyFindings?: KeyFinding[];
  sections: Array<{
    title: string;
    paragraphs: string[];
    chart?: ChartSuggestion;
  }>;
  recommendations: string[];
  limitations?: string[];
};

// Renders **bold** spans inside otherwise plain narrative text so key figures scan.
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-neutral-900 dark:text-neutral-100 print:text-black">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// Visual treatment for each finding's verdict.
const SIGNIFICANCE_STYLES: Record<KeyFinding["significance"], { label: string; dot: string; text: string }> = {
  significant: { label: "Significant", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  "not-significant": { label: "No effect detected", dot: "bg-neutral-400", text: "text-neutral-500 dark:text-neutral-400" },
  descriptive: { label: "Descriptive", dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
};

// Compact quality stat used in the Data Overview header.
function QualityChip({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "accent" | "neutral" }) {
  const styles = {
    good: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    warn: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    accent: "border-orange-500/20 bg-orange-500/5 text-orange-700 dark:text-orange-400",
    neutral: "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 text-neutral-700 dark:text-neutral-300",
  }[tone];
  return (
    <div className={`inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 print:border-neutral-300 ${styles}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default function NarrativeReport() {
  const { dataset } = useWorkspace();

  // Settings
  const [alpha, setAlpha] = useState(0.05);
  const [focus, setFocus] = useState("general");
  const [tone, setTone] = useState("academic");
  const [target, setTarget] = useState<string>(""); // "" = exploratory (no target)

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

  // Client-side analysis engine: the system does the intense, deterministic
  // work (tests, effect sizes, FDR correction, CIs, driver regression, quality)
  // and hands the LLM only a ranked ledger of verified, notable patterns.
  const statisticsContext = useMemo(() => {
    if (!dataset) return null;

    const rowCount = dataset.rows.length;
    const numericCols = dataset.columns.filter((c) => c.type === "numeric");
    const categoricalCols = dataset.columns.filter((c) => c.type === "categorical");

    const f = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(4)).toString() : "n/a");
    const fp = (p: number) => (!Number.isFinite(p) ? "n/a" : p < 1e-4 ? "<0.0001" : p.toFixed(4));
    const conf = 1 - alpha;
    const ciPct = Math.round(conf * 100);

    // Blank / missing sentinels (mirrors DataDropZone/analyse.ts conventions)
    const MISSING = new Set(["", ".", "..", "--", "-", "na", "n/a", "null", "nan", "none", "nil", "missing"]);
    const isBlank = (v: unknown) =>
      v === null || v === undefined || (typeof v === "string" && MISSING.has(v.trim().toLowerCase()));

    // ── 1. Column summaries ────────────────────────────────────────────────
    const columnsSummary = numericCols.map((c) => {
      const vals = c.numeric;
      const sorted = [...vals].sort((a, b) => a - b);
      let outlierCount = 0;
      if (sorted.length >= 4) {
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqrv = q3 - q1;
        const lf = q1 - 1.5 * iqrv, uf = q3 + 1.5 * iqrv;
        outlierCount = vals.filter((v) => v < lf || v > uf).length;
      }
      return {
        name: c.name, n: vals.length,
        mean: mean(vals) || 0, median: median(vals) || 0, sd: sd(vals) || 0,
        skewness: skewness(vals) || 0, kurtosis: kurtosis(vals) || 0,
        outlierCount, distributionName: detectDistribution(vals)?.name || "unknown",
      };
    });
    const skewByName = new Map(columnsSummary.map((c) => [c.name, c.skewness]));

    const categoricalSummary = categoricalCols.map((c) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const v of c.values) {
        if (isBlank(v)) continue;
        const k = String(v).trim();
        counts.set(k, (counts.get(k) || 0) + 1);
        total++;
      }
      let topCount = 0, topName = "";
      for (const [k, n] of counts) if (n > topCount) { topCount = n; topName = k; }
      return { name: c.name, cardinality: counts.size, total, topName, topShare: total ? topCount / total : 0 };
    });

    // ── 2. Data quality (recomputed here so the report is self-contained) ──
    const perColMissing = dataset.columns.map((c) => {
      let miss = 0;
      for (const v of c.values) if (isBlank(v)) miss++;
      return { name: c.name, rate: rowCount ? miss / rowCount : 0 };
    });
    const totalCells = rowCount * Math.max(1, dataset.columns.length);
    const missingCells = perColMissing.reduce((s, p) => s + p.rate * rowCount, 0);
    const completeness = totalCells ? (1 - missingCells / totalCells) * 100 : 100;

    const seenRows = new Set<string>();
    let duplicateRows = 0;
    for (const r of dataset.rows) {
      const key = JSON.stringify(r);
      if (seenRows.has(key)) duplicateRows++;
      else seenRows.add(key);
    }
    const constantCols = dataset.columns
      .filter((c) => (c.type === "numeric"
        ? c.numeric.length > 1 && sd(c.numeric) === 0
        : new Set(c.values.filter((v) => !isBlank(v)).map((v) => String(v).trim())).size === 1))
      .map((c) => c.name);
    const idLikeCols = categoricalCols
      .filter((c) => {
        const nb = c.values.filter((v) => !isBlank(v));
        const uniq = new Set(nb.map((v) => String(v).trim())).size;
        return nb.length >= 10 && uniq / nb.length > 0.9;
      })
      .map((c) => c.name);

    // ── 3. Correlations + Fisher-z CIs + Spearman fallback + BH q-values ──
    type Corr = {
      col1: string; col2: string; r: number; r2: number; n: number;
      pValue: number; qValue: number; ci: { lower: number; upper: number }; spearman?: number;
    };
    const correlations: Corr[] = [];
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const c1 = numericCols[i], c2 = numericCols[j];
        const c2Index = new Set<number>(c2.numericIndex);
        const commonIndices = c1.numericIndex.filter((idx) => c2Index.has(idx));
        if (commonIndices.length < 5) continue;
        const xs = commonIndices.map((idx) => c1.values[idx] as number);
        const ys = commonIndices.map((idx) => c2.values[idx] as number);
        const r = pearsonR(xs, ys);
        const n = commonIndices.length;
        const skewed = Math.abs(skewByName.get(c1.name) ?? 0) >= 1 || Math.abs(skewByName.get(c2.name) ?? 0) >= 1;
        correlations.push({
          col1: c1.name, col2: c2.name, r, r2: r * r, n,
          pValue: correlationPValue(r, n), qValue: 1, ci: pearsonCI(r, n, conf),
          spearman: skewed ? spearmanRho(xs, ys) : undefined,
        });
      }
    }
    const corrQ = benjaminiHochberg(correlations.map((c) => c.pValue));
    correlations.forEach((c, i) => { c.qValue = corrQ[i]; });

    // ── 4. Group comparisons: assumption-aware test choice + effect + CI ──
    type GroupSummary = { name: string; mean: number; n: number };
    const dMagnitude = (d: number) => {
      const a = Math.abs(d);
      return a < 0.2 ? "negligible" : a < 0.5 ? "small" : a < 0.8 ? "medium" : "large";
    };
    const etaMagnitude = (e: number) => (e < 0.01 ? "negligible" : e < 0.06 ? "small" : e < 0.14 ? "medium" : "large");
    type GroupCmp = {
      numericCol: string; categoricalCol: string;
      primaryTest: string; primaryP: number; qValue: number;
      paramTest: string; paramP: number; nonparam: boolean;
      effectName: string; effectValue: number; magnitude: string;
      diffCI?: { diff: number; lower: number; upper: number };
      groups: GroupSummary[];
    };
    const groupComparisons: GroupCmp[] = [];

    for (const numCol of numericCols) {
      const skewed = Math.abs(skewByName.get(numCol.name) ?? 0) >= 1;
      for (const catCol of categoricalCols) {
        const groupsMap = new Map<string, number[]>();
        for (let r = 0; r < rowCount; r++) {
          const catVal = String(dataset.rows[r][catCol.index] ?? "").trim();
          const numVal = dataset.rows[r][numCol.index];
          if (catVal !== "" && typeof numVal === "number" && !isNaN(numVal)) {
            if (!groupsMap.has(catVal)) groupsMap.set(catVal, []);
            groupsMap.get(catVal)!.push(numVal);
          }
        }
        const named = Array.from(groupsMap.entries()).filter(([, g]) => g.length >= 3).map(([name, vals]) => ({ name, vals }));
        const validGroups = named.map((g) => g.vals);
        const groupSummaries: GroupSummary[] = named
          .map((g) => ({ name: g.name, mean: mean(g.vals) || 0, n: g.vals.length }))
          .sort((a, b) => b.n - a.n).slice(0, 6);

        if (validGroups.length === 2) {
          const [g1, g2] = validGroups;
          const res = welchTest(g1, g2, alpha, "two");
          const s1 = sd(g1) || 0, s2 = sd(g2) || 0;
          const pooled = Math.sqrt(((g1.length - 1) * s1 * s1 + (g2.length - 1) * s2 * s2) / Math.max(1, g1.length + g2.length - 2));
          const d = pooled > 0 ? ((mean(g1) || 0) - (mean(g2) || 0)) / pooled : 0;
          // CI for the difference in means (Welch)
          const se = Math.sqrt(variance(g1) / g1.length + variance(g2) / g2.length);
          const diff = (mean(g1) || 0) - (mean(g2) || 0);
          const tc = tCrit(alpha, res.df ?? Math.max(1, g1.length + g2.length - 2));
          const mw = skewed ? mannWhitneyU(g1, g2) : null;
          groupComparisons.push({
            numericCol: numCol.name, categoricalCol: catCol.name,
            primaryTest: mw ? "Mann–Whitney U" : "Welch's t-test", primaryP: mw ? mw.pValue : res.pValue, qValue: 1,
            paramTest: "Welch's t-test", paramP: res.pValue, nonparam: !!mw,
            effectName: "Cohen's d", effectValue: Math.abs(d), magnitude: dMagnitude(d),
            diffCI: { diff, lower: diff - tc * se, upper: diff + tc * se },
            groups: groupSummaries,
          });
        } else if (validGroups.length > 2 && validGroups.length <= 8) {
          const res = oneWayANOVA(validGroups, alpha);
          const dfB = validGroups.length - 1;
          const dfW = validGroups.reduce((acc, g) => acc + g.length, 0) - validGroups.length;
          const F = res.testStat;
          const etaSq = Number.isFinite(F) && F > 0 ? (dfB * F) / (dfB * F + dfW) : 0;
          const kw = skewed ? kruskalWallis(validGroups) : null;
          groupComparisons.push({
            numericCol: numCol.name, categoricalCol: catCol.name,
            primaryTest: kw ? "Kruskal–Wallis" : "One-way ANOVA", primaryP: kw ? kw.pValue : res.pValue, qValue: 1,
            paramTest: "One-way ANOVA", paramP: res.pValue, nonparam: !!kw,
            effectName: "η²", effectValue: etaSq, magnitude: etaMagnitude(etaSq),
            groups: groupSummaries,
          });
        }
      }
    }
    const grpQ = benjaminiHochberg(groupComparisons.map((g) => g.primaryP));
    groupComparisons.forEach((g, i) => { g.qValue = grpQ[i]; });

    // ── 5. Key-driver analysis (only when a numeric target is chosen) ──────
    const targetCol = target ? numericCols.find((c) => c.name === target) : undefined;
    let driverResult: DriverResult | null = null;
    if (targetCol) {
      const targetIndex = new Set<number>(targetCol.numericIndex);
      const ranked = numericCols
        .filter((c) => c.name !== target)
        .map((c) => {
          const idxSet = new Set<number>(c.numericIndex);
          const common = targetCol.numericIndex.filter((idx) => idxSet.has(idx));
          const rAbs = common.length >= 5
            ? Math.abs(pearsonR(common.map((i) => c.values[i] as number), common.map((i) => targetCol.values[i] as number)))
            : 0;
          return { col: c, rAbs };
        })
        .filter((s) => s.rAbs > 0)
        .sort((a, b) => b.rAbs - a.rAbs)
        .slice(0, 8)
        .map((s) => s.col);
      if (ranked.length >= 1) {
        const sets = ranked.map((c) => new Set<number>(c.numericIndex));
        const common = Array.from(targetIndex).filter((idx) => sets.every((s) => s.has(idx)));
        if (common.length >= ranked.length + 2) {
          const Y = common.map((idx) => targetCol.values[idx] as number);
          const X = common.map((idx) => ranked.map((c) => c.values[idx] as number));
          driverResult = driverAnalysis(Y, X, ranked.map((c) => c.name));
        }
      }
    }

    // ── 6. Signal ledger (ranked, verified, FDR-gated) ────────────────────
    type SignalKind =
      | "driver" | "redundancy" | "relationship" | "difference"
      | "missingness" | "duplicates" | "constant" | "idlike"
      | "skew" | "outliers" | "imbalance";
    type Signal = { kind: SignalKind; importance: number; cols: string[]; note: string; detail: string };
    const signals: Signal[] = [];

    if (driverResult && driverResult.drivers.length) {
      const top = driverResult.drivers.slice(0, 4)
        .map((d) => `${d.name} (β=${f(d.beta)}${d.pValue < alpha ? "*" : ""})`).join(", ");
      signals.push({
        kind: "driver", importance: 1, cols: [target],
        note: `key drivers of ${target}`,
        detail: `${driverResult.drivers.length} predictors jointly explain R²=${driverResult.r2.toFixed(3)} (adj ${driverResult.adjR2.toFixed(3)}) of ${target}, n=${driverResult.n}; strongest: ${top} (* = significant at α=${alpha}). Association, not proof of cause.`,
      });
    }

    for (const cr of correlations) {
      const a = Math.abs(cr.r);
      const sp = cr.spearman !== undefined ? `; Spearman ρ=${f(cr.spearman)}` : "";
      if (a >= 0.95) {
        signals.push({
          kind: "redundancy", importance: 0.98, cols: [cr.col1, cr.col2],
          note: "near-perfect correlation — likely duplicate or derived columns",
          detail: `r=${f(cr.r)}, R²=${cr.r2.toFixed(3)}, n=${cr.n}, q=${fp(cr.qValue)}`,
        });
      } else if (a >= 0.3 && cr.qValue < alpha) {
        const dir = cr.r > 0 ? "positive" : "negative";
        const strength = a < 0.5 ? "moderate" : a < 0.7 ? "strong" : "very strong";
        signals.push({
          kind: "relationship", importance: Math.min(0.95, a), cols: [cr.col1, cr.col2],
          note: `${strength} ${dir} correlation`,
          detail: `r=${f(cr.r)}, R²=${cr.r2.toFixed(3)} (${Math.round(cr.r2 * 100)}% of variance), ${ciPct}% CI ${f(cr.ci.lower)}–${f(cr.ci.upper)}, n=${cr.n}, p=${fp(cr.pValue)}, q=${fp(cr.qValue)}${sp}`,
        });
      }
    }

    for (const gc of groupComparisons) {
      if (gc.qValue < alpha && gc.magnitude !== "negligible") {
        const byMean = [...gc.groups].sort((a, b) => b.mean - a.mean);
        const hi = byMean[0], lo = byMean[byMean.length - 1];
        const dir = hi && lo && hi.name !== lo.name ? `; highest: ${hi.name} (${f(hi.mean)}), lowest: ${lo.name} (${f(lo.mean)})` : "";
        const ci = gc.diffCI ? `, Δ=${f(gc.diffCI.diff)} (${ciPct}% CI ${f(gc.diffCI.lower)}–${f(gc.diffCI.upper)})` : "";
        const secondary = gc.nonparam ? `; parametric ${gc.paramTest} p=${fp(gc.paramP)}` : "";
        const imp = gc.effectName === "Cohen's d" ? Math.min(0.92, gc.effectValue / 1.2) : Math.min(0.92, gc.effectValue / 0.25);
        signals.push({
          kind: "difference", importance: imp, cols: [gc.numericCol, gc.categoricalCol],
          note: `${gc.magnitude} difference in ${gc.numericCol} across ${gc.categoricalCol}`,
          detail: `${gc.primaryTest}, ${gc.effectName}=${f(gc.effectValue)} (${gc.magnitude})${ci}, p=${fp(gc.primaryP)}, q=${fp(gc.qValue)}${secondary}${dir}`,
        });
      }
    }

    // Data-quality signals
    const badMissing = perColMissing.filter((p) => p.rate > 0.05).sort((a, b) => b.rate - a.rate);
    if (badMissing.length) {
      signals.push({
        kind: "missingness", importance: 0.68, cols: badMissing.slice(0, 4).map((p) => p.name),
        note: "notable missing data",
        detail: badMissing.slice(0, 4).map((p) => `${p.name} ${Math.round(p.rate * 100)}%`).join(", ") + (badMissing.length > 4 ? ` +${badMissing.length - 4} more` : ""),
      });
    }
    if (duplicateRows > 0) {
      signals.push({
        kind: "duplicates", importance: 0.6, cols: [],
        note: "duplicate rows", detail: `${duplicateRows} exact duplicate row${duplicateRows > 1 ? "s" : ""} (${Math.round((duplicateRows / Math.max(1, rowCount)) * 100)}% of data)`,
      });
    }
    if (constantCols.length) {
      signals.push({
        kind: "constant", importance: 0.45, cols: constantCols.slice(0, 5),
        note: "constant columns (zero variance, no information)", detail: constantCols.join(", "),
      });
    }
    if (idLikeCols.length) {
      signals.push({
        kind: "idlike", importance: 0.4, cols: idLikeCols.slice(0, 5),
        note: "identifier-like columns (≈unique per row)", detail: idLikeCols.join(", "),
      });
    }

    // Distribution & imbalance flags
    for (const c of columnsSummary) {
      if (Math.abs(c.skewness) >= 1) {
        signals.push({
          kind: "skew", importance: Math.min(0.58, Math.abs(c.skewness) / 4), cols: [c.name],
          note: `${c.skewness > 0 ? "right" : "left"}-skewed distribution (median more representative than mean)`,
          detail: `skew=${f(c.skewness)}, mean=${f(c.mean)} vs median=${f(c.median)}`,
        });
      }
      if (c.n >= 20 && c.outlierCount / c.n >= 0.05) {
        signals.push({
          kind: "outliers", importance: Math.min(0.5, (c.outlierCount / c.n) * 3), cols: [c.name],
          note: "elevated outlier rate", detail: `${c.outlierCount} outliers (${Math.round((c.outlierCount / c.n) * 100)}% of ${c.n}) by 1.5×IQR`,
        });
      }
    }
    for (const c of categoricalSummary) {
      if (c.cardinality >= 2 && c.topShare >= 0.9 && c.total >= 20) {
        signals.push({
          kind: "imbalance", importance: 0.5, cols: [c.name],
          note: "highly imbalanced categories",
          detail: `"${c.topName}" is ${Math.round(c.topShare * 100)}% of ${c.total} labelled rows across ${c.cardinality} categories`,
        });
      }
    }

    const ranked = [...signals].sort((a, b) => b.importance - a.importance);

    // ── 7. System-attached figures (client-only; never sent to the API) ───
    const figures: Figure[] = [];
    if (numericCols.length >= 3) {
      const hcols = columnsSummary.slice(0, 8).map((c) => c.name);
      const matrix = hcols.map((a) => hcols.map((b) => {
        if (a === b) return 1;
        const found = correlations.find((c) => (c.col1 === a && c.col2 === b) || (c.col1 === b && c.col2 === a));
        return found ? found.r : NaN;
      }));
      figures.push({ kind: "heatmap", cols: hcols, matrix, caption: "Correlation matrix (Pearson r)" });
    }
    for (const s of ranked) {
      if (figures.length >= 7) break;
      if (s.kind === "relationship" || s.kind === "redundancy") figures.push({ kind: "scatter", xCol: s.cols[0], yCol: s.cols[1], caption: s.note, tool: "linear-regression" });
      else if (s.kind === "difference") figures.push({ kind: "ci", numCol: s.cols[0], catCol: s.cols[1], caption: s.note, tool: "box-plot" });
      else if (s.kind === "driver" && driverResult) figures.push({ kind: "coefficient", target, r2: driverResult.r2, drivers: driverResult.drivers.map((d) => ({ name: d.name, beta: d.beta, pValue: d.pValue })), caption: `Standardized drivers of ${target}` });
      else if (s.kind === "skew" || s.kind === "outliers") figures.push({ kind: "distribution", col: s.cols[0], caption: s.note, tool: "normal-distribution" });
      else if (s.kind === "missingness") figures.push({ kind: "missingness", items: perColMissing.filter((p) => p.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 8), caption: "Missing data by column" });
    }

    const numericRoster = columnsSummary.map((c) => ({
      name: c.name, mean: c.mean, sd: c.sd,
      shape: Math.abs(c.skewness) < 0.5 ? "symmetric" : c.skewness > 0 ? "right-skewed" : "left-skewed",
    }));

    const quality = {
      completeness: Math.round(completeness),
      duplicateRows,
      worstMissing: perColMissing.filter((p) => p.rate > 0.01).sort((a, b) => b.rate - a.rate).slice(0, 5).map((p) => ({ name: p.name, pct: Math.round(p.rate * 100) })),
      constantCols,
      idLikeCols,
    };

    return {
      // ── sent to the API (token-light) ──
      datasetName: dataset.name,
      rowCount,
      colCount: dataset.headers.length,
      numericColumns: numericRoster,
      categoricalColumns: categoricalSummary.map((c) => ({ name: c.name, cardinality: c.cardinality })),
      target: target || null,
      signals: ranked.slice(0, 14).map(({ importance, ...rest }) => rest),
      quality,
      coverage: {
        correlationsTested: correlations.length,
        groupTestsTested: groupComparisons.length,
        signalsFound: signals.length,
      },
      // ── client-only (figures + driver detail for rendering) ──
      figures,
      driverResult,
    };
  }, [dataset, alpha, target]);

  // API Call to generate narrative report
  const generateReport = async () => {
    if (!statisticsContext) return;
    setLoading(true);
    setError(null);
    try {
      // Send only the token-light ledger; figures/driverResult stay client-side.
      const { figures: _f, driverResult: _d, ...apiPayload } = statisticsContext;
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...apiPayload, focus, tone, alpha }),
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

    const sigLabel: Record<KeyFinding["significance"], string> = {
      significant: "Significant",
      "not-significant": "No effect detected",
      descriptive: "Descriptive",
    };

    let md = `# ${report.title}\n\n`;
    const targetMeta = statisticsContext?.target ? ` | Target: ${statisticsContext.target}` : "";
    md += `*Generated: ${new Date().toLocaleDateString()} | Dataset: ${dataset?.name} (${dataset?.rows.length} rows) | α = ${alpha}${targetMeta}*\n\n`;
    md += `## Executive Summary\n\n${report.executiveSummary}\n\n`;

    if (report.dataOverview || statisticsContext) {
      md += `## Data Overview\n\n`;
      if (report.dataOverview) md += `${report.dataOverview}\n\n`;
      if (statisticsContext) {
        const q = statisticsContext.quality;
        md += `- Completeness: ${q.completeness}% · ${statisticsContext.rowCount} rows × ${statisticsContext.numericColumns.length + statisticsContext.categoricalColumns.length} columns`;
        if (q.duplicateRows > 0) md += ` · ${q.duplicateRows} duplicate rows`;
        if (q.constantCols.length > 0) md += ` · constant: ${q.constantCols.join(", ")}`;
        md += `\n\n`;
      }
    }

    if (report.keyFindings && report.keyFindings.length > 0) {
      md += `## Key Findings\n\n`;
      report.keyFindings.forEach((kf) => {
        md += `- **${kf.finding}** — ${kf.detail} _(${sigLabel[kf.significance] ?? kf.significance})_\n`;
      });
      md += `\n`;
    }

    report.sections.forEach((sec) => {
      md += `## ${sec.title}\n\n`;
      sec.paragraphs.forEach((p) => {
        md += `${p}\n\n`;
      });
      if (sec.chart) {
        md += `*Chart suggestion embedded: [${sec.chart.type} - X: ${sec.chart.xCol}${sec.chart.yCol ? `, Y: ${sec.chart.yCol}` : ""}]*\n\n`;
      }
    });

    if (statisticsContext && statisticsContext.figures.length > 0) {
      md += `## Supporting Figures\n\n`;
      statisticsContext.figures.forEach((fig) => {
        md += `- ${fig.caption} _(${fig.kind} chart — view in app)_\n`;
      });
      md += `\n`;
    }

    md += `## Recommended Next Steps\n\n`;
    report.recommendations.forEach((rec) => {
      md += `- ${rec}\n`;
    });

    if (report.limitations && report.limitations.length > 0) {
      md += `\n## Limitations & Caveats\n\n`;
      report.limitations.forEach((lim) => {
        md += `- ${lim}\n`;
      });
    }

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

        {/* Analysis target — drives key-driver (feature importance) analysis */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
            Analysis Target — what do you want to explain?
          </label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-2 text-sm text-neutral-700 dark:text-neutral-350 focus:border-orange-500 focus:outline-none transition-colors"
          >
            <option value="">None — exploratory overview</option>
            {statisticsContext?.numericColumns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
            Pick an outcome to rank which variables drive it (standardized regression). Leave as exploratory for a broad summary.
          </p>
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
            <div className="font-semibold text-neutral-800 dark:text-neutral-200">Pre-flight Analysis</div>
            <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Stats Lab ran
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{(statisticsContext?.coverage.correlationsTested ?? 0) + (statisticsContext?.coverage.groupTestsTested ?? 0)} tests</span>
              across
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{statisticsContext?.numericColumns.length ?? 0} numeric</span> and
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 mx-1">{statisticsContext?.categoricalColumns.length ?? 0} categorical</span> columns, then surfaced the
              <span className="font-semibold text-orange-600 dark:text-orange-400 mx-1">{statisticsContext?.coverage.signalsFound ?? 0} most notable patterns</span>.
              Only these verified signals — not your raw data — are sent to the model to write up.
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
      "Profiling columns and scoring data quality...",
      "Testing correlations with FDR correction and CIs...",
      "Running group tests, effect sizes, and driver regression...",
      "Ranking signals and writing the narrative..."
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

          {/* Data Overview — quality up front so the reader trusts the rest */}
          {statisticsContext && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-bold tracking-tight text-neutral-800 dark:text-neutral-200 border-l-2 border-orange-500 pl-3">
                Data Overview
              </h2>
              {report.dataOverview && (
                <p className="text-sm leading-relaxed text-neutral-650 dark:text-neutral-350 print:text-neutral-850 font-sans">
                  <RichText text={report.dataOverview} />
                </p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <QualityChip label="Completeness" value={`${statisticsContext.quality.completeness}%`} tone={statisticsContext.quality.completeness >= 95 ? "good" : statisticsContext.quality.completeness >= 80 ? "neutral" : "warn"} />
                <QualityChip label="Rows" value={statisticsContext.rowCount.toLocaleString()} tone="neutral" />
                <QualityChip label="Columns" value={String(statisticsContext.numericColumns.length + statisticsContext.categoricalColumns.length)} tone="neutral" />
                {statisticsContext.quality.duplicateRows > 0 && (
                  <QualityChip label="Duplicate rows" value={String(statisticsContext.quality.duplicateRows)} tone="warn" />
                )}
                {statisticsContext.quality.constantCols.length > 0 && (
                  <QualityChip label="Constant cols" value={String(statisticsContext.quality.constantCols.length)} tone="warn" />
                )}
                {statisticsContext.target && (
                  <QualityChip label="Target" value={statisticsContext.target} tone="accent" />
                )}
              </div>
            </div>
          )}

          {/* Executive Summary Block */}
          <div className="space-y-3">
            <h2 className="font-serif text-lg font-bold tracking-tight text-neutral-800 dark:text-neutral-200 border-l-2 border-orange-500 pl-3">
              Executive Summary
            </h2>
            <p className="text-sm leading-relaxed text-neutral-650 dark:text-neutral-350 print:text-neutral-850 print:text-sm font-sans">
              <RichText text={report.executiveSummary} />
            </p>
          </div>

          {/* Key Findings — scannable, verdict-tagged headlines */}
          {report.keyFindings && report.keyFindings.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-bold tracking-tight text-neutral-800 dark:text-neutral-200 border-l-2 border-orange-500 pl-3">
                Key Findings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:grid-cols-2">
                {report.keyFindings.map((kf, idx) => {
                  const style = SIGNIFICANCE_STYLES[kf.significance] ?? SIGNIFICANCE_STYLES.descriptive;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-neutral-150 dark:border-neutral-850 bg-neutral-50/60 dark:bg-neutral-950/30 p-4 flex flex-col gap-2 print:break-inside-avoid print:bg-white print:border-neutral-300"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-150 print:text-neutral-900">
                        <RichText text={kf.finding} />
                      </p>
                      {kf.detail && (
                        <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-500 print:text-neutral-600 mt-auto">
                          {kf.detail}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Supporting Figures — system-attached; the right chart is always
              present for every notable finding, no external tool required */}
          {statisticsContext && statisticsContext.figures.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-bold tracking-tight text-neutral-800 dark:text-neutral-200 border-l-2 border-orange-500 pl-3">
                Supporting Figures
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-1">
                {statisticsContext.figures.map((fig, idx) => (
                  <FigureCard key={idx} figure={fig} dataset={dataset} />
                ))}
              </div>
            </div>
          )}

          {/* Sections Interleaved with Charts */}
          <div className="space-y-8">
            {report.sections.map((sec, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="font-serif text-base font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
                  {sec.title}
                </h3>
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-sm leading-relaxed text-neutral-650 dark:text-neutral-350 print:text-neutral-850 font-sans">
                    <RichText text={p} />
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
              Recommended Next Steps
            </h3>
            <ul className="space-y-2.5">
              {report.recommendations.map((rec, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-neutral-650 dark:text-neutral-350 print:text-neutral-850">
                  <span className="text-orange-500 font-bold shrink-0 mt-0.5">•</span>
                  <span className="font-sans leading-relaxed"><RichText text={rec} /></span>
                </li>
              ))}
            </ul>
          </div>

          {/* Limitations Block — honest caveats keep the report trustworthy */}
          {report.limitations && report.limitations.length > 0 && (
            <div className="space-y-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/40 border border-neutral-150 dark:border-neutral-850 p-4 print:break-inside-avoid print:bg-white print:border-neutral-300">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Limitations & Caveats
                </h3>
              </div>
              <ul className="space-y-1.5">
                {report.limitations.map((lim, idx) => (
                  <li key={idx} className="flex gap-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 print:text-neutral-600">
                    <span className="shrink-0 mt-0.5">—</span>
                    <span className="font-sans"><RichText text={lim} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
        {(() => {
          const toolId = type === "scatter" ? "linear-regression" : type === "bar" ? "bar-chart" : type === "box" ? "box-plot" : "normal-distribution";
          return TOOL_SLUGS.has(toolId) ? (
            <button
              onClick={() => { window.location.href = `/app?tool=${toolId}`; }}
              className="text-[10px] text-orange-500 hover:underline font-bold print:hidden"
            >
              Open Tool →
            </button>
          ) : null;
        })()}
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

/* ─────────────────────────────────────────────────────────────────────────────
   SYSTEM-ATTACHED FIGURES — one card per notable signal. The correct chart is
   always rendered here from local data, so it is present even when no matching
   interactive tool exists (the "Open Tool" link is shown only when one does).
   ───────────────────────────────────────────────────────────────────────────── */

const TOOL_SLUGS = new Set(["linear-regression", "normal-distribution", "bar-chart", "scatter", "box-plot"]);

function FigureMissing() {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-xs text-neutral-400 dark:text-neutral-500 select-none">
      <AlertCircle className="w-4 h-4 mb-1.5 text-neutral-300 dark:text-neutral-700" />
      <span>Chart data unavailable</span>
    </div>
  );
}

function FigureCard({ figure, dataset }: { figure: Figure; dataset: any }) {
  const figTool = (figure as { tool?: string }).tool;
  const tool = figTool && TOOL_SLUGS.has(figTool) ? figTool : null;
  return (
    <div className="rounded-xl border border-neutral-150 dark:border-neutral-850 bg-neutral-50/40 dark:bg-neutral-950/20 p-4 shadow-sm print:break-inside-avoid print:bg-white print:border-neutral-300 space-y-2 font-sans select-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 first-letter:capitalize truncate">{figure.caption}</span>
        {tool && (
          <button
            onClick={() => { window.location.href = `/app?tool=${tool}`; }}
            className="text-[10px] text-orange-500 hover:underline font-bold print:hidden shrink-0"
          >
            Open Tool →
          </button>
        )}
      </div>
      <FigureChart figure={figure} dataset={dataset} />
    </div>
  );
}

function FigureChart({ figure, dataset }: { figure: Figure; dataset: any }) {
  const col = (name: string) => dataset.columns.find((c: any) => c.name === name);
  switch (figure.kind) {
    case "scatter": {
      const c1 = col(figure.xCol), c2 = col(figure.yCol);
      return c1 && c2 ? <InlineScatterChart c1={c1} c2={c2} dataset={dataset} /> : <FigureMissing />;
    }
    case "distribution": {
      const c1 = col(figure.col);
      return c1 ? <InlineDistributionChart c1={c1} /> : <FigureMissing />;
    }
    case "box": {
      const nc = col(figure.numCol), cc = col(figure.catCol);
      return nc && cc ? <InlineBoxChart c1={nc} c2={cc} dataset={dataset} /> : <FigureMissing />;
    }
    case "ci": {
      const nc = col(figure.numCol), cc = col(figure.catCol);
      return nc && cc ? <InlineCIChart numCol={nc} catCol={cc} dataset={dataset} /> : <FigureMissing />;
    }
    case "heatmap":
      return <InlineHeatmapChart cols={figure.cols} matrix={figure.matrix} />;
    case "coefficient":
      return <InlineCoefficientChart target={figure.target} r2={figure.r2} drivers={figure.drivers} />;
    case "missingness":
      return <InlineMissingnessChart items={figure.items} />;
    default:
      return <FigureMissing />;
  }
}

/* ── Group means with 95% confidence-interval whiskers (forest-style) ─────── */
function InlineCIChart({ numCol, catCol, dataset }: { numCol: any; catCol: any; dataset: any }) {
  const groupsMap = new Map<string, number[]>();
  for (let r = 0; r < dataset.rows.length; r++) {
    const cat = String(dataset.rows[r][catCol.index] ?? "").trim();
    const num = dataset.rows[r][numCol.index];
    if (cat !== "" && typeof num === "number" && !isNaN(num)) {
      if (!groupsMap.has(cat)) groupsMap.set(cat, []);
      groupsMap.get(cat)!.push(num);
    }
  }
  const stats = Array.from(groupsMap.entries())
    .map(([cat, vals]) => {
      const m = mean(vals) || 0;
      const s = sd(vals) || 0;
      const n = vals.length;
      const se = n > 1 ? s / Math.sqrt(n) : 0;
      const tc = n > 1 ? tCrit(0.05, n - 1) : 0;
      return { cat, m, lo: m - tc * se, hi: m + tc * se, n };
    })
    .filter((g) => g.n >= 2)
    .sort((a, b) => b.m - a.m)
    .slice(0, 6);
  if (stats.length === 0) return <FigureMissing />;

  const lo = Math.min(...stats.map((g) => g.lo));
  const hi = Math.max(...stats.map((g) => g.hi));
  const pad = (hi - lo) * 0.15 || 1;
  const minV = lo - pad, maxV = hi + pad;
  const W = 450, H = 220, pL = 44, pR = 20, pT = 16, pB = 34;
  const scaleY = (y: number) => H - pB - ((y - minV) / (maxV - minV)) * (H - pT - pB);
  const band = (W - pL - pR) / stats.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
      <line x1={pL} y1={pT} x2={pL} y2={H - pB} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
      {stats.map((g, idx) => {
        const cx = pL + idx * band + band / 2;
        const yLo = scaleY(g.lo), yHi = scaleY(g.hi), yM = scaleY(g.m);
        return (
          <g key={idx}>
            <line x1={cx} y1={yHi} x2={cx} y2={yLo} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.4} />
            <line x1={cx - 6} y1={yHi} x2={cx + 6} y2={yHi} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.4} />
            <line x1={cx - 6} y1={yLo} x2={cx + 6} y2={yLo} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth={1.4} />
            <circle cx={cx} cy={yM} r={4} className="fill-orange-500 dark:fill-orange-400" />
            <text x={cx} y={yM - 8} className="fill-neutral-500 dark:fill-neutral-400 text-[8px] font-mono" textAnchor="middle">{g.m.toFixed(1)}</text>
            <text x={cx} y={H - 12} className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-medium" textAnchor="middle">
              {g.cat.length > 8 ? `${g.cat.slice(0, 6)}..` : g.cat}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" textAnchor="middle">{catCol.name}</text>
      <text x={12} y={H / 2} className="fill-neutral-400 dark:fill-neutral-500 text-[9px] font-semibold" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
        {numCol.name} (mean ± 95% CI)
      </text>
    </svg>
  );
}

/* ── Correlation heatmap (Pearson r, diverging colour scale) ──────────────── */
function InlineHeatmapChart({ cols, matrix }: { cols: string[]; matrix: number[][] }) {
  const k = cols.length;
  if (k < 2) return <FigureMissing />;
  const cell = Math.max(22, Math.min(34, Math.floor(300 / k)));
  const labelL = 70, labelT = 58, pad = 6;
  const W = labelL + k * cell + pad;
  const H = labelT + k * cell + pad;
  const short = (s: string) => (s.length > 9 ? `${s.slice(0, 8)}…` : s);
  const fill = (r: number) => {
    if (!Number.isFinite(r)) return "transparent";
    const a = 0.1 + 0.85 * Math.min(1, Math.abs(r));
    return r >= 0 ? `rgba(249,115,22,${a})` : `rgba(59,130,246,${a})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      {cols.map((c, i) => (
        <text key={`col-${i}`} x={labelL + i * cell + cell / 2} y={labelT - 6} transform={`rotate(-45 ${labelL + i * cell + cell / 2} ${labelT - 6})`}
          className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-medium" textAnchor="start">{short(c)}</text>
      ))}
      {cols.map((rowName, i) => (
        <g key={`row-${i}`}>
          <text x={labelL - 6} y={labelT + i * cell + cell / 2 + 3} className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-medium" textAnchor="end">{short(rowName)}</text>
          {cols.map((_, j) => {
            const v = matrix[i]?.[j];
            return (
              <g key={j}>
                <rect x={labelL + j * cell} y={labelT + i * cell} width={cell - 1.5} height={cell - 1.5} rx={2}
                  fill={fill(v)} className="stroke-neutral-100 dark:stroke-neutral-900" strokeWidth={0.5} />
                {Number.isFinite(v) && (
                  <text x={labelL + j * cell + cell / 2} y={labelT + i * cell + cell / 2 + 3}
                    className={`text-[7px] font-mono ${Math.abs(v) > 0.6 ? "fill-white" : "fill-neutral-500 dark:fill-neutral-400"}`} textAnchor="middle">
                    {v.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/* ── Standardized-coefficient bars (key drivers, diverging around 0) ──────── */
function InlineCoefficientChart({ target, r2, drivers }: { target: string; r2: number; drivers: { name: string; beta: number; pValue: number }[] }) {
  const items = drivers.slice(0, 8);
  if (!items.length) return <FigureMissing />;
  const maxAbs = Math.max(...items.map((d) => Math.abs(d.beta)), 0.001);
  const W = 450, rowH = 24, padL = 112, padR = 44, top = 10;
  const H = top + items.length * rowH + 26;
  const midX = padL + (W - padL - padR) / 2;
  const half = (W - padL - padR) / 2;
  const short = (s: string) => (s.length > 15 ? `${s.slice(0, 14)}…` : s);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      <line x1={midX} y1={top} x2={midX} y2={top + items.length * rowH} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
      {items.map((d, i) => {
        const y = top + i * rowH + rowH / 2;
        const w = (d.beta / maxAbs) * half;
        const sig = d.pValue < 0.05;
        return (
          <g key={i}>
            <text x={padL - 8} y={y + 3} className="fill-neutral-500 dark:fill-neutral-400 text-[9px] font-medium" textAnchor="end">{short(d.name)}</text>
            <rect x={w >= 0 ? midX : midX + w} y={y - 7} width={Math.max(1, Math.abs(w))} height={14} rx={2}
              className={(d.beta >= 0 ? "fill-orange-500 dark:fill-orange-400" : "fill-sky-500 dark:fill-sky-400") + (sig ? "" : " opacity-40")} />
            <text x={w >= 0 ? midX + w + 4 : midX + w - 4} y={y + 3}
              className="fill-neutral-500 dark:fill-neutral-400 text-[8px] font-mono" textAnchor={w >= 0 ? "start" : "end"}>
              {d.beta >= 0 ? "+" : ""}{d.beta.toFixed(2)}{sig ? "*" : ""}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 8} className="fill-neutral-400 dark:fill-neutral-500 text-[8px] font-semibold" textAnchor="middle">
        standardized β on {target.length > 16 ? `${target.slice(0, 15)}…` : target} · model R²={r2.toFixed(2)} · * p&lt;0.05
      </text>
    </svg>
  );
}

/* ── Missing-data-by-column bars ──────────────────────────────────────────── */
function InlineMissingnessChart({ items }: { items: { name: string; rate: number }[] }) {
  const rows = items.slice(0, 8);
  if (!rows.length) return <FigureMissing />;
  const W = 450, rowH = 22, padL = 112, padR = 46, top = 8;
  const H = top + rows.length * rowH + 6;
  const barW = W - padL - padR;
  const short = (s: string) => (s.length > 15 ? `${s.slice(0, 14)}…` : s);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-white dark:bg-neutral-950 rounded-lg overflow-visible border border-neutral-200 dark:border-neutral-850">
      {rows.map((d, i) => {
        const y = top + i * rowH + rowH / 2;
        const pct = Math.min(1, d.rate);
        return (
          <g key={i}>
            <text x={padL - 8} y={y + 3} className="fill-neutral-500 dark:fill-neutral-400 text-[9px] font-medium" textAnchor="end">{short(d.name)}</text>
            <rect x={padL} y={y - 7} width={barW} height={14} rx={3} className="fill-neutral-100 dark:fill-neutral-900" />
            <rect x={padL} y={y - 7} width={Math.max(1, barW * pct)} height={14} rx={3} className="fill-amber-500/80 dark:fill-amber-400/80" />
            <text x={padL + barW + 4} y={y + 3} className="fill-neutral-500 dark:fill-neutral-400 text-[8px] font-mono" textAnchor="start">{Math.round(d.rate * 100)}%</text>
          </g>
        );
      })}
    </svg>
  );
}
