/**
 * DataDropZone/analyse.ts
 *
 * Pure functions — no React, no hooks, no side-effects.
 * Industry-grade quality layer: injection detection, IQR outlier fencing,
 * missing-value accounting, smart column role inference, composite health scoring.
 */
import {
  mean, median, sd, skewness, kurtosis,
  parseNumbers, parseCSV, detectDistribution, pearsonR, quantile,
  type ParsedCSV,
} from "@/components/tools/shared/stats";
import {
  BarChart3, TrendingUp, Activity, Grid3x3, Clock, Brain, Dices, GitBranch, Shuffle,
} from "lucide-react";
import type {
  ColumnStats, AnalysisResult, Suggestion,
  DataQualityInfo, ParseWarning, ColumnRole, QualityGrade,
} from "./types";

/* ── Constants ───────────────────────────────────────────────────────── */

/** CSV injection trigger characters (OWASP standard). */
const INJECTION_CHARS = ["=", "+", "-", "@", "\t", "\r"];

/** Missing-value sentinel strings (case-insensitive). */
const MISSING_SENTINELS = new Set([
  "na", "n/a", "null", "nan", "none", "nil", "missing", "", ".", "..", "--",
]);

/** Boolean truthy/falsy value sets. */
const BOOL_TRUE  = new Set(["true",  "yes", "y", "1", "t", "on"]);
const BOOL_FALSE = new Set(["false", "no",  "n", "0", "f", "off"]);

/** UUID v4 pattern. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ── Column role inference ───────────────────────────────────────────── */

/**
 * Infer the semantic role of a non-numeric column from its raw string values.
 * Returns the role that best describes the column's content.
 */
export function inferTextColumnRole(
  values: (string | null)[],
  totalRows: number,
): ColumnRole {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== "");
  if (nonNull.length === 0) return "text";

  // Boolean check — all non-empty values must be in the bool sets.
  const allBool = nonNull.every((v) => {
    const lower = v.toLowerCase().trim();
    return BOOL_TRUE.has(lower) || BOOL_FALSE.has(lower);
  });
  if (allBool) return "boolean";

  // UUID check — any UUID-pattern value → likely an ID column.
  if (nonNull.some((v) => UUID_RE.test(v.trim()))) return "id_like";

  // Date check — try Date.parse on a sample.
  const sample = nonNull.slice(0, Math.min(50, nonNull.length));
  const dateParseable = sample.filter((v) => {
    const d = Date.parse(v.trim());
    return !isNaN(d) && d > -2e12 && d < 4e12; // within ~1900–2100 range
  });
  if (dateParseable.length / sample.length >= 0.7) return "date";

  // ID-like check: high cardinality (>90% unique) or monotonically numeric strings.
  const unique = new Set(nonNull.map((v) => v.toLowerCase().trim()));
  if (unique.size / totalRows > 0.9) return "id_like";

  // Categorical: low cardinality (≤50 unique values) relative to size.
  if (unique.size <= 50 || unique.size / nonNull.length <= 0.3) return "categorical";

  return "text";
}

/* ── IQR outlier fencing ─────────────────────────────────────────────── */

type FenceResult = {
  lowerFence: number;
  upperFence: number;
  outlierCount: number;
};

function computeFences(sorted: number[]): FenceResult {
  if (sorted.length < 4) {
    return { lowerFence: -Infinity, upperFence: Infinity, outlierCount: 0 };
  }
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqrVal = q3 - q1;
  const lowerFence = q1 - 1.5 * iqrVal;
  const upperFence = q3 + 1.5 * iqrVal;
  const outlierCount = sorted.filter((v) => v < lowerFence || v > upperFence).length;
  return { lowerFence, upperFence, outlierCount };
}

/* ── CSV injection detection ─────────────────────────────────────────── */

/**
 * Scan all cells for CSV injection patterns.
 * Returns count of sanitized cells and appends warnings.
 *
 * Note: we scan but do NOT mutate the data — the workspace keeps raw values.
 * Warnings are surfaced in the quality report so the user can inspect them.
 */
function detectInjections(
  rows: string[][],
  headers: string[],
  warnings: ParseWarning[],
): number {
  let count = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell || cell.length === 0) continue;
      if (INJECTION_CHARS.includes(cell[0])) {
        count++;
        warnings.push({
          row: r + 1,
          col: headers[c],
          kind: "injection",
          detail: `Cell starts with "${cell[0]}" — potential formula injection.`,
          rawValue: cell.slice(0, 40),
        });
      }
    }
  }
  return count;
}

/* ── Duplicate row detection ─────────────────────────────────────────── */

function countDuplicateRows(rows: string[][]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const key = row.join("\x00");
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes;
}

/* ── Per-column quality score ────────────────────────────────────────── */

/**
 * Score a single numeric column 0–100.
 * Deductions:
 *   - Missing rate: up to -40 points
 *   - Outlier rate: up to -20 points
 */
function columnQualityScore(missingRate: number, outlierRate: number): number {
  const missingDeduction = Math.min(40, missingRate * 100 * 0.4);
  const outlierDeduction = Math.min(20, outlierRate * 100 * 0.2);
  return Math.max(0, Math.round(100 - missingDeduction - outlierDeduction));
}

/* ── Overall quality scoring ─────────────────────────────────────────── */

function gradeScore(score: number): QualityGrade {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}

function computeOverallQuality(
  columns: ColumnStats[],
  injectionCount: number,
  duplicateRows: number,
  totalRows: number,
  warnings: ParseWarning[],
  delimiter: string,
  hasBOM: boolean,
): DataQualityInfo {
  // Completeness: average of (1 - missingRate) across all numeric columns.
  const completeness =
    columns.length === 0
      ? 100
      : Math.round(
          (columns.reduce((sum, c) => sum + (1 - c.missingRate), 0) / columns.length) * 100,
        );

  // Base score = average of per-column quality scores.
  const baseScore =
    columns.length === 0
      ? 90
      : columns.reduce((sum, c) => sum + c.qualityScore, 0) / columns.length;

  // Deductions
  const injectionPenalty = Math.min(20, injectionCount * 5);
  const dupePenalty = totalRows > 0 ? Math.min(10, (duplicateRows / totalRows) * 20) : 0;

  const score = Math.max(0, Math.round(baseScore - injectionPenalty - dupePenalty));

  return {
    score,
    grade: gradeScore(score),
    completeness,
    injectionCount,
    duplicateRows,
    warnings: warnings.slice(0, 100), // cap displayed warnings
    delimiter,
    hasBOM,
  };
}

/* ── Single-column (flat number array) analysis ──────────────────────── */

export function singleColumnAnalysis(nums: number[]): AnalysisResult {
  const sorted = [...nums].sort((a, b) => a - b);
  const { lowerFence, upperFence, outlierCount } = computeFences(sorted);

  const col: ColumnStats = {
    name: "Values",
    count: nums.length,
    mean: mean(nums),
    median: median(nums),
    sd: sd(nums),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    skewness: skewness(nums),
    kurtosis: kurtosis(nums),
    distribution: detectDistribution(nums),
    missingCount: 0,
    missingRate: 0,
    outlierCount,
    lowerFence,
    upperFence,
    qualityScore: columnQualityScore(0, outlierCount / nums.length),
    role: "numeric",
  };

  const quality: DataQualityInfo = {
    score: col.qualityScore,
    grade: gradeScore(col.qualityScore),
    completeness: 100,
    injectionCount: 0,
    duplicateRows: 0,
    warnings: [],
    delimiter: "none",
    hasBOM: false,
  };

  return {
    columns: [col],
    textColumns: [],
    textColumnRoles: new Map(),
    categoricalGroupCounts: new Map(),
    rowCount: nums.length,
    colCount: 1,
    headers: ["Values"],
    sampleRows: nums.slice(0, 5).map((n) => [String(n)]),
    numericColumnsByName: ["Values"],
    quality,
  };
}

/* ── CSV analysis ────────────────────────────────────────────────────── */

export function analyzeCSV(
  csv: ParsedCSV,
  qualityOverride?: DataQualityInfo,
): AnalysisResult {
  const warnings: ParseWarning[] = [];
  const columns: ColumnStats[] = [];
  const numCols = Array.from(csv.numericColumns.entries());
  const numColNames = new Set(csv.numericColumns.keys());
  const textColNames = csv.headers.filter((h) => !numColNames.has(h));

  // ── Numeric column analysis with quality metrics ─────────────────────
  for (const [name, vals] of numCols) {
    const sorted = [...vals].sort((a, b) => a - b);
    const colIdx = csv.headers.indexOf(name);

    // Count missing values for this column across all rows.
    let missingCount = 0;
    if (colIdx >= 0) {
      for (const row of csv.rows) {
        const cell = row[colIdx];
        const isBlank = cell === null || cell === undefined || cell === "";
        const isSentinel = typeof cell === "string" && MISSING_SENTINELS.has(cell.toLowerCase().trim());
        if (isBlank || isSentinel) missingCount++;
      }
    }

    const totalRows = csv.rowCount;
    const missingRate = totalRows > 0 ? missingCount / totalRows : 0;
    const { lowerFence, upperFence, outlierCount } = computeFences(sorted);
    const outlierRate = vals.length > 0 ? outlierCount / vals.length : 0;

    columns.push({
      name,
      count: vals.length,
      mean: mean(vals),
      median: median(vals),
      sd: sd(vals),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      skewness: skewness(vals),
      kurtosis: kurtosis(vals),
      distribution: detectDistribution(vals),
      missingCount,
      missingRate,
      outlierCount,
      lowerFence,
      upperFence,
      qualityScore: columnQualityScore(missingRate, outlierRate),
      role: "numeric",
    });
  }

  // ── Categorical columns + role inference ─────────────────────────────
  const categoricalGroupCounts = new Map<string, number>();
  const textColumnRoles = new Map<string, ColumnRole>();

  for (const colName of textColNames) {
    const colIdx = csv.headers.indexOf(colName);
    if (colIdx < 0) continue;

    const rawValues = csv.rows.map((row) => row[colIdx] ?? null);
    const role = inferTextColumnRole(rawValues, csv.rowCount);
    textColumnRoles.set(colName, role);

    const seen = new Set<string>();
    for (const v of rawValues) {
      if (v !== null && v !== undefined && v !== "") seen.add(String(v));
    }
    categoricalGroupCounts.set(colName, seen.size);
  }

  // ── Pairwise correlations (cap at 10 columns to avoid O(n²) blowup) ──
  const correlations: { col1: string; col2: string; r: number }[] = [];
  if (numCols.length >= 2 && numCols.length <= 10) {
    for (let i = 0; i < numCols.length; i++) {
      for (let j = i + 1; j < numCols.length; j++) {
        const [n1, v1] = numCols[i];
        const [n2, v2] = numCols[j];
        const minLen = Math.min(v1.length, v2.length);
        if (minLen >= 3) {
          const r = pearsonR(v1.slice(0, minLen), v2.slice(0, minLen));
          correlations.push({ col1: n1, col2: n2, r });
        }
      }
    }
  }

  // ── Assemble quality report ───────────────────────────────────────────
  const quality = qualityOverride ?? computeOverallQuality(
    columns, 0, 0, csv.rowCount, warnings, ",", false,
  );

  return {
    columns,
    textColumns: textColNames,
    textColumnRoles,
    categoricalGroupCounts,
    correlations: correlations.length > 0 ? correlations : undefined,
    rowCount: csv.rowCount,
    colCount: csv.colCount,
    headers: csv.headers,
    sampleRows: csv.rows.slice(0, 5),
    numericColumnsByName: numCols.map(([n]) => n),
    quality,
  };
}

/* ── Entry point: dispatch raw text to the right analyser ────────────── */

export type ParseResult =
  | { kind: "ok"; result: AnalysisResult; csvText: string }
  | { kind: "error"; message: string };

export function parseAndAnalyse(text: string, name?: string): ParseResult {
  // ── 1. Flat number array shortcut ─────────────────────────────────────
  const nums = parseNumbers(text);
  const lineCount = text.trim().split(/\r?\n/).filter((l) => l.trim()).length;
  const hasMultiCol = text.trim().split(/\r?\n/)[0]?.split(/[,\t;]/).length > 1;
  const numsLooksFlat = nums && nums.length >= 2 && (!hasMultiCol || lineCount <= 1);

  if (numsLooksFlat) {
    const result = singleColumnAnalysis(nums!);
    const csvText = ["Values", ...nums!.map(String)].join("\n");
    return { kind: "ok", result, csvText };
  }

  // ── 2. Full CSV parsing with quality analysis ─────────────────────────
  const hasBOM = text.startsWith("\uFEFF");
  const cleanText = hasBOM ? text.slice(1) : text;

  const csv = parseCSV(cleanText);
  if (csv && csv.rowCount >= 1 && csv.colCount >= 1) {
    // Run injection scanner and duplicate counter on the raw rows.
    const warnings: ParseWarning[] = [];
    const injectionCount = detectInjections(csv.rows, csv.headers, warnings);
    const duplicateRows = countDuplicateRows(csv.rows);

    // Detect delimiter from the text (mirrors what parseCSV does internally).
    const firstLine = cleanText.split(/\r?\n/).find((l) => l.trim()) ?? "";
    const countUnquoted = (line: string, d: string) => {
      let n = 0, inQ = false;
      for (const ch of line) { if (ch === '"') inQ = !inQ; else if (!inQ && ch === d) n++; }
      return n;
    };
    const candidates = ([
      ["\t", countUnquoted(firstLine, "\t")] as [string, number],
      [",",  countUnquoted(firstLine, ",")] as [string, number],
      [";",  countUnquoted(firstLine, ";")] as [string, number],
      ["|",  countUnquoted(firstLine, "|")] as [string, number],
    ]).sort((a, b) => b[1] - a[1]);
    const delimiter = candidates[0][1] > 0 ? candidates[0][0] : ",";

    // Build the quality info.
    const columns: ColumnStats[] = []; // filled by analyzeCSV below
    const tempResult = analyzeCSV(csv);

    const quality = computeOverallQuality(
      tempResult.columns,
      injectionCount,
      duplicateRows,
      csv.rowCount,
      warnings,
      delimiter === "\t" ? "\\t" : delimiter,
      hasBOM,
    );

    // Rebuild with the real quality object injected.
    const finalResult = analyzeCSV(csv, quality);
    return { kind: "ok", result: finalResult, csvText: cleanText };
  }

  // ── 3. Fallback: flat numbers that look multi-col ─────────────────────
  if (nums && nums.length >= 2) {
    const result = singleColumnAnalysis(nums);
    const csvText = ["Values", ...nums.map(String)].join("\n");
    return { kind: "ok", result, csvText };
  }

  return {
    kind: "error",
    message: "Could not parse data. Try CSV, TSV, or space/comma separated numbers.",
  };
}

/* ── Rule-based suggestion engine ───────────────────────────────────── */

export function buildSuggestions(a: AnalysisResult): Suggestion[] {
  const nNum = a.columns.length;
  const nCat = a.textColumns.filter(
    (c) => (a.textColumnRoles.get(c) ?? "text") === "categorical",
  ).length;
  const nDate = a.textColumns.filter(
    (c) => (a.textColumnRoles.get(c) ?? "text") === "date",
  ).length;

  // 1. Find binary categorical/boolean columns for Bayesian updating
  const binaryColName = a.headers.find((h) => {
    if (a.textColumnRoles.get(h) === "boolean") return true;
    if (a.textColumnRoles.get(h) === "categorical" && a.categoricalGroupCounts.get(h) === 2) return true;
    return false;
  });

  // 2. Find the most skewed numeric column for QQ Plot & Bootstrap
  let skewedCol: ColumnStats | undefined = undefined;
  let maxSkewMagnitude = 0;
  for (const col of a.columns) {
    const skewMag = Math.abs(col.skewness);
    if ((skewMag >= 1.0 || Math.abs(col.kurtosis) >= 2.0) && skewMag > maxSkewMagnitude) {
      skewedCol = col;
      maxSkewMagnitude = skewMag;
    }
  }

  // 3. Find the best potential confounder triplet (X, Y, Z) for Causal Inference
  let bestTriplet: { x: string; y: string; z: string; score: number } | undefined = undefined;
  if (a.correlations && a.correlations.length > 0 && nNum >= 3) {
    const corrMap = new Map<string, number>();
    for (const c of a.correlations) {
      corrMap.set(`${c.col1}|${c.col2}`, c.r);
      corrMap.set(`${c.col2}|${c.col1}`, c.r);
    }
    const getCorr = (col1: string, col2: string) => corrMap.get(`${col1}|${col2}`) ?? 0;
    const numColNames = a.columns.map((c) => c.name);

    for (let i = 0; i < numColNames.length; i++) {
      for (let j = i + 1; j < numColNames.length; j++) {
        for (let k = 0; k < numColNames.length; k++) {
          if (k === i || k === j) continue;
          const xName = numColNames[i];
          const yName = numColNames[j];
          const zName = numColNames[k];
          const rXY = getCorr(xName, yName);
          const rXZ = getCorr(xName, zName);
          const rYZ = getCorr(yName, zName);

          if (Math.abs(rXY) >= 0.25 && Math.abs(rXZ) >= 0.35 && Math.abs(rYZ) >= 0.35) {
            const score = 0.88 + Math.min(Math.abs(rXZ), Math.abs(rYZ)) * 0.05;
            if (!bestTriplet || score > bestTriplet.score) {
              bestTriplet = { x: xName, y: yName, z: zName, score };
            }
          }
        }
      }
    }
  }

  // 4. Find the strongest linear correlation pair
  let bestCorrPair: { col1: string; col2: string; r: number } | undefined = undefined;
  if (a.correlations && a.correlations.length > 0) {
    for (const c of a.correlations) {
      if (Math.abs(c.r) >= 0.3) {
        if (!bestCorrPair || Math.abs(c.r) > Math.abs(bestCorrPair.r)) {
          bestCorrPair = c;
        }
      }
    }
  }

  // ── Build Scored Suggestions ─────────────────────────────────────────
  type ScoredSuggestion = Suggestion & { relevance: number };
  const candidates: ScoredSuggestion[] = [];

  // A. Temporal Analysis & Autocorrelation
  const isTemp = nDate >= 1 && nNum >= 1;
  const isSeq = isSequentialColumn(a);
  if (isTemp || isSeq) {
    candidates.push({
      Icon: Clock,
      title: "Temporal Trends & Forecasting",
      subtitle: isTemp
        ? "Date column detected. Analyze time-dependent trends, ACF, and fit AR(1) models."
        : "First column appears to be a sequential time index. Plot trends and inspect serial correlation.",
      buttons: [
        { toolId: "time-series", label: "Time Series" },
        { toolId: "line-chart", label: "Line Chart" },
      ],
      relevance: isTemp ? 0.95 : 0.90,
    });
  }

  // B. Causal Confounding
  if (bestTriplet) {
    candidates.push({
      Icon: GitBranch,
      title: `Causal Confounding: ${bestTriplet.x} & ${bestTriplet.y}`,
      subtitle: `Confounder suspected: "${bestTriplet.z}" correlates with both "${bestTriplet.x}" and "${bestTriplet.y}". Adjust confounding bias with Causal Inference.`,
      buttons: [
        { toolId: "causal", label: "Causal Inference" },
        { toolId: "linear-regression", label: "OLS Regression" },
      ],
      relevance: bestTriplet.score,
    });
  }

  // C. Linear Regression & Bivariate Trends
  if (bestCorrPair) {
    candidates.push({
      Icon: TrendingUp,
      title: `Linear Modeling: Predict ${bestCorrPair.col2} from ${bestCorrPair.col1}`,
      subtitle: `Significant linear relationship (r = ${bestCorrPair.r.toFixed(2)}). Fit Ordinary Least Squares (OLS) line and plot predictions.`,
      buttons: [
        { toolId: "linear-regression", label: "Linear Regression" },
        { toolId: "scatter", label: "Scatter" },
      ],
      relevance: 0.70 + Math.abs(bestCorrPair.r) * 0.20,
    });
  }

  // D. Group Comparison (T-Test / ANOVA)
  if (nNum >= 1 && nCat >= 1) {
    const numCol = a.columns[0]?.name ?? "value";
    const catCol = a.textColumns.find(
      (c) => a.textColumnRoles.get(c) === "categorical",
    ) ?? a.textColumns[0];
    const k = a.categoricalGroupCounts.get(catCol) ?? 2;
    candidates.push({
      Icon: BarChart3,
      title: `Group Comparison: ${numCol} by ${catCol}`,
      subtitle: `${k} distinct categories detected. Run Hypothesis Testing (${k === 2 ? "T-Test" : "ANOVA"}) to compare group means.`,
      buttons: [
        { toolId: "hypothesis-test", label: "Hypothesis Testing" },
        { toolId: "violin", label: "Violin Plot" },
      ],
      relevance: 0.82,
    });
  }

  // E. Multivariate Dimension Reduction
  if (nNum >= 4) {
    candidates.push({
      Icon: Grid3x3,
      title: "Multivariate Variance & PCA",
      subtitle: `Analyze the covariance structure across all ${nNum} numeric columns using Principal Component Analysis (PCA).`,
      buttons: [
        { toolId: "pca", label: "PCA / Biplot" },
        { toolId: "heatmap", label: "Correlation Heatmap" },
      ],
      relevance: 0.75 + Math.min(0.10, nNum * 0.01),
    });
  }

  // F. Skewness & Non-Normality Fit
  if (skewedCol) {
    candidates.push({
      Icon: Activity,
      title: `Distribution Shape: ${skewedCol.name}`,
      subtitle: `Severe skewness (${skewedCol.skewness.toFixed(2)}) detected. Assess fit with Q-Q Plot or use Bootstrap for robust intervals.`,
      buttons: [
        { toolId: "qq-plot", label: "Q-Q Plot" },
        { toolId: "bootstrap-sampling", label: "Bootstrap Sampling" },
      ],
      relevance: 0.72 + Math.min(0.10, Math.abs(skewedCol.skewness) * 0.05),
    });
  }

  // G. Small Sample Uncertainty Resampling
  if (a.rowCount > 0 && a.rowCount < 50 && nNum >= 1) {
    candidates.push({
      Icon: Shuffle,
      title: `Small-Sample Uncertainty (n = ${a.rowCount})`,
      subtitle: "Limited sample size. Resample via Bootstrap to estimate parameter distributions without asymptotic assumptions.",
      buttons: [
        { toolId: "bootstrap-sampling", label: "Bootstrap Sampling" },
        { toolId: "power-calculator", label: "Power & Sample Size" },
      ],
      relevance: 0.65 + (50 - a.rowCount) * 0.004,
    });
  }

  // H. Bayesian Binary Rate Estimation
  if (binaryColName) {
    candidates.push({
      Icon: Dices,
      title: `Bayesian Rate Estimation for ${binaryColName}`,
      subtitle: "Binary responses detected. Model success probability using Beta-Binomial prior updating.",
      buttons: [
        { toolId: "bayesian", label: "Bayesian Inference" },
        { toolId: "hypothesis-test", label: "Proportion Test" },
      ],
      relevance: 0.68,
    });
  }

  // Sort candidates by relevance descending, clean up relevance field, and return top 4
  candidates.sort((x, y) => y.relevance - x.relevance);
  return candidates.map((c) => ({
    Icon: c.Icon,
    title: c.title,
    subtitle: c.subtitle,
    buttons: c.buttons,
  })).slice(0, 4);
}

/* ── Sequential-column detection helpers ─────────────────────────────── */

function isSequentialColumn(a: AnalysisResult): boolean {
  if (a.headers.length === 0 || a.sampleRows.length < 3) return false;
  const firstName = a.headers[0];
  const numericCol = a.columns.find((c) => c.name === firstName);
  if (!numericCol) {
    const vals = a.sampleRows
      .map((r) => Number(r[0]))
      .filter((v) => Number.isFinite(v));
    return checkSequential(vals);
  }
  if (numericCol.count >= 3) {
    const span = numericCol.max - numericCol.min;
    if (span <= 0) return false;
    const step = span / (numericCol.count - 1);
    if (
      Math.abs(step - 1) < 0.01 &&
      Math.abs(numericCol.min - Math.round(numericCol.min)) < 0.01
    ) return true;
  }
  return false;
}

function checkSequential(vals: number[]): boolean {
  if (vals.length < 3) return false;
  const diffs: number[] = [];
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);
  if (diffs.length === 0) return false;
  const first = diffs[0];
  if (first === 0) return false;
  return diffs.every(
    (d) => Math.abs(d - first) < 1e-6 * Math.max(1, Math.abs(first)),
  );
}

/* ── Formatting utilities ────────────────────────────────────────────── */

export function fmt(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e6) return String(n);
  if (Math.abs(n) < 0.01 && n !== 0) return n.toExponential(2);
  return n.toFixed(2);
}

export function formatCell(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e9) return String(n);
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(2);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  return n.toFixed(3);
}

export function stripEmoji(text: string): string {
  if (!text) return text;
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/️/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Export helpers ──────────────────────────────────────────────────── */

/** Generate a template CSV with just the headers + 3 empty example rows. */
export function generateTemplateCsv(headers: string[]): string {
  const header = headers.join(",");
  const emptyRow = headers.map(() => "").join(",");
  return [header, emptyRow, emptyRow, emptyRow].join("\n");
}

/** Export warnings as a downloadable CSV report. */
export function generateWarningsCsv(warnings: ParseWarning[]): string {
  const headerRow = "Row,Column,Kind,Detail,RawValue";
  const rows = warnings.map((w) =>
    [
      w.row,
      w.col ?? "",
      w.kind,
      `"${w.detail.replace(/"/g, '""')}"`,
      `"${(w.rawValue ?? "").replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [headerRow, ...rows].join("\n");
}
