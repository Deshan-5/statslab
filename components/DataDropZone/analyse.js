"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferTextColumnRole = inferTextColumnRole;
exports.singleColumnAnalysis = singleColumnAnalysis;
exports.analyzeCSV = analyzeCSV;
exports.parseAndAnalyse = parseAndAnalyse;
exports.buildSuggestions = buildSuggestions;
exports.fmt = fmt;
exports.formatCell = formatCell;
exports.stripEmoji = stripEmoji;
exports.generateTemplateCsv = generateTemplateCsv;
exports.generateWarningsCsv = generateWarningsCsv;
/**
 * DataDropZone/analyse.ts
 *
 * Pure functions — no React, no hooks, no side-effects.
 * Industry-grade quality layer: injection detection, IQR outlier fencing,
 * missing-value accounting, smart column role inference, composite health scoring.
 */
var stats_1 = require("@/components/tools/shared/stats");
var lucide_react_1 = require("lucide-react");
/* ── Constants ───────────────────────────────────────────────────────── */
/** CSV injection trigger characters (OWASP standard). */
var INJECTION_CHARS = ["=", "+", "-", "@", "\t", "\r"];
/** Missing-value sentinel strings (case-insensitive). */
var MISSING_SENTINELS = new Set([
    "na", "n/a", "null", "nan", "none", "nil", "missing", "", ".", "..", "--",
]);
/** Boolean truthy/falsy value sets. */
var BOOL_TRUE = new Set(["true", "yes", "y", "1", "t", "on"]);
var BOOL_FALSE = new Set(["false", "no", "n", "0", "f", "off"]);
/** UUID v4 pattern. */
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/* ── Column role inference ───────────────────────────────────────────── */
/**
 * Infer the semantic role of a non-numeric column from its raw string values.
 * Returns the role that best describes the column's content.
 */
function inferTextColumnRole(values, totalRows) {
    var nonNull = values.filter(function (v) { return v !== null && v.trim() !== ""; });
    if (nonNull.length === 0)
        return "text";
    // Boolean check — all non-empty values must be in the bool sets.
    var allBool = nonNull.every(function (v) {
        var lower = v.toLowerCase().trim();
        return BOOL_TRUE.has(lower) || BOOL_FALSE.has(lower);
    });
    if (allBool)
        return "boolean";
    // UUID check — any UUID-pattern value → likely an ID column.
    if (nonNull.some(function (v) { return UUID_RE.test(v.trim()); }))
        return "id_like";
    // Date check — try Date.parse on a sample.
    var sample = nonNull.slice(0, Math.min(50, nonNull.length));
    var dateParseable = sample.filter(function (v) {
        var d = Date.parse(v.trim());
        return !isNaN(d) && d > -2e12 && d < 4e12; // within ~1900–2100 range
    });
    if (dateParseable.length / sample.length >= 0.7)
        return "date";
    // ID-like check: high cardinality (>90% unique) or monotonically numeric strings.
    var unique = new Set(nonNull.map(function (v) { return v.toLowerCase().trim(); }));
    if (unique.size / totalRows > 0.9)
        return "id_like";
    // Categorical: low cardinality (≤50 unique values) relative to size.
    if (unique.size <= 50 || unique.size / nonNull.length <= 0.3)
        return "categorical";
    return "text";
}
function computeFences(sorted) {
    if (sorted.length < 4) {
        return { lowerFence: -Infinity, upperFence: Infinity, outlierCount: 0 };
    }
    var q1 = (0, stats_1.quantile)(sorted, 0.25);
    var q3 = (0, stats_1.quantile)(sorted, 0.75);
    var iqrVal = q3 - q1;
    var lowerFence = q1 - 1.5 * iqrVal;
    var upperFence = q3 + 1.5 * iqrVal;
    var outlierCount = sorted.filter(function (v) { return v < lowerFence || v > upperFence; }).length;
    return { lowerFence: lowerFence, upperFence: upperFence, outlierCount: outlierCount };
}
/* ── CSV injection detection ─────────────────────────────────────────── */
/**
 * Scan all cells for CSV injection patterns.
 * Returns count of sanitized cells and appends warnings.
 *
 * Note: we scan but do NOT mutate the data — the workspace keeps raw values.
 * Warnings are surfaced in the quality report so the user can inspect them.
 */
function detectInjections(rows, headers, warnings) {
    var count = 0;
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        for (var c = 0; c < row.length; c++) {
            var cell = row[c];
            if (!cell || cell.length === 0)
                continue;
            if (INJECTION_CHARS.includes(cell[0])) {
                count++;
                warnings.push({
                    row: r + 1,
                    col: headers[c],
                    kind: "injection",
                    detail: "Cell starts with \"".concat(cell[0], "\" \u2014 potential formula injection."),
                    rawValue: cell.slice(0, 40),
                });
            }
        }
    }
    return count;
}
/* ── Duplicate row detection ─────────────────────────────────────────── */
function countDuplicateRows(rows) {
    var seen = new Set();
    var dupes = 0;
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        var key = row.join("\x00");
        if (seen.has(key))
            dupes++;
        else
            seen.add(key);
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
function columnQualityScore(missingRate, outlierRate) {
    var missingDeduction = Math.min(40, missingRate * 100 * 0.4);
    var outlierDeduction = Math.min(20, outlierRate * 100 * 0.2);
    return Math.max(0, Math.round(100 - missingDeduction - outlierDeduction));
}
/* ── Overall quality scoring ─────────────────────────────────────────── */
function gradeScore(score) {
    if (score >= 90)
        return "Excellent";
    if (score >= 75)
        return "Good";
    if (score >= 60)
        return "Fair";
    if (score >= 40)
        return "Poor";
    return "Critical";
}
function computeOverallQuality(columns, injectionCount, duplicateRows, totalRows, warnings, delimiter, hasBOM) {
    // Completeness: average of (1 - missingRate) across all numeric columns.
    var completeness = columns.length === 0
        ? 100
        : Math.round((columns.reduce(function (sum, c) { return sum + (1 - c.missingRate); }, 0) / columns.length) * 100);
    // Base score = average of per-column quality scores.
    var baseScore = columns.length === 0
        ? 90
        : columns.reduce(function (sum, c) { return sum + c.qualityScore; }, 0) / columns.length;
    // Deductions
    var injectionPenalty = Math.min(20, injectionCount * 5);
    var dupePenalty = totalRows > 0 ? Math.min(10, (duplicateRows / totalRows) * 20) : 0;
    var score = Math.max(0, Math.round(baseScore - injectionPenalty - dupePenalty));
    return {
        score: score,
        grade: gradeScore(score),
        completeness: completeness,
        injectionCount: injectionCount,
        duplicateRows: duplicateRows,
        warnings: warnings.slice(0, 100), // cap displayed warnings
        delimiter: delimiter,
        hasBOM: hasBOM,
    };
}
/* ── Single-column (flat number array) analysis ──────────────────────── */
function singleColumnAnalysis(nums) {
    var sorted = __spreadArray([], nums, true).sort(function (a, b) { return a - b; });
    var _a = computeFences(sorted), lowerFence = _a.lowerFence, upperFence = _a.upperFence, outlierCount = _a.outlierCount;
    var col = {
        name: "Values",
        count: nums.length,
        mean: (0, stats_1.mean)(nums),
        median: (0, stats_1.median)(nums),
        sd: (0, stats_1.sd)(nums),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        skewness: (0, stats_1.skewness)(nums),
        kurtosis: (0, stats_1.kurtosis)(nums),
        distribution: (0, stats_1.detectDistribution)(nums),
        missingCount: 0,
        missingRate: 0,
        outlierCount: outlierCount,
        lowerFence: lowerFence,
        upperFence: upperFence,
        qualityScore: columnQualityScore(0, outlierCount / nums.length),
        role: "numeric",
    };
    var quality = {
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
        sampleRows: nums.slice(0, 5).map(function (n) { return [String(n)]; }),
        numericColumnsByName: ["Values"],
        quality: quality,
    };
}
/* ── CSV analysis ────────────────────────────────────────────────────── */
function analyzeCSV(csv, qualityOverride) {
    var warnings = [];
    var columns = [];
    var numCols = Array.from(csv.numericColumns.entries());
    var numColNames = new Set(csv.numericColumns.keys());
    var textColNames = csv.headers.filter(function (h) { return !numColNames.has(h); });
    // ── Numeric column analysis with quality metrics ─────────────────────
    for (var _i = 0, numCols_1 = numCols; _i < numCols_1.length; _i++) {
        var _a = numCols_1[_i], name_1 = _a[0], vals = _a[1];
        var sorted = __spreadArray([], vals, true).sort(function (a, b) { return a - b; });
        var colIdx = csv.headers.indexOf(name_1);
        // Count missing values for this column across all rows.
        var missingCount = 0;
        if (colIdx >= 0) {
            for (var _b = 0, _c = csv.rows; _b < _c.length; _b++) {
                var row = _c[_b];
                var cell = row[colIdx];
                var isBlank = cell === null || cell === undefined || cell === "";
                var isSentinel = typeof cell === "string" && MISSING_SENTINELS.has(cell.toLowerCase().trim());
                if (isBlank || isSentinel)
                    missingCount++;
            }
        }
        var totalRows = csv.rowCount;
        var missingRate = totalRows > 0 ? missingCount / totalRows : 0;
        var _d = computeFences(sorted), lowerFence = _d.lowerFence, upperFence = _d.upperFence, outlierCount = _d.outlierCount;
        var outlierRate = vals.length > 0 ? outlierCount / vals.length : 0;
        columns.push({
            name: name_1,
            count: vals.length,
            mean: (0, stats_1.mean)(vals),
            median: (0, stats_1.median)(vals),
            sd: (0, stats_1.sd)(vals),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            skewness: (0, stats_1.skewness)(vals),
            kurtosis: (0, stats_1.kurtosis)(vals),
            distribution: (0, stats_1.detectDistribution)(vals),
            missingCount: missingCount,
            missingRate: missingRate,
            outlierCount: outlierCount,
            lowerFence: lowerFence,
            upperFence: upperFence,
            qualityScore: columnQualityScore(missingRate, outlierRate),
            role: "numeric",
        });
    }
    // ── Categorical columns + role inference ─────────────────────────────
    var categoricalGroupCounts = new Map();
    var textColumnRoles = new Map();
    var _loop_1 = function (colName) {
        var colIdx = csv.headers.indexOf(colName);
        if (colIdx < 0)
            return "continue";
        var rawValues = csv.rows.map(function (row) { var _a; return (_a = row[colIdx]) !== null && _a !== void 0 ? _a : null; });
        var role = inferTextColumnRole(rawValues, csv.rowCount);
        textColumnRoles.set(colName, role);
        var seen = new Set();
        for (var _h = 0, rawValues_1 = rawValues; _h < rawValues_1.length; _h++) {
            var v = rawValues_1[_h];
            if (v !== null && v !== undefined && v !== "")
                seen.add(String(v));
        }
        categoricalGroupCounts.set(colName, seen.size);
    };
    for (var _e = 0, textColNames_1 = textColNames; _e < textColNames_1.length; _e++) {
        var colName = textColNames_1[_e];
        _loop_1(colName);
    }
    // ── Pairwise correlations (cap at 10 columns to avoid O(n²) blowup) ──
    var correlations = [];
    if (numCols.length >= 2 && numCols.length <= 10) {
        for (var i = 0; i < numCols.length; i++) {
            for (var j = i + 1; j < numCols.length; j++) {
                var _f = numCols[i], n1 = _f[0], v1 = _f[1];
                var _g = numCols[j], n2 = _g[0], v2 = _g[1];
                var minLen = Math.min(v1.length, v2.length);
                if (minLen >= 3) {
                    var r = (0, stats_1.pearsonR)(v1.slice(0, minLen), v2.slice(0, minLen));
                    correlations.push({ col1: n1, col2: n2, r: r });
                }
            }
        }
    }
    // ── Assemble quality report ───────────────────────────────────────────
    var quality = qualityOverride !== null && qualityOverride !== void 0 ? qualityOverride : computeOverallQuality(columns, 0, 0, csv.rowCount, warnings, ",", false);
    return {
        columns: columns,
        textColumns: textColNames,
        textColumnRoles: textColumnRoles,
        categoricalGroupCounts: categoricalGroupCounts,
        correlations: correlations.length > 0 ? correlations : undefined,
        rowCount: csv.rowCount,
        colCount: csv.colCount,
        headers: csv.headers,
        sampleRows: csv.rows.slice(0, 5),
        numericColumnsByName: numCols.map(function (_a) {
            var n = _a[0];
            return n;
        }),
        quality: quality,
    };
}
function parseAndAnalyse(text, name) {
    var _a, _b;
    // ── 1. Flat number array shortcut ─────────────────────────────────────
    var nums = (0, stats_1.parseNumbers)(text);
    var lineCount = text.trim().split(/\r?\n/).filter(function (l) { return l.trim(); }).length;
    var hasMultiCol = ((_a = text.trim().split(/\r?\n/)[0]) === null || _a === void 0 ? void 0 : _a.split(/[,\t;]/).length) > 1;
    var numsLooksFlat = nums && nums.length >= 2 && (!hasMultiCol || lineCount <= 1);
    if (numsLooksFlat) {
        var result = singleColumnAnalysis(nums);
        var csvText = __spreadArray(["Values"], nums.map(String), true).join("\n");
        return { kind: "ok", result: result, csvText: csvText };
    }
    // ── 2. Full CSV parsing with quality analysis ─────────────────────────
    var hasBOM = text.startsWith("\uFEFF");
    var cleanText = hasBOM ? text.slice(1) : text;
    var csv = (0, stats_1.parseCSV)(cleanText);
    if (csv && csv.rowCount >= 1 && csv.colCount >= 1) {
        // Run injection scanner and duplicate counter on the raw rows.
        var warnings = [];
        var injectionCount = detectInjections(csv.rows, csv.headers, warnings);
        var duplicateRows = countDuplicateRows(csv.rows);
        // Detect delimiter from the text (mirrors what parseCSV does internally).
        var firstLine = (_b = cleanText.split(/\r?\n/).find(function (l) { return l.trim(); })) !== null && _b !== void 0 ? _b : "";
        var countUnquoted = function (line, d) {
            var n = 0, inQ = false;
            for (var _i = 0, line_1 = line; _i < line_1.length; _i++) {
                var ch = line_1[_i];
                if (ch === '"')
                    inQ = !inQ;
                else if (!inQ && ch === d)
                    n++;
            }
            return n;
        };
        var candidates = ([
            ["\t", countUnquoted(firstLine, "\t")],
            [",", countUnquoted(firstLine, ",")],
            [";", countUnquoted(firstLine, ";")],
            ["|", countUnquoted(firstLine, "|")],
        ]).sort(function (a, b) { return b[1] - a[1]; });
        var delimiter = candidates[0][1] > 0 ? candidates[0][0] : ",";
        // Build the quality info.
        var columns = []; // filled by analyzeCSV below
        var tempResult = analyzeCSV(csv);
        var quality = computeOverallQuality(tempResult.columns, injectionCount, duplicateRows, csv.rowCount, warnings, delimiter === "\t" ? "\\t" : delimiter, hasBOM);
        // Rebuild with the real quality object injected.
        var finalResult = analyzeCSV(csv, quality);
        return { kind: "ok", result: finalResult, csvText: cleanText };
    }
    // ── 3. Fallback: flat numbers that look multi-col ─────────────────────
    if (nums && nums.length >= 2) {
        var result = singleColumnAnalysis(nums);
        var csvText = __spreadArray(["Values"], nums.map(String), true).join("\n");
        return { kind: "ok", result: result, csvText: csvText };
    }
    return {
        kind: "error",
        message: "Could not parse data. Try CSV, TSV, or space/comma separated numbers.",
    };
}
/* ── Rule-based suggestion engine ───────────────────────────────────── */
function buildSuggestions(a) {
    var _a, _b, _c, _d;
    var nNum = a.columns.length;
    var nCat = a.textColumns.filter(function (c) { var _a; return ((_a = a.textColumnRoles.get(c)) !== null && _a !== void 0 ? _a : "text") === "categorical"; }).length;
    var nDate = a.textColumns.filter(function (c) { var _a; return ((_a = a.textColumnRoles.get(c)) !== null && _a !== void 0 ? _a : "text") === "date"; }).length;
    // 1. Find binary categorical/boolean columns for Bayesian updating
    var binaryColName = a.headers.find(function (h) {
        if (a.textColumnRoles.get(h) === "boolean")
            return true;
        if (a.textColumnRoles.get(h) === "categorical" && a.categoricalGroupCounts.get(h) === 2)
            return true;
        return false;
    });
    // 2. Find the most skewed numeric column for QQ Plot & Bootstrap
    var skewedCol = undefined;
    var maxSkewMagnitude = 0;
    for (var _i = 0, _e = a.columns; _i < _e.length; _i++) {
        var col = _e[_i];
        var skewMag = Math.abs(col.skewness);
        if ((skewMag >= 1.0 || Math.abs(col.kurtosis) >= 2.0) && skewMag > maxSkewMagnitude) {
            skewedCol = col;
            maxSkewMagnitude = skewMag;
        }
    }
    // 3. Find the best potential confounder triplet (X, Y, Z) for Causal Inference
    var bestTriplet = undefined;
    if (a.correlations && a.correlations.length > 0 && nNum >= 3) {
        var corrMap_1 = new Map();
        for (var _f = 0, _g = a.correlations; _f < _g.length; _f++) {
            var c = _g[_f];
            corrMap_1.set("".concat(c.col1, "|").concat(c.col2), c.r);
            corrMap_1.set("".concat(c.col2, "|").concat(c.col1), c.r);
        }
        var getCorr = function (col1, col2) { var _a; return (_a = corrMap_1.get("".concat(col1, "|").concat(col2))) !== null && _a !== void 0 ? _a : 0; };
        var numColNames = a.columns.map(function (c) { return c.name; });
        for (var i = 0; i < numColNames.length; i++) {
            for (var j = i + 1; j < numColNames.length; j++) {
                for (var k = 0; k < numColNames.length; k++) {
                    if (k === i || k === j)
                        continue;
                    var xName = numColNames[i];
                    var yName = numColNames[j];
                    var zName = numColNames[k];
                    var rXY = getCorr(xName, yName);
                    var rXZ = getCorr(xName, zName);
                    var rYZ = getCorr(yName, zName);
                    if (Math.abs(rXY) >= 0.25 && Math.abs(rXZ) >= 0.35 && Math.abs(rYZ) >= 0.35) {
                        var score = 0.88 + Math.min(Math.abs(rXZ), Math.abs(rYZ)) * 0.05;
                        if (!bestTriplet || score > bestTriplet.score) {
                            bestTriplet = { x: xName, y: yName, z: zName, score: score };
                        }
                    }
                }
            }
        }
    }
    // 4. Find the strongest linear correlation pair
    var bestCorrPair = undefined;
    if (a.correlations && a.correlations.length > 0) {
        for (var _h = 0, _j = a.correlations; _h < _j.length; _h++) {
            var c = _j[_h];
            if (Math.abs(c.r) >= 0.3) {
                if (!bestCorrPair || Math.abs(c.r) > Math.abs(bestCorrPair.r)) {
                    bestCorrPair = c;
                }
            }
        }
    }
    var candidates = [];
    // A. Temporal Analysis & Autocorrelation
    var isTemp = nDate >= 1 && nNum >= 1;
    var isSeq = isSequentialColumn(a);
    if (isTemp || isSeq) {
        candidates.push({
            Icon: lucide_react_1.Clock,
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
            Icon: lucide_react_1.GitBranch,
            title: "Causal Confounding: ".concat(bestTriplet.x, " & ").concat(bestTriplet.y),
            subtitle: "Confounder suspected: \"".concat(bestTriplet.z, "\" correlates with both \"").concat(bestTriplet.x, "\" and \"").concat(bestTriplet.y, "\". Adjust confounding bias with Causal Inference."),
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
            Icon: lucide_react_1.TrendingUp,
            title: "Linear Modeling: Predict ".concat(bestCorrPair.col2, " from ").concat(bestCorrPair.col1),
            subtitle: "Significant linear relationship (r = ".concat(bestCorrPair.r.toFixed(2), "). Fit Ordinary Least Squares (OLS) line and plot predictions."),
            buttons: [
                { toolId: "linear-regression", label: "Linear Regression" },
                { toolId: "scatter", label: "Scatter" },
            ],
            relevance: 0.70 + Math.abs(bestCorrPair.r) * 0.20,
        });
    }
    // D. Group Comparison (T-Test / ANOVA)
    if (nNum >= 1 && nCat >= 1) {
        var numCol = (_b = (_a = a.columns[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "value";
        var catCol = (_c = a.textColumns.find(function (c) { return a.textColumnRoles.get(c) === "categorical"; })) !== null && _c !== void 0 ? _c : a.textColumns[0];
        var k = (_d = a.categoricalGroupCounts.get(catCol)) !== null && _d !== void 0 ? _d : 2;
        candidates.push({
            Icon: lucide_react_1.BarChart3,
            title: "Group Comparison: ".concat(numCol, " by ").concat(catCol),
            subtitle: "".concat(k, " distinct categories detected. Run Hypothesis Testing (").concat(k === 2 ? "T-Test" : "ANOVA", ") to compare group means."),
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
            Icon: lucide_react_1.Grid3x3,
            title: "Multivariate Variance & PCA",
            subtitle: "Analyze the covariance structure across all ".concat(nNum, " numeric columns using Principal Component Analysis (PCA)."),
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
            Icon: lucide_react_1.Activity,
            title: "Distribution Shape: ".concat(skewedCol.name),
            subtitle: "Severe skewness (".concat(skewedCol.skewness.toFixed(2), ") detected. Assess fit with Q-Q Plot or use Bootstrap for robust intervals."),
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
            Icon: lucide_react_1.Shuffle,
            title: "Small-Sample Uncertainty (n = ".concat(a.rowCount, ")"),
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
            Icon: lucide_react_1.Dices,
            title: "Bayesian Rate Estimation for ".concat(binaryColName),
            subtitle: "Binary responses detected. Model success probability using Beta-Binomial prior updating.",
            buttons: [
                { toolId: "bayesian", label: "Bayesian Inference" },
                { toolId: "hypothesis-test", label: "Proportion Test" },
            ],
            relevance: 0.68,
        });
    }
    // Sort candidates by relevance descending, clean up relevance field, and return top 4
    candidates.sort(function (x, y) { return y.relevance - x.relevance; });
    return candidates.map(function (c) { return ({
        Icon: c.Icon,
        title: c.title,
        subtitle: c.subtitle,
        buttons: c.buttons,
    }); }).slice(0, 4);
}
/* ── Sequential-column detection helpers ─────────────────────────────── */
function isSequentialColumn(a) {
    if (a.headers.length === 0 || a.sampleRows.length < 3)
        return false;
    var firstName = a.headers[0];
    var numericCol = a.columns.find(function (c) { return c.name === firstName; });
    if (!numericCol) {
        var vals = a.sampleRows
            .map(function (r) { return Number(r[0]); })
            .filter(function (v) { return Number.isFinite(v); });
        return checkSequential(vals);
    }
    if (numericCol.count >= 3) {
        var span = numericCol.max - numericCol.min;
        if (span <= 0)
            return false;
        var step = span / (numericCol.count - 1);
        if (Math.abs(step - 1) < 0.01 &&
            Math.abs(numericCol.min - Math.round(numericCol.min)) < 0.01)
            return true;
    }
    return false;
}
function checkSequential(vals) {
    if (vals.length < 3)
        return false;
    var diffs = [];
    for (var i = 1; i < vals.length; i++)
        diffs.push(vals[i] - vals[i - 1]);
    if (diffs.length === 0)
        return false;
    var first = diffs[0];
    if (first === 0)
        return false;
    return diffs.every(function (d) { return Math.abs(d - first) < 1e-6 * Math.max(1, Math.abs(first)); });
}
/* ── Formatting utilities ────────────────────────────────────────────── */
function fmt(n) {
    if (Number.isInteger(n) && Math.abs(n) < 1e6)
        return String(n);
    if (Math.abs(n) < 0.01 && n !== 0)
        return n.toExponential(2);
    return n.toFixed(2);
}
function formatCell(n) {
    if (Number.isInteger(n) && Math.abs(n) < 1e9)
        return String(n);
    if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0))
        return n.toExponential(2);
    if (Math.abs(n) >= 100)
        return n.toFixed(1);
    return n.toFixed(3);
}
function stripEmoji(text) {
    if (!text)
        return text;
    return text
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/️/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}
/* ── Export helpers ──────────────────────────────────────────────────── */
/** Generate a template CSV with just the headers + 3 empty example rows. */
function generateTemplateCsv(headers) {
    var header = headers.join(",");
    var emptyRow = headers.map(function () { return ""; }).join(",");
    return [header, emptyRow, emptyRow, emptyRow].join("\n");
}
/** Export warnings as a downloadable CSV report. */
function generateWarningsCsv(warnings) {
    var headerRow = "Row,Column,Kind,Detail,RawValue";
    var rows = warnings.map(function (w) {
        var _a, _b;
        return [
            w.row,
            (_a = w.col) !== null && _a !== void 0 ? _a : "",
            w.kind,
            "\"".concat(w.detail.replace(/"/g, '""'), "\""),
            "\"".concat(((_b = w.rawValue) !== null && _b !== void 0 ? _b : "").replace(/"/g, '""'), "\""),
        ].join(",");
    });
    return __spreadArray([headerRow], rows, true).join("\n");
}
