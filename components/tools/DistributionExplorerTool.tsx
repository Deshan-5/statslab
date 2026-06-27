"use client";

import { useMemo, useState, useRef } from "react";
import {
  normalPDF, normalCDF,
  uniformPDF, uniformCDF,
  exponentialPDF, exponentialCDF,
  gammaPDF, gammaCDF,
  betaPDF, betaCDF,
  lognormalPDF, lognormalCDF,
  chi2PDF, chi2CDF,
  tPDF, tCDF,
  binomialPMF, binomialCDF,
  poissonPMF, poissonCDF,
  geometricPMF, geometricCDF,
} from "./shared/stats";
import { Tabs, Field, Stat, Select, Panel, Formula, Btn, Interpretation, useRegisterToolState } from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";
import { mean as meanFn, sd as sdFn } from "./shared/stats";
import { useUrlState } from "@/lib/urlState";

const W = 720, H = 320, PAD = 36;
const VIEW3D_W = 560;
const VIEW3D_H = 420;

type ParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

type Family = {
  id: string;
  name: string;
  kind: "continuous" | "discrete";
  params: ParamSpec[];
  /** Plot domain [lo, hi] given current parameters. */
  domain: (p: Record<string, number>) => [number, number];
  pdf: (x: number, p: Record<string, number>) => number;
  cdf: (x: number, p: Record<string, number>) => number;
  mean: (p: Record<string, number>) => number;
  variance: (p: Record<string, number>) => number;
  formula: string;
};

const FAMILIES: Family[] = [
  {
    id: "normal", name: "Normal", kind: "continuous",
    params: [
      { key: "mu", label: "μ (mean)", min: -5, max: 5, step: 0.1, default: 0 },
      { key: "sigma", label: "σ (std)", min: 0.2, max: 5, step: 0.1, default: 1 },
    ],
    domain: ({ mu, sigma }) => [mu - 5 * sigma, mu + 5 * sigma],
    pdf: (x, { mu, sigma }) => normalPDF(x, mu, sigma),
    cdf: (x, { mu, sigma }) => normalCDF((x - mu) / sigma),
    mean: ({ mu }) => mu,
    variance: ({ sigma }) => sigma * sigma,
    formula: "f(x) = (1/(σ√2π)) · exp(−(x−μ)² / 2σ²)",
  },
  {
    id: "uniform", name: "Uniform", kind: "continuous",
    params: [
      { key: "a", label: "a (min)", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "b", label: "b (max)", min: -10, max: 10, step: 0.1, default: 1 },
    ],
    domain: ({ a, b }) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const pad = (hi - lo) * 0.15 || 0.5;
      return [lo - pad, hi + pad];
    },
    pdf: (x, { a, b }) => uniformPDF(x, Math.min(a, b), Math.max(a, b)),
    cdf: (x, { a, b }) => uniformCDF(x, Math.min(a, b), Math.max(a, b)),
    mean: ({ a, b }) => (a + b) / 2,
    variance: ({ a, b }) => (b - a) ** 2 / 12,
    formula: "f(x) = 1/(b−a) for a ≤ x ≤ b",
  },
  {
    id: "exponential", name: "Exponential", kind: "continuous",
    params: [
      { key: "lambda", label: "λ (rate)", min: 0.1, max: 5, step: 0.05, default: 1 },
    ],
    domain: ({ lambda }) => [0, 6 / lambda],
    pdf: (x, { lambda }) => exponentialPDF(x, lambda),
    cdf: (x, { lambda }) => exponentialCDF(x, lambda),
    mean: ({ lambda }) => 1 / lambda,
    variance: ({ lambda }) => 1 / (lambda * lambda),
    formula: "f(x) = λ · exp(−λx) for x ≥ 0",
  },
  {
    id: "gamma", name: "Gamma", kind: "continuous",
    params: [
      { key: "k", label: "k (shape)", min: 0.5, max: 10, step: 0.1, default: 2 },
      { key: "theta", label: "θ (scale)", min: 0.2, max: 5, step: 0.1, default: 1 },
    ],
    domain: ({ k, theta }) => [0, Math.max(k * theta + 5 * Math.sqrt(k) * theta, 5)],
    pdf: (x, { k, theta }) => gammaPDF(x, k, theta),
    cdf: (x, { k, theta }) => gammaCDF(x, k, theta),
    mean: ({ k, theta }) => k * theta,
    variance: ({ k, theta }) => k * theta * theta,
    formula: "f(x) = x^(k−1) · exp(−x/θ) / (Γ(k) · θ^k)",
  },
  {
    id: "beta", name: "Beta", kind: "continuous",
    params: [
      { key: "a", label: "α", min: 0.5, max: 10, step: 0.1, default: 2 },
      { key: "b", label: "β", min: 0.5, max: 10, step: 0.1, default: 5 },
    ],
    domain: () => [0, 1],
    pdf: (x, { a, b }) => betaPDF(x, a, b),
    cdf: (x, { a, b }) => betaCDF(x, a, b),
    mean: ({ a, b }) => a / (a + b),
    variance: ({ a, b }) => (a * b) / ((a + b) ** 2 * (a + b + 1)),
    formula: "f(x) = x^(α−1) · (1−x)^(β−1) / B(α, β)",
  },
  {
    id: "lognormal", name: "Log-normal", kind: "continuous",
    params: [
      { key: "mu", label: "μ", min: -2, max: 2, step: 0.1, default: 0 },
      { key: "sigma", label: "σ", min: 0.1, max: 2, step: 0.05, default: 0.5 },
    ],
    domain: ({ mu, sigma }) => [0, Math.exp(mu + 3 * sigma)],
    pdf: (x, { mu, sigma }) => lognormalPDF(x, mu, sigma),
    cdf: (x, { mu, sigma }) => lognormalCDF(x, mu, sigma),
    mean: ({ mu, sigma }) => Math.exp(mu + (sigma * sigma) / 2),
    variance: ({ mu, sigma }) =>
      (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma),
    formula: "f(x) = (1/(xσ√2π)) · exp(−(ln x − μ)² / 2σ²)",
  },
  {
    id: "chi2", name: "Chi-squared", kind: "continuous",
    params: [{ key: "k", label: "k (df)", min: 1, max: 30, step: 1, default: 4 }],
    domain: ({ k }) => [0, Math.max(k + 5 * Math.sqrt(2 * k), 10)],
    pdf: (x, { k }) => chi2PDF(x, k),
    cdf: (x, { k }) => chi2CDF(x, k),
    mean: ({ k }) => k,
    variance: ({ k }) => 2 * k,
    formula: "f(x) = x^(k/2−1) · exp(−x/2) / (2^(k/2) · Γ(k/2))",
  },
  {
    id: "t", name: "Student's t", kind: "continuous",
    params: [{ key: "df", label: "ν (df)", min: 1, max: 50, step: 1, default: 5 }],
    domain: ({ df }) => {
      const s = df > 2 ? Math.sqrt(df / (df - 2)) : 3;
      return [-5 * s, 5 * s];
    },
    pdf: (x, { df }) => tPDF(x, df),
    cdf: (x, { df }) => tCDF(x, df),
    mean: ({ df }) => (df > 1 ? 0 : NaN),
    variance: ({ df }) => (df > 2 ? df / (df - 2) : Infinity),
    formula: "f(x) = Γ((ν+1)/2) / (√(νπ)·Γ(ν/2)) · (1 + x²/ν)^(−(ν+1)/2)",
  },
  {
    id: "binomial", name: "Binomial", kind: "discrete",
    params: [
      { key: "n", label: "n (trials)", min: 1, max: 60, step: 1, default: 20 },
      { key: "p", label: "p (success)", min: 0.01, max: 0.99, step: 0.01, default: 0.5 },
    ],
    domain: ({ n }) => [0, n],
    pdf: (k, { n, p }) => binomialPMF(k, n, p),
    cdf: (k, { n, p }) => binomialCDF(k, n, p),
    mean: ({ n, p }) => n * p,
    variance: ({ n, p }) => n * p * (1 - p),
    formula: "P(X = k) = C(n, k) · p^k · (1−p)^(n−k)",
  },
  {
    id: "poisson", name: "Poisson", kind: "discrete",
    params: [{ key: "lambda", label: "λ (rate)", min: 0.5, max: 30, step: 0.1, default: 4 }],
    domain: ({ lambda }) => [0, Math.max(Math.ceil(lambda + 5 * Math.sqrt(lambda)), 8)],
    pdf: (k, { lambda }) => poissonPMF(k, lambda),
    cdf: (k, { lambda }) => poissonCDF(k, lambda),
    mean: ({ lambda }) => lambda,
    variance: ({ lambda }) => lambda,
    formula: "P(X = k) = λ^k · exp(−λ) / k!",
  },
  {
    id: "geometric", name: "Geometric", kind: "discrete",
    params: [{ key: "p", label: "p (success)", min: 0.05, max: 0.95, step: 0.01, default: 0.3 }],
    domain: ({ p }) => [1, Math.max(Math.ceil(5 / p), 10)],
    pdf: (k, { p }) => geometricPMF(k, p),
    cdf: (k, { p }) => geometricCDF(k, p),
    mean: ({ p }) => 1 / p,
    variance: ({ p }) => (1 - p) / (p * p),
    formula: "P(X = k) = (1−p)^(k−1) · p,  k = 1, 2, …",
  },
];

function defaultsFor(f: Family): Record<string, number> {
  return Object.fromEntries(f.params.map((p) => [p.key, p.default]));
}

const DEFAULT_PARAMS: Record<string, Record<string, number>> = Object.fromEntries(
  FAMILIES.map((f) => [f.id, defaultsFor(f)])
);

export default function DistributionExplorerTool() {
  const { dataset } = useWorkspace();
  const [familyId, setFamilyId] = useUrlState<string>("f", "normal");
  const family = FAMILIES.find((f) => f.id === familyId) ?? FAMILIES[0];
  const [paramsByFamily, setParamsByFamily] = useUrlState<Record<string, Record<string, number>>>(
    "p",
    DEFAULT_PARAMS
  );
  const params = paramsByFamily[family.id] ?? defaultsFor(family);
  const setParam = (k: string, v: number) =>
    setParamsByFamily((prev) => ({
      ...prev,
      [family.id]: { ...(prev[family.id] ?? defaultsFor(family)), [k]: v },
    }));

  const [tab, setTab] = useState("PDF");
  const [calcMode, setCalcMode] = useState<"lt" | "gt" | "between">("lt");
  const [aVal, setAVal] = useState(0);
  const [bVal, setBVal] = useState(1);

  // Empirical overlay
  const [overlayCol, setOverlayCol] = useState<string | null>(null);

  // 3D states
  const [is3D, setIs3D] = useState(false);
  const [yaw, setYaw] = useState(-0.6);
  const [pitch, setPitch] = useState(0.6);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useRegisterToolState("distribution-explorer", { tab, calcMode, aVal, bVal, overlayCol, familyId, paramsByFamily, is3D, yaw, pitch }, {
    tab: setTab,
    calcMode: (v) => { if (["lt", "gt", "between"].includes(v)) setCalcMode(v as any); },
    aVal: setAVal,
    bVal: setBVal,
    overlayCol: setOverlayCol,
    familyId: setFamilyId,
    paramsByFamily: setParamsByFamily,
    is3D: setIs3D,
    yaw: setYaw,
    pitch: setPitch,
  });

  const overlayData: number[] = useMemo(() => {
    if (!dataset || !overlayCol) return [];
    const c = dataset.columns.find((c) => c.name === overlayCol);
    return c?.numeric ?? [];
  }, [dataset, overlayCol]);

  const fitToData = () => {
    if (overlayData.length < 3) return;
    const m = meanFn(overlayData);
    const s = sdFn(overlayData);
    const sMin = Math.min(...overlayData);
    const sMax = Math.max(...overlayData);
    if (familyId === "normal") {
      setParam("mu", Number(m.toFixed(2)));
      setParam("sigma", Number(Math.max(s, 0.2).toFixed(2)));
    } else if (familyId === "uniform") {
      setParam("a", Number(sMin.toFixed(2)));
      setParam("b", Number(sMax.toFixed(2)));
    } else if (familyId === "exponential") {
      const lam = m > 0 ? 1 / m : 1;
      setParam("lambda", Number(Math.max(0.1, Math.min(5, lam)).toFixed(2)));
    } else if (familyId === "lognormal" && sMin > 0) {
      const logs = overlayData.map(Math.log);
      setParam("mu", Number(meanFn(logs).toFixed(2)));
      setParam("sigma", Number(Math.max(sdFn(logs), 0.1).toFixed(2)));
    } else if (familyId === "gamma" && sMin > 0) {
      const v = s * s;
      const k = m > 0 && v > 0 ? (m * m) / v : 1;
      const theta = m > 0 ? v / m : 1;
      setParam("k", Number(Math.max(0.5, Math.min(10, k)).toFixed(2)));
      setParam("theta", Number(Math.max(0.2, Math.min(5, theta)).toFixed(2)));
    } else if (familyId === "poisson") {
      setParam("lambda", Number(Math.max(0.5, Math.min(30, m)).toFixed(2)));
    }
  };

  const [lo, hi] = family.domain(params);
  const isDiscrete = family.kind === "discrete";

  const curve = useMemo(() => {
    if (isDiscrete) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
        xs.push(k);
        ys.push(family.pdf(k, params));
      }
      return { xs, ys };
    } else {
      const N = 240;
      const xs = Array.from({ length: N }, (_, i) => lo + ((hi - lo) * i) / (N - 1));
      const ys = xs.map((x) => family.pdf(x, params));
      return { xs, ys };
    }
  }, [family, params, lo, hi, isDiscrete]);

  const cdfCurve = useMemo(() => {
    const N = isDiscrete ? Math.ceil(hi) - Math.floor(lo) + 1 : 240;
    const xs = isDiscrete
      ? Array.from({ length: N }, (_, i) => Math.floor(lo) + i)
      : Array.from({ length: N }, (_, i) => lo + ((hi - lo) * i) / (N - 1));
    const ys = xs.map((x) => family.cdf(x, params));
    return { xs, ys };
  }, [family, params, lo, hi, isDiscrete]);

  const ymax = Math.max(...curve.ys, 1e-9);
  const px = (x: number) => PAD + ((x - lo) / (hi - lo)) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  const pyCDF = (y: number) => H - PAD - y * (H - 2 * PAD);

  const probability = (() => {
    if (calcMode === "lt") return family.cdf(aVal, params);
    if (calcMode === "gt") {
      if (isDiscrete) return 1 - family.cdf(aVal - 1, params);
      return 1 - family.cdf(aVal, params);
    }
    if (isDiscrete) return family.cdf(bVal, params) - family.cdf(aVal - 1, params);
    return family.cdf(bVal, params) - family.cdf(aVal, params);
  })();

  const mean = family.mean(params);
  const variance = family.variance(params);

  const pdfPath = !isDiscrete
    ? curve.xs
        .map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(curve.ys[i]).toFixed(2)}`)
        .join(" ")
    : "";

  const cdfPath = cdfCurve.xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${pyCDF(cdfCurve.ys[i]).toFixed(2)}`)
    .join(" ");

  const inRegion = (x: number) =>
    calcMode === "lt" ? x <= aVal :
    calcMode === "gt" ? x >= aVal :
    x >= aVal && x <= bVal;

  // Histogram overlay (continuous) or count overlay (discrete) for the chosen column.
  const overlay = useMemo(() => {
    if (!overlayData.length || !family) return null;
    if (isDiscrete) {
      const counts = new Map<number, number>();
      for (const v of overlayData) {
        const k = Math.round(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const total = overlayData.length;
      return { kind: "discrete" as const, counts, total };
    }
    const bins = 20;
    const oLo = Math.min(...overlayData), oHi = Math.max(...overlayData);
    const w = (oHi - oLo) / bins || 1;
    const heights = Array(bins).fill(0);
    for (const v of overlayData) {
      const b = Math.min(bins - 1, Math.max(0, Math.floor((v - oLo) / w)));
      heights[b]++;
    }
    const dens = heights.map((c) => c / overlayData.length / w);
    return { kind: "continuous" as const, dens, oLo, w, bins };
  }, [overlayData, family, isDiscrete]);

  // 3D drag handlers
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging3D || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setYaw((y) => y + dx * 0.01);
    setPitch((p) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p - dy * 0.01)));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(false);
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const maxJointDensity = useMemo(() => {
    const maxSingle = Math.max(...curve.ys, 1e-9);
    return maxSingle * maxSingle;
  }, [curve.ys]);

  const jointInterpretation = useMemo(() => {
    if (!is3D) return null;
    return `Joint bivariate i.i.d. ${family.name} distribution with independence assumption f(x,y) = f(x) · f(y). The individual variables E[X] = E[Y] = ${Number.isFinite(mean) ? mean.toFixed(3) : "—"} and Var[X] = Var[Y] = ${Number.isFinite(variance) ? variance.toFixed(3) : "—"}. The peak joint density/probability is ${maxJointDensity.toFixed(4)}.`;
  }, [is3D, family, mean, variance, maxJointDensity]);

  const renderItems3D = useMemo(() => {
    if (!is3D) return [];

    const getProj = (x: number, y: number, z: number) => {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const xRotY = x * cosYaw - z * sinYaw;
      const zRotY = x * sinYaw + z * cosYaw;

      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const yRotX = y * cosPitch - zRotY * sinPitch;
      const zRotX = y * sinPitch + zRotY * cosPitch;

      const d = 0.2;
      const denom = 1 - d * zRotX;
      const scale = 175; // fits inside 560x420
      const cx = VIEW3D_W / 2;
      const cy = VIEW3D_H / 2 - 10;

      const px = cx + (xRotY * scale) / denom;
      const py = cy - (yRotX * scale) / denom;

      return { px, py, depth: zRotX };
    };

    // Construct patches or needles
    interface PatchItem {
      type: "patch";
      points: string;
      depth: number;
      density: number;
      shade: number;
    }
    interface NeedleItem {
      type: "needle";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      depth: number;
      prob: number;
    }
    interface EdgeItem {
      type: "edge";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      depth: number;
      color: string;
      strokeWidth: number;
      isDash?: boolean;
    }
    interface TextItem {
      type: "text";
      x: number;
      y: number;
      text: string;
      depth: number;
      color: string;
      fontSize: number;
      textAnchor: "start" | "middle" | "end";
    }

    const patches: PatchItem[] = [];
    const needles: NeedleItem[] = [];

    if (!isDiscrete) {
      // Continuous: 21x21 surface grid
      const N = 21;
      const grid: { px: number; py: number; depth: number; density: number; rx: number; ry: number; rz: number }[][] = [];
      
      for (let i = 0; i < N; i++) {
        const row: typeof grid[0] = [];
        const xVal = lo + ((hi - lo) * i) / (N - 1);
        const nx = -1 + (2 * i) / (N - 1);

        for (let j = 0; j < N; j++) {
          const yVal = lo + ((hi - lo) * j) / (N - 1);
          const nz = -1 + (2 * j) / (N - 1);

          const pdfX = family.pdf(xVal, params);
          const pdfY = family.pdf(yVal, params);
          const density = pdfX * pdfY;

          // Normalize height between [-1, 0.8]
          const ny = -1 + 1.8 * (density / maxJointDensity);
          const proj = getProj(nx, ny, nz);

          row.push({
            px: proj.px,
            py: proj.py,
            depth: proj.depth,
            density,
            rx: nx,
            ry: ny,
            rz: nz
          });
        }
        grid.push(row);
      }

      for (let i = 0; i < N - 1; i++) {
        for (let j = 0; j < N - 1; j++) {
          const p00 = grid[i][j];
          const p10 = grid[i + 1][j];
          const p11 = grid[i + 1][j + 1];
          const p01 = grid[i][j + 1];

          const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) / 4;
          const avgDensity = (p00.density + p10.density + p11.density + p01.density) / 4;

          // Lambertian shading normal calculation
          const ux = p10.rx - p00.rx;
          const uy = p10.ry - p00.ry;
          const uz = p10.rz - p00.rz;

          const vx = p01.rx - p00.rx;
          const vy = p01.ry - p00.ry;
          const vz = p01.rz - p00.rz;

          const normX = uy * vz - uz * vy;
          const normY = uz * vx - ux * vz;
          const normZ = ux * vy - uy * vx;

          const len = Math.hypot(normX, normY, normZ) || 1e-9;
          const nnx = normX / len;
          const nny = normY / len;
          const nnz = normZ / len;

          // Light vector: (0.5, 0.8, -0.3) normalized
          const lightLen = Math.hypot(0.5, 0.8, -0.3);
          const lX = 0.5 / lightLen;
          const lY = 0.8 / lightLen;
          const lZ = -0.3 / lightLen;

          const dot = nnx * lX + nny * lY + nnz * lZ;
          const shade = 0.85 + 0.25 * dot;

          const pointsStr = `${p00.px.toFixed(1)},${p00.py.toFixed(1)} ${p10.px.toFixed(1)},${p10.py.toFixed(1)} ${p11.px.toFixed(1)},${p11.py.toFixed(1)} ${p01.px.toFixed(1)},${p01.py.toFixed(1)}`;

          patches.push({
            type: "patch",
            points: pointsStr,
            depth: avgDepth,
            density: avgDensity,
            shade
          });
        }
      }
    } else {
      // Discrete: Stems & bubbles
      const kValues: number[] = [];
      const numPoints = Math.ceil(hi) - Math.floor(lo) + 1;
      const step = Math.max(1, Math.ceil(numPoints / 16));
      for (let k = Math.floor(lo); k <= Math.ceil(hi); k += step) {
        kValues.push(k);
      }

      for (const xVal of kValues) {
        const nx = -1 + 2 * ((xVal - lo) / (hi - lo || 1));
        const pmfX = family.pdf(xVal, params);

        for (const yVal of kValues) {
          const nz = -1 + 2 * ((yVal - lo) / (hi - lo || 1));
          const pmfY = family.pdf(yVal, params);
          const prob = pmfX * pmfY;

          // Height of stem
          const nyBottom = -1;
          const nyTop = -1 + 1.8 * (prob / maxJointDensity);

          const projBottom = getProj(nx, nyBottom, nz);
          const projTop = getProj(nx, nyTop, nz);

          needles.push({
            type: "needle",
            x1: projBottom.px,
            y1: projBottom.py,
            x2: projTop.px,
            y2: projTop.py,
            depth: projTop.depth,
            prob
          });
        }
      }
    }

    // Box outlines
    const boxCorners = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], // Floor
      [-1, 0.8, -1], [1, 0.8, -1], [1, 0.8, 1], [-1, 0.8, 1] // Ceiling
    ];

    const edges: EdgeItem[] = [];
    const getEdgeProj = (c1: number[], c2: number[]) => {
      const p1 = getProj(c1[0], c1[1], c1[2]);
      const p2 = getProj(c2[0], c2[1], c2[2]);
      return {
        x1: p1.px,
        y1: p1.py,
        x2: p2.px,
        y2: p2.py,
        depth: (p1.depth + p2.depth) / 2
      };
    };

    const floorIndices = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const ceilIndices = [[4, 5], [5, 6], [6, 7], [7, 4]];
    const pillarIndices = [[0, 4], [1, 5], [2, 6], [3, 7]];

    for (const [i1, i2] of floorIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }
    for (const [i1, i2] of ceilIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }
    for (const [i1, i2] of pillarIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }

    // Text labels
    const textItems: TextItem[] = [];

    const xLabelProj = getProj(0, -1.2, 1.25);
    textItems.push({
      type: "text",
      x: xLabelProj.px,
      y: xLabelProj.py,
      text: `X variable`,
      depth: xLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    const yLabelProj = getProj(-1.25, 0, 1.25);
    textItems.push({
      type: "text",
      x: yLabelProj.px,
      y: yLabelProj.py,
      text: isDiscrete ? "Joint Mass P(X,Y)" : "Joint Density f(x,y)",
      depth: yLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    const zLabelProj = getProj(1.25, -1.25, 0);
    textItems.push({
      type: "text",
      x: zLabelProj.px,
      y: zLabelProj.py,
      text: `Y variable`,
      depth: zLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    // Domain edge labels
    const c1Proj = getProj(-1.05, -1.05, 1.05);
    textItems.push({
      type: "text", x: c1Proj.px, y: c1Proj.py, text: `(${isDiscrete ? Math.round(lo) : lo.toFixed(1)}, ${isDiscrete ? Math.round(lo) : lo.toFixed(1)})`, depth: c1Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "end"
    });
    const c2Proj = getProj(1.05, -1.05, 1.05);
    textItems.push({
      type: "text", x: c2Proj.px, y: c2Proj.py, text: `(${isDiscrete ? Math.round(hi) : hi.toFixed(1)}, ${isDiscrete ? Math.round(lo) : lo.toFixed(1)})`, depth: c2Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "start"
    });
    const c3Proj = getProj(-1.05, -1.05, -1.05);
    textItems.push({
      type: "text", x: c3Proj.px, y: c3Proj.py, text: `(${isDiscrete ? Math.round(lo) : lo.toFixed(1)}, ${isDiscrete ? Math.round(hi) : hi.toFixed(1)})`, depth: c3Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "end"
    });
    const c4Proj = getProj(1.05, -1.05, -1.05);
    textItems.push({
      type: "text", x: c4Proj.px, y: c4Proj.py, text: `(${isDiscrete ? Math.round(hi) : hi.toFixed(1)}, ${isDiscrete ? Math.round(hi) : hi.toFixed(1)})`, depth: c4Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "start"
    });

    type Renderable = PatchItem | NeedleItem | EdgeItem | TextItem;
    const sorted: Renderable[] = [...patches, ...needles, ...edges, ...textItems].sort((a, b) => a.depth - b.depth);
    return sorted;
  }, [is3D, isDiscrete, lo, hi, family, params, yaw, pitch, maxJointDensity]);

  const tabs = dataset ? ["PDF", "CDF", "Probability", "Empirical Overlay"] : ["PDF", "CDF", "Probability"];

  return (
    <div className="space-y-6">
      {is3D ? (
        <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-3 rounded-lg">
          <div>
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">3D Joint Bivariate {family.name} Distribution</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Independent and identically distributed (i.i.d.) joint density</p>
          </div>
          <span className="text-xs bg-orange-500/10 text-orange-400 px-2.5 py-1 rounded-full font-medium border border-orange-500/20">
            Interactive 3D
          </span>
        </div>
      ) : (
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            {is3D ? (
              <svg
                viewBox={`0 0 ${VIEW3D_W} ${VIEW3D_H}`}
                className="w-full h-auto select-none cursor-move"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {renderItems3D.map((item, idx) => {
                  if (item.type === "patch") {
                    const ratio = item.density / maxJointDensity;
                    // Interpolate from deep indigo (ratio = 0) to bright orange (ratio = 1)
                    let r = Math.round(79 + 172 * ratio);
                    let g = Math.round(70 + 76 * ratio);
                    let b = Math.round(229 - 169 * ratio);

                    r = Math.max(0, Math.min(255, Math.round(r * item.shade)));
                    g = Math.max(0, Math.min(255, Math.round(g * item.shade)));
                    b = Math.max(0, Math.min(255, Math.round(b * item.shade)));

                    const fillColor = `rgba(${r}, ${g}, ${b}, ${0.3 + 0.45 * ratio})`;
                    const strokeColor = `rgba(${r}, ${g}, ${b}, ${0.4 + 0.4 * ratio})`;

                    return (
                      <polygon
                        key={`p-${idx}`}
                        points={item.points}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={0.8}
                      />
                    );
                  } else if (item.type === "needle") {
                    const ratio = item.prob / maxJointDensity;
                    const r = Math.round(79 + 172 * ratio);
                    const g = Math.round(70 + 76 * ratio);
                    const b = Math.round(229 - 169 * ratio);
                    const stemColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
                    const bubbleColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
                    const bubbleRadius = 1.5 + 4.5 * ratio;

                    return (
                      <g key={`needle-${idx}`}>
                        <line
                          x1={item.x1}
                          y1={item.y1}
                          x2={item.x2}
                          y2={item.y2}
                          stroke={stemColor}
                          strokeWidth={1.5}
                        />
                        <circle
                          cx={item.x2}
                          cy={item.y2}
                          r={bubbleRadius}
                          fill={bubbleColor}
                          stroke="#ffffff"
                          strokeWidth={0.8}
                        />
                      </g>
                    );
                  } else if (item.type === "edge") {
                    return (
                      <line
                        key={`e-${idx}`}
                        x1={item.x1}
                        y1={item.y1}
                        x2={item.x2}
                        y2={item.y2}
                        stroke={item.color}
                        strokeWidth={item.strokeWidth}
                        strokeDasharray={item.isDash ? "3 3" : undefined}
                        strokeOpacity={0.7}
                      />
                    );
                  } else if (item.type === "text") {
                    return (
                      <text
                        key={`t-${idx}`}
                        x={item.x}
                        y={item.y}
                        fill={item.color}
                        fontSize={item.fontSize}
                        textAnchor={item.textAnchor}
                        className="font-medium"
                      >
                        {item.text}
                      </text>
                    );
                  }
                  return null;
                })}

                <text x={VIEW3D_W / 2} y={VIEW3D_H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                  Drag to rotate view · Shift sliders to stretch and morph surface
                </text>

                <g 
                  className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setYaw(-0.6);
                    setPitch(0.6);
                  }}
                  transform={`translate(${VIEW3D_W - 80}, ${VIEW3D_H - 24})`}
                >
                  <rect width="70" height="18" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                  <text x="35" y="12" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
                </g>
              </svg>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
                {tab === "CDF" && (
                  <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--chart-axis)" />
                )}

                {tab !== "CDF" && isDiscrete && curve.xs.map((x, i) => {
                  const barW = Math.max(2, ((W - 2 * PAD) / (hi - lo)) * 0.8);
                  const yTop = py(curve.ys[i]);
                  const shaded = tab === "Probability" && inRegion(x);
                  return (
                    <rect key={i}
                      x={px(x) - barW / 2}
                      y={yTop}
                      width={barW}
                      height={H - PAD - yTop}
                      fill={shaded ? "#fb923c" : "var(--chart-ink)"}
                      fillOpacity={shaded ? 0.55 : 0.85}
                    />
                  );
                })}

                {tab !== "CDF" && !isDiscrete && tab === "Probability" && (() => {
                  let d = ""; let started = false;
                  for (let i = 0; i < curve.xs.length; i++) {
                    const x = curve.xs[i], y = curve.ys[i];
                    if (inRegion(x)) {
                      if (!started) { d += `M${px(x)},${H - PAD} L${px(x)},${py(y)}`; started = true; }
                      else d += ` L${px(x)},${py(y)}`;
                    } else if (started) {
                      d += ` L${px(curve.xs[i - 1])},${H - PAD} Z`;
                      started = false;
                    }
                  }
                  if (started) d += ` L${px(curve.xs[curve.xs.length - 1])},${H - PAD} Z`;
                  return <path d={d} fill="#fb923c" fillOpacity={0.22} />;
                })()}

                {tab === "Empirical Overlay" && overlay?.kind === "continuous" && (() => {
                  const oymax = Math.max(...overlay.dens, ymax);
                  const sy2 = (y: number) => H - PAD - (y / oymax) * (H - 2 * PAD);
                  const barW = ((W - 2 * PAD) / overlay.bins);
                  return overlay.dens.map((d, i) => {
                    const xLo = overlay.oLo + i * overlay.w;
                    const cx = px(xLo);
                    return (
                      <rect key={i} x={cx} y={sy2(d)}
                        width={Math.max(1, barW - 1)} height={H - PAD - sy2(d)}
                        fill="var(--chart-ink)" fillOpacity={0.18} />
                    );
                  });
                })()}
                {tab === "Empirical Overlay" && overlay?.kind === "discrete" && Array.from(overlay.counts.entries()).map(([k, c]) => {
                  const barW = Math.max(2, ((W - 2 * PAD) / (hi - lo)) * 0.8);
                  const dens = c / overlay.total;
                  const oymax = Math.max(ymax, dens);
                  const yTop = H - PAD - (dens / oymax) * (H - 2 * PAD);
                  return (
                    <rect key={k}
                      x={px(k) - barW / 2} y={yTop}
                      width={barW} height={H - PAD - yTop}
                      fill="var(--chart-ink)" fillOpacity={0.18} />
                  );
                })}

                {tab !== "CDF" && !isDiscrete && (
                  <path d={pdfPath} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
                )}

                {tab === "CDF" && (
                  <path d={cdfPath} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
                )}

                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const x = lo + (hi - lo) * t;
                  return (
                    <text key={t} x={px(x)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">
                      {isDiscrete ? Math.round(x) : x.toFixed(2)}
                    </text>
                  );
                })}
              </svg>
            )}
          </Panel>
          <Interpretation text={is3D ? jointInterpretation : null} />
        </div>

        <Panel className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <span className="text-sm font-semibold text-neutral-200">3D Joint Distribution</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={is3D} onChange={(e) => setIs3D(e.target.checked)} />
              <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-white"></div>
            </label>
          </div>

          <Select label="Distribution" value={familyId}
            onChange={setFamilyId}
            options={FAMILIES.map((f) => ({ value: f.id, label: f.name }))} />

          {family.params.map((p) => (
            <div key={p.key} className="space-y-2">
              <Field label={p.label} value={params[p.key].toFixed(p.step < 1 ? 2 : 0)}>
                <input
                  type="range"
                  min={p.min} max={p.max} step={p.step}
                  value={params[p.key]}
                  onChange={(e) => setParam(p.key, Number(e.target.value))}
                  className="w-full"
                />
              </Field>
            </div>
          ))}

          {is3D ? (
            <div className="pt-2 border-t border-neutral-800 space-y-2">
              <Stat label="Joint Mean E[X, Y]" value={`(${Number.isFinite(mean) ? mean.toFixed(3) : "—"}, ${Number.isFinite(mean) ? mean.toFixed(3) : "—"})`} />
              <Stat label="Peak Joint Density" value={maxJointDensity.toFixed(4)} />
            </div>
          ) : (
            <>
              <Stat label="Mean E[X]" value={Number.isFinite(mean) ? mean.toFixed(3) : "—"} />
              <Stat
                label="Variance Var[X]"
                value={Number.isFinite(variance) ? variance.toFixed(3) : variance === Infinity ? "∞" : "—"}
              />

              {tab === "Empirical Overlay" && (
                <>
                  <ColumnPicker label="Column" value={overlayCol} onChange={setOverlayCol} kind="numeric" />
                  {overlayData.length >= 3 && (
                    <>
                      <Btn onClick={fitToData}>Fit parameters by MLE</Btn>
                      <Stat label="Sample n" value={String(overlayData.length)} />
                      <Stat label="Sample mean" value={meanFn(overlayData).toFixed(3)} sub={`vs E[X] = ${mean.toFixed(3)}`} />
                      <Stat label="Sample SD" value={sdFn(overlayData).toFixed(3)} sub={`vs √Var = ${Math.sqrt(Math.max(0, variance)).toFixed(3)}`} />
                    </>
                  )}
                </>
              )}

              {tab === "Probability" && (
                <>
                  <Select label="Region" value={calcMode}
                    onChange={(v) => setCalcMode(v as "lt" | "gt" | "between")}
                    options={[
                      { value: "lt", label: isDiscrete ? "P(X ≤ a)" : "P(X ≤ a)" },
                      { value: "gt", label: isDiscrete ? "P(X ≥ a)" : "P(X ≥ a)" },
                      { value: "between", label: "P(a ≤ X ≤ b)" },
                    ]} />
                  <Field label="a" value={aVal.toFixed(isDiscrete ? 0 : 2)}>
                    <input type="range" min={lo} max={hi} step={isDiscrete ? 1 : (hi - lo) / 200}
                      value={aVal}
                      onChange={(e) => setAVal(Number(e.target.value))}
                      className="w-full" />
                  </Field>
                  {calcMode === "between" && (
                    <Field label="b" value={bVal.toFixed(isDiscrete ? 0 : 2)}>
                      <input type="range" min={lo} max={hi} step={isDiscrete ? 1 : (hi - lo) / 200}
                        value={bVal}
                        onChange={(e) => setBVal(Number(e.target.value))}
                        className="w-full" />
                    </Field>
                  )}
                  <Stat label="Probability" value={probability.toFixed(4)} sub={`${(probability * 100).toFixed(2)}%`} />
                </>
              )}

              <Formula text={family.formula} />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

