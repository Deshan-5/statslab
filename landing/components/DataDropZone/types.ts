/**
 * DataDropZone/types.ts
 * Pure TypeScript types — no React, no imports. Safe to import anywhere.
 */
import type { DistributionGuess } from "@/components/tools/shared/stats";
import type { BarChart3, TrendingUp, Activity, Grid3x3, Clock, Brain, Dices, GitBranch, Shuffle } from "lucide-react";

/* ── Column role inference ───────────────────────────────────────────── */

/**
 * Inferred semantic role of a column, beyond just numeric/text.
 * - numeric:     parseable as float, used for all stat calculations
 * - boolean:     values are a subset of {true/false/yes/no/1/0/y/n}
 * - date:        >70% of values parse as recognizable dates
 * - categorical: low-cardinality text (≤50 unique values)
 * - id_like:     high-cardinality (>90% unique), monotonic, or UUID pattern
 * - text:        everything else
 */
export type ColumnRole = "numeric" | "boolean" | "date" | "categorical" | "id_like" | "text";

/* ── Per-column quality metrics ──────────────────────────────────────── */

export type ColumnStats = {
  name: string;
  count: number;          // non-missing numeric values
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  distribution: DistributionGuess;
  // Quality fields (always present after quality pass)
  missingCount: number;   // rows where this column is null/empty
  missingRate: number;    // 0–1
  outlierCount: number;   // values outside IQR fences
  lowerFence: number;     // Q1 − 1.5·IQR
  upperFence: number;     // Q3 + 1.5·IQR
  qualityScore: number;   // 0–100 per-column health
  role: ColumnRole;
};

/* ── Row-level parse warnings ────────────────────────────────────────── */

export type ParseWarningKind =
  | "injection"          // cell starts with = + - @ (CSV formula injection)
  | "wrong_col_count"   // row has fewer/more columns than header
  | "type_mismatch"     // cell in a numeric column is non-numeric
  | "missing_value";    // explicit NA/NULL/blank in a required column

export type ParseWarning = {
  row: number;           // 1-indexed data row (after header)
  col?: string;          // column name if relevant
  kind: ParseWarningKind;
  detail: string;        // human-readable description
  rawValue?: string;     // the offending cell value
};

/* ── Overall file quality report ─────────────────────────────────────── */

export type QualityGrade = "Excellent" | "Good" | "Fair" | "Poor" | "Critical";

export type DataQualityInfo = {
  score: number;             // 0–100 composite score
  grade: QualityGrade;       // label for the score
  completeness: number;      // 0–100: % of non-missing cells across ALL columns
  injectionCount: number;    // number of cells that were sanitized (CSV injection)
  duplicateRows: number;     // rows identical to another row
  warnings: ParseWarning[];  // row-level parse issues
  delimiter: string;         // delimiter detected (displayed to user)
  hasBOM: boolean;           // whether a byte-order mark was stripped
};

/* ── Analysis result ─────────────────────────────────────────────────── */

export type AnalysisResult = {
  columns: ColumnStats[];
  textColumns: string[];       // non-numeric column names
  textColumnRoles: Map<string, ColumnRole>; // role for each text column
  categoricalGroupCounts: Map<string, number>;
  correlations?: { col1: string; col2: string; r: number }[];
  rowCount: number;
  colCount: number;
  headers: string[];
  sampleRows: string[][];
  numericColumnsByName: string[];
  quality: DataQualityInfo;    // injected after parsing
};

export type SuggestionIcon =
  | typeof BarChart3
  | typeof TrendingUp
  | typeof Activity
  | typeof Grid3x3
  | typeof Clock
  | typeof Brain
  | typeof Dices
  | typeof GitBranch
  | typeof Shuffle;

export type Suggestion = {
  Icon: SuggestionIcon;
  title: string;
  subtitle: string;
  buttons: { toolId: string; label: string }[];
};
