/**
 * Pure statistical utility functions used across all tools.
 * No React — just math.
 */

// ─── Seeded PRNG ────────────────────────────────────────────────────────────
export function rngFor(seed: number) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng: () => number, mu = 0, sigma = 1) {
  const u = Math.max(rng(), 1e-9),
    v = rng();
  return (
    mu +
    sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  );
}

// ─── Descriptive Stats ──────────────────────────────────────────────────────
export function mean(arr: number[]) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function variance(arr: number[], ddof = 1) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - ddof);
}

export function sd(arr: number[], ddof = 1) {
  return Math.sqrt(variance(arr, ddof));
}

export function sem(arr: number[]) {
  return sd(arr) / Math.sqrt(arr.length);
}

export function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

export function iqr(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return quantile(s, 0.75) - quantile(s, 0.25);
}

// ─── OLS Regression ─────────────────────────────────────────────────────────
export type RegressionResult = {
  slope: number;
  intercept: number;
  r2: number;
  adjR2: number;
  slopeStdErr: number;
  interceptStdErr: number;
  tSlope: number;
  tIntercept: number;
  pSlope: number;
  pIntercept: number;
  residuals: number[];
  fitted: number[];
};

export function ols(
  xs: number[],
  ys: number[]
): RegressionResult {
  const n = xs.length;
  const mx = mean(xs),
    my = mean(ys);
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;

  const fitted = xs.map((x) => intercept + slope * x);
  const residuals = ys.map((y, i) => y - fitted[i]);

  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const adjR2 = n <= 2 ? r2 : 1 - ((1 - r2) * (n - 1)) / (n - 2);

  const mse = n > 2 ? ssRes / (n - 2) : 0;
  const slopeStdErr = den === 0 ? 0 : Math.sqrt(mse / den);
  const interceptStdErr =
    n > 2
      ? Math.sqrt(
          mse * (1 / n + (mx * mx) / den)
        )
      : 0;

  const tSlope = slopeStdErr === 0 ? 0 : slope / slopeStdErr;
  const tIntercept =
    interceptStdErr === 0 ? 0 : intercept / interceptStdErr;

  const df = n - 2;
  const pSlope = df > 0 ? 2 * (1 - tCDF(Math.abs(tSlope), df)) : 1;
  const pIntercept =
    df > 0 ? 2 * (1 - tCDF(Math.abs(tIntercept), df)) : 1;

  return {
    slope,
    intercept,
    r2,
    adjR2,
    slopeStdErr,
    interceptStdErr,
    tSlope,
    tIntercept,
    pSlope,
    pIntercept,
    residuals,
    fitted,
  };
}

// ─── Distributions: CDF / PDF / critical values ─────────────────────────────
/** Standard normal PDF */
export function normalPDF(x: number, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Standard normal CDF via Horner rational approximation (Abramowitz & Stegun) */
export function normalCDF(x: number) {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/** Inverse normal CDF (rational approximation, Beasley-Springer-Moro) */
export function normalInv(p: number) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];
  const pLow = 0.02425,
    pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
          c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      )
    );
  }
}

/** Student's t CDF (numerical integration) */
export function tCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
}

/** t critical value (bisection on tCDF) */
export function tCrit(alpha: number, df: number): number {
  let lo = 0, hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (1 - tCDF(mid, df) < alpha / 2) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** z critical value */
export function zCrit(alpha: number): number {
  return -normalInv(alpha / 2);
}

/** Chi-square CDF (regularized incomplete gamma) */
export function chi2CDF(x: number, k: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(k / 2, x / 2);
}

/** Chi-square critical value (bisection) */
export function chi2Crit(alpha: number, df: number): number {
  let lo = 0, hi = df + 10 * Math.sqrt(2 * df);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (1 - chi2CDF(mid, df) < alpha) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ─── Special functions ──────────────────────────────────────────────────────
export function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return (
      Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
    );
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  // continued fraction (Lentz)
  let f = 1, c2 = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;
  for (let m = 1; m <= 200; m++) {
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c2 = 1 + num / c2; if (Math.abs(c2) < 1e-30) c2 = 1e-30;
    f *= d * c2;
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c2 = 1 + num / c2; if (Math.abs(c2) < 1e-30) c2 = 1e-30;
    const delta = d * c2;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return front * f;
}

export function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // series
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // continued fraction
  let f = 1, c2 = 1, d = 1 / (x + 1 - a);
  f = d;
  for (let n = 1; n < 200; n++) {
    const an = -n * (n - a);
    const bn = x + 2 * n + 1 - a;
    d = bn + an * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c2 = bn + an / c2; if (Math.abs(c2) < 1e-30) c2 = 1e-30;
    const delta = d * c2;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return 1 - f * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

// ─── Continuous distribution PDFs/CDFs ──────────────────────────────────────
export function uniformPDF(x: number, a: number, b: number) {
  return x >= a && x <= b ? 1 / (b - a) : 0;
}
export function uniformCDF(x: number, a: number, b: number) {
  if (x <= a) return 0;
  if (x >= b) return 1;
  return (x - a) / (b - a);
}

export function exponentialPDF(x: number, lambda: number) {
  return x < 0 ? 0 : lambda * Math.exp(-lambda * x);
}
export function exponentialCDF(x: number, lambda: number) {
  return x < 0 ? 0 : 1 - Math.exp(-lambda * x);
}

export function gammaPDF(x: number, k: number, theta: number) {
  if (x <= 0) return 0;
  return Math.exp(
    (k - 1) * Math.log(x) - x / theta - k * Math.log(theta) - lnGamma(k)
  );
}
export function gammaCDF(x: number, k: number, theta: number) {
  if (x <= 0) return 0;
  return regularizedGammaP(k, x / theta);
}

export function betaPDF(x: number, a: number, b: number) {
  if (x <= 0 || x >= 1) return 0;
  const lnB = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnB);
}
export function betaCDF(x: number, a: number, b: number) {
  return incompleteBeta(x, a, b);
}

export function lognormalPDF(x: number, mu: number, sigma: number) {
  if (x <= 0) return 0;
  const z = (Math.log(x) - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (x * sigma * Math.sqrt(2 * Math.PI));
}
export function lognormalCDF(x: number, mu: number, sigma: number) {
  if (x <= 0) return 0;
  return normalCDF((Math.log(x) - mu) / sigma);
}

export function chi2PDF(x: number, k: number) {
  if (x <= 0) return 0;
  return Math.exp(
    (k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2)
  );
}

export function tPDF(x: number, df: number) {
  const ln =
    lnGamma((df + 1) / 2) - lnGamma(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log(1 + (x * x) / df);
  return Math.exp(ln);
}

// ─── Discrete distribution PMFs/CDFs ────────────────────────────────────────
export function binomialPMF(k: number, n: number, p: number) {
  if (k < 0 || k > n || !Number.isInteger(k)) return 0;
  const ln =
    lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) +
    k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(ln);
}
export function binomialCDF(k: number, n: number, p: number) {
  const ki = Math.floor(k);
  if (ki < 0) return 0;
  if (ki >= n) return 1;
  let s = 0;
  for (let i = 0; i <= ki; i++) s += binomialPMF(i, n, p);
  return s;
}

export function poissonPMF(k: number, lambda: number) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  return Math.exp(k * Math.log(lambda) - lambda - lnGamma(k + 1));
}
export function poissonCDF(k: number, lambda: number) {
  const ki = Math.floor(k);
  if (ki < 0) return 0;
  let s = 0;
  for (let i = 0; i <= ki; i++) s += poissonPMF(i, lambda);
  return s;
}

/** Geometric on {1, 2, …} — number of trials until first success. */
export function geometricPMF(k: number, p: number) {
  if (k < 1 || !Number.isInteger(k)) return 0;
  return Math.pow(1 - p, k - 1) * p;
}
export function geometricCDF(k: number, p: number) {
  const ki = Math.floor(k);
  if (ki < 1) return 0;
  return 1 - Math.pow(1 - p, ki);
}

// ─── Hypothesis tests ───────────────────────────────────────────────────────
export type TestResult = {
  testStat: number;
  pValue: number;
  critValue: number;
  reject: boolean;
  effectSize?: number;
  df?: number;
};

/** One-sample z-test */
export function zTest(
  xbar: number, mu0: number, sigma: number, n: number,
  alpha: number, tail: "two" | "left" | "right"
): TestResult {
  const z = (xbar - mu0) / (sigma / Math.sqrt(n));
  const cv = zCrit(tail === "two" ? alpha : alpha * 2);
  let pValue: number;
  if (tail === "two") pValue = 2 * (1 - normalCDF(Math.abs(z)));
  else if (tail === "right") pValue = 1 - normalCDF(z);
  else pValue = normalCDF(z);
  return { testStat: z, pValue, critValue: cv, reject: pValue < alpha, effectSize: Math.abs(z) / Math.sqrt(n) };
}

/** One-sample t-test */
export function tTest(
  data: number[], mu0: number, alpha: number, tail: "two" | "left" | "right"
): TestResult {
  const n = data.length;
  const m = mean(data);
  const s = sd(data);
  const se = s / Math.sqrt(n);
  const t = se === 0 ? 0 : (m - mu0) / se;
  const df = n - 1;
  const cv = tCrit(tail === "two" ? alpha : alpha * 2, df);
  let pValue: number;
  if (tail === "two") pValue = 2 * (1 - tCDF(Math.abs(t), df));
  else if (tail === "right") pValue = 1 - tCDF(t, df);
  else pValue = tCDF(t, df);
  const d = se === 0 ? 0 : (m - mu0) / s;
  return { testStat: t, pValue, critValue: cv, reject: pValue < alpha, effectSize: Math.abs(d), df };
}

/** Two-sample Welch t-test */
export function welchTest(
  d1: number[], d2: number[], alpha: number, tail: "two" | "left" | "right"
): TestResult {
  const n1 = d1.length, n2 = d2.length;
  const m1 = mean(d1), m2 = mean(d2);
  const v1 = variance(d1), v2 = variance(d2);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = se === 0 ? 0 : (m1 - m2) / se;
  const numDf = (v1 / n1 + v2 / n2) ** 2;
  const denDf = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = denDf === 0 ? 1 : numDf / denDf;
  const cv = tCrit(tail === "two" ? alpha : alpha * 2, df);
  let pValue: number;
  if (tail === "two") pValue = 2 * (1 - tCDF(Math.abs(t), df));
  else if (tail === "right") pValue = 1 - tCDF(t, df);
  else pValue = tCDF(t, df);
  const pooledSD = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = pooledSD === 0 ? 0 : (m1 - m2) / pooledSD;
  return { testStat: t, pValue, critValue: cv, reject: pValue < alpha, effectSize: Math.abs(d), df };
}

/** Paired t-test */
export function pairedTTest(
  d1: number[], d2: number[], alpha: number, tail: "two" | "left" | "right"
): TestResult {
  const diffs = d1.map((v, i) => v - d2[i]);
  return tTest(diffs, 0, alpha, tail);
}

/** Chi-square goodness-of-fit test */
export function chi2GoF(
  observed: number[], expected: number[], alpha: number
): TestResult {
  const k = observed.length;
  let chi2 = 0;
  for (let i = 0; i < k; i++) {
    if (expected[i] > 0) chi2 += (observed[i] - expected[i]) ** 2 / expected[i];
  }
  const df = k - 1;
  const pValue = 1 - chi2CDF(chi2, df);
  const cv = chi2Crit(alpha, df);
  return { testStat: chi2, pValue, critValue: cv, reject: pValue < alpha, df };
}

/** One-way ANOVA F-test */
export function oneWayANOVA(groups: number[][], alpha: number): TestResult & { groupMeans: number[]; grandMean: number } {
  const allData = groups.flat();
  const grandMean = mean(allData);
  const k = groups.length;
  const N = allData.length;

  let ssBetween = 0;
  const groupMeans: number[] = [];
  for (const g of groups) {
    const gm = mean(g);
    groupMeans.push(gm);
    ssBetween += g.length * (gm - grandMean) ** 2;
  }

  let ssWithin = 0;
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      ssWithin += (v - groupMeans[i]) ** 2;
    }
  }

  const dfBetween = k - 1;
  const dfWithin = N - k;
  const msBetween = dfBetween === 0 ? 0 : ssBetween / dfBetween;
  const msWithin = dfWithin === 0 ? 0 : ssWithin / dfWithin;
  const F = msWithin === 0 ? 0 : msBetween / msWithin;

  // F-distribution CDF via regularized incomplete beta
  const pValue = dfBetween > 0 && dfWithin > 0
    ? 1 - incompleteBeta(dfWithin / (dfWithin + dfBetween * F), dfWithin / 2, dfBetween / 2)
    : 1;

  return {
    testStat: F,
    pValue,
    critValue: 0, // skipping F critical for simplicity
    reject: pValue < alpha,
    df: dfBetween,
    groupMeans,
    grandMean,
  };
}

// ─── Confidence Intervals ───────────────────────────────────────────────────
export type CIResult = {
  lower: number;
  upper: number;
  center: number;
  margin: number;
  se: number;
};

export function zCI(xbar: number, sigma: number, n: number, confidence: number): CIResult {
  const alpha = 1 - confidence;
  const z = zCrit(alpha);
  const se2 = sigma / Math.sqrt(n);
  const margin = z * se2;
  return { lower: xbar - margin, upper: xbar + margin, center: xbar, margin, se: se2 };
}

export function tCI(data: number[], confidence: number): CIResult {
  const n = data.length;
  const m = mean(data);
  const s = sd(data);
  const se2 = s / Math.sqrt(n);
  const alpha = 1 - confidence;
  const t = tCrit(alpha, n - 1);
  const margin = t * se2;
  return { lower: m - margin, upper: m + margin, center: m, margin, se: se2 };
}

// ─── Parsing helpers ────────────────────────────────────────────────────────
export function parseNumbers(text: string): number[] | null {
  const cleaned = text.replace(/\n/g, ",").replace(/\s+/g, ",");
  const tokens = cleaned.split(",").filter((s) => s.trim() !== "");
  const nums: number[] = [];
  for (const t of tokens) {
    const n = Number(t.trim());
    if (isNaN(n)) return null;
    nums.push(n);
  }
  return nums.length > 0 ? nums : null;
}

export function parsePairs(text: string): { x: number; y: number }[] | null {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const pairs: { x: number; y: number }[] = [];
  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const x = Number(parts[0]), y = Number(parts[1]);
      if (isNaN(x) || isNaN(y)) return null;
      pairs.push({ x, y });
    }
  }
  return pairs.length > 0 ? pairs : null;
}

// ─── KDE for violin/density ─────────────────────────────────────────────────
export function kde(data: number[], xs: number[], h: number): number[] {
  const norm = 1 / (data.length * h * Math.sqrt(2 * Math.PI));
  return xs.map((x) => {
    let s = 0;
    for (const d of data) s += Math.exp(-((x - d) ** 2) / (2 * h * h));
    return s * norm;
  });
}

export function silvermanBandwidth(data: number[]) {
  const s = sd(data);
  const n = data.length;
  return 1.06 * s * Math.pow(n, -0.2);
}

// ─── Sample correlation ─────────────────────────────────────────────────────
export function pearsonR(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx2 += (xs[i] - mx) ** 2;
    dy2 += (ys[i] - my) ** 2;
  }
  return dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2);
}

export function spearmanRho(xs: number[], ys: number[]) {
  const rank = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  };
  return pearsonR(rank(xs), rank(ys));
}

// ─── ACF ────────────────────────────────────────────────────────────────────
export function acf(series: number[], maxLag: number) {
  const n = series.length;
  const m = mean(series);
  const c0 = series.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  const out: number[] = [];
  for (let k = 0; k <= maxLag; k++) {
    let s = 0;
    for (let t = 0; t < n - k; t++) s += (series[t] - m) * (series[t + k] - m);
    out.push(s / n / c0);
  }
  return out;
}

// ─── Higher-order moments ───────────────────────────────────────────────────
/** Sample skewness (Fisher, adjusted) */
export function skewness(arr: number[]): number {
  const n = arr.length;
  if (n < 3) return 0;
  const m = mean(arr);
  const s = sd(arr);
  if (s === 0) return 0;
  const m3 = arr.reduce((a, v) => a + ((v - m) / s) ** 3, 0) / n;
  return (n * (n - 1)) / ((n - 1) * (n - 2)) === 0
    ? m3
    : (Math.sqrt(n * (n - 1)) / (n - 2)) * m3;
}

/** Sample excess kurtosis (Fisher definition, 0 for normal) */
export function kurtosis(arr: number[]): number {
  const n = arr.length;
  if (n < 4) return 0;
  const m = mean(arr);
  const s = sd(arr);
  if (s === 0) return 0;
  const m4 = arr.reduce((a, v) => a + ((v - m) / s) ** 4, 0) / n;
  // bias-adjusted Fisher kurtosis
  const k = ((n + 1) * (m4 - 3) + 6) * (n - 1) / ((n - 2) * (n - 3));
  return k;
}

// ─── Distribution detection ─────────────────────────────────────────────────
export type DistributionGuess = {
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

/** Heuristic distribution detection from descriptive stats */
export function detectDistribution(arr: number[]): DistributionGuess {
  if (arr.length < 5) return { name: "Unknown", confidence: "low", reason: "Too few data points" };
  const sk = skewness(arr);
  const ku = kurtosis(arr);
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const m = mean(arr);

  // Check for uniform: low kurtosis, near-zero skewness, values spread evenly
  const range = mx - mn;
  if (Math.abs(sk) < 0.3 && ku < -0.8 && range > 0) {
    return { name: "Uniform", confidence: "medium", reason: `Low kurtosis (${ku.toFixed(2)}), near-zero skew` };
  }

  // Check for exponential: strong right skew, min near 0
  if (sk > 1.5 && mn >= -0.01 * Math.abs(m)) {
    return { name: "Exponential", confidence: "medium", reason: `High right skew (${sk.toFixed(2)}), min near 0` };
  }

  // Check for normal: skew near 0, kurtosis near 0
  if (Math.abs(sk) < 0.5 && Math.abs(ku) < 1.0) {
    return { name: "Normal", confidence: "high", reason: `Skew ≈ ${sk.toFixed(2)}, kurtosis ≈ ${ku.toFixed(2)}` };
  }
  if (Math.abs(sk) < 1.0 && Math.abs(ku) < 2.0) {
    return { name: "Normal", confidence: "medium", reason: `Skew ≈ ${sk.toFixed(2)}, kurtosis ≈ ${ku.toFixed(2)}` };
  }

  // Check for log-normal: right-skewed, all positive
  if (sk > 0.5 && mn > 0) {
    return { name: "Log-normal", confidence: "low", reason: `Right-skewed (${sk.toFixed(2)}), all positive` };
  }

  // Left-skewed
  if (sk < -0.5) {
    return { name: "Left-skewed", confidence: "low", reason: `Negative skew (${sk.toFixed(2)})` };
  }

  return { name: "Unknown", confidence: "low", reason: `Skew=${sk.toFixed(2)}, kurtosis=${ku.toFixed(2)}` };
}

// ─── CSV/TSV parsing ────────────────────────────────────────────────────────
export type ParsedCSV = {
  headers: string[];
  rows: string[][];
  numericColumns: Map<string, number[]>; // header -> numeric values (NaN rows excluded)
  rowCount: number;
  colCount: number;
};

/**
 * Parse an entire CSV/TSV text into rows, respecting multi-line quoted fields.
 * This replaces naive split(\n) which breaks quoted fields containing newlines.
 *
 * Returns an array of rows, where each row is an array of field strings.
 */
function parseCSVRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  const fields: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ""
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        // Include everything inside quotes — even newlines
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        fields.push(current);
        current = "";
      } else if (ch === "\r") {
        // skip \r, handle \n next
      } else if (ch === "\n") {
        fields.push(current);
        current = "";
        // Only add non-empty rows
        if (fields.some((f) => f.trim() !== "")) {
          rows.push(fields.map((f) => f.trim()));
        }
        fields.length = 0;
      } else {
        current += ch;
      }
    }
  }

  // Handle last row (no trailing newline)
  fields.push(current);
  if (fields.some((f) => f.trim() !== "")) {
    rows.push(fields.map((f) => f.trim()));
  }

  return rows;
}

/**
 * Try to parse a formatted value as a number.
 * Handles: $1,234  →  1234
 *          85%     →  85
 *          1,234.56 → 1234.56
 *          (100)   →  -100  (accounting notation)
 *          plain numbers pass through
 */
function parseNumericValue(raw: string): number | null {
  if (!raw || raw === "") return null;

  // Missing value sentinels
  const upper = raw.toUpperCase();
  if (upper === "NA" || upper === "N/A" || upper === "NULL" || upper === "NAN"
      || upper === "-" || upper === "--" || upper === "." || upper === "..") {
    return null;
  }

  // Try plain number first (fastest path)
  const plain = Number(raw);
  if (raw !== "" && !isNaN(plain)) return plain;

  // Strip currency symbols and thousand separators: $1,234.56 → 1234.56
  let s = raw.replace(/^[£€$¥₹\s]+|[£€$¥₹\s]+$/g, "");

  // Accounting negative: (123) → -123
  const isAccounting = s.startsWith("(") && s.endsWith(")");
  if (isAccounting) s = s.slice(1, -1);

  // Remove thousand separators (commas in 1,234,567)
  // But be careful: "1,2" is NOT a thousands separator
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }

  // Strip trailing percent
  const isPct = s.endsWith("%");
  if (isPct) s = s.slice(0, -1);

  const v = Number(s);
  if (isNaN(v)) return null;

  return isAccounting ? -v : v;
}

/** Parse CSV/TSV text with automatic header and delimiter detection.
 *  Handles: quoted fields (including multi-line), BOM, mixed types,
 *  formatted numbers ($, %, commas), large datasets, encoding issues. */
export function parseCSV(text: string): ParsedCSV | null {
  // Strip BOM (common in Excel/Windows CSV exports)
  let cleaned = text.replace(/^\uFEFF/, "");

  // Also handle UTF-16 LE/BE BOMs that sometimes appear
  cleaned = cleaned.replace(/^\uFFFE/, "").replace(/^\uFEFF/, "");

  // Quick sanity check — need at least 1 line with content
  if (!cleaned.trim()) return null;

  // Detect delimiter from the FIRST non-empty line (outside quotes)
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim()) || "";
  let delim = ",";
  const countOutsideQuotes = (line: string, d: string) => {
    let count = 0, inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) count++;
    }
    return count;
  };

  const tabCount = countOutsideQuotes(firstLine, "\t");
  const commaCount = countOutsideQuotes(firstLine, ",");
  const semiCount = countOutsideQuotes(firstLine, ";");
  const pipeCount = countOutsideQuotes(firstLine, "|");

  // Pick the delimiter with the highest count
  const counts: [string, number][] = [
    ["\t", tabCount], [",", commaCount], [";", semiCount], ["|", pipeCount],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  if (counts[0][1] > 0) delim = counts[0][0];

  // Parse ALL rows using the proper character-by-character parser
  // This correctly handles multi-line quoted fields
  const allRows = parseCSVRows(cleaned, delim);
  if (allRows.length === 0) return null;

  const firstRow = allRows[0];
  const colCount = firstRow.length;
  if (colCount === 0) return null;

  // Detect if first row is a header (mostly non-numeric)
  const firstRowNumericCount = firstRow.filter((c) => {
    const v = c.replace(/^["']|["']$/g, "").trim();
    return v !== "" && !isNaN(Number(v));
  }).length;
  const hasHeader = firstRowNumericCount < colCount * 0.5;

  const headers = hasHeader
    ? firstRow.map((h, i) => h.replace(/^["']|["']$/g, "").trim() || `Col ${i + 1}`)
    : firstRow.map((_, i) => `Col ${i + 1}`);

  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  // Parse rows — tolerate column count mismatches
  // Accept rows with at least 50% of expected columns (much more lenient)
  const minCols = Math.max(1, Math.ceil(colCount * 0.5));
  const rows: string[][] = [];

  for (const fields of dataRows) {
    if (fields.length < minCols) continue;

    // Strip outer quotes from each field
    const cleaned = fields.map((f) => f.replace(/^["']|["']$/g, ""));

    // Pad short rows with empty strings
    while (cleaned.length < colCount) cleaned.push("");
    // Truncate extra columns
    rows.push(cleaned.slice(0, colCount));
  }

  if (rows.length === 0) return null;

  // Extract numeric columns using the smart number parser
  const numericColumns = new Map<string, number[]>();
  for (let c = 0; c < colCount; c++) {
    const vals: number[] = [];
    let numericCount = 0;
    let nonEmptyCount = 0;

    for (const row of rows) {
      const raw = row[c]?.trim();
      if (!raw || raw === "") continue;
      nonEmptyCount++;

      const v = parseNumericValue(raw);
      if (v !== null) {
        vals.push(v);
        numericCount++;
      }
    }

    // Treat as numeric if >30% of non-empty values parse as numbers and at least 3 values
    if (nonEmptyCount > 0 && numericCount > nonEmptyCount * 0.3 && vals.length >= 3) {
      numericColumns.set(headers[c], vals);
    }
  }

  return {
    headers,
    rows,
    numericColumns,
    rowCount: rows.length,
    colCount,
  };
}
