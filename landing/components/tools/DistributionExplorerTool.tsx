"use client";

import { useMemo, useState } from "react";
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
import { Tabs, Field, Stat, Select, Panel, Formula, Btn } from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";
import { mean as meanFn, sd as sdFn } from "./shared/stats";
import { useUrlState } from "@/lib/urlState";

const W = 720, H = 320, PAD = 36;

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

  const tabs = dataset ? ["PDF", "CDF", "Probability", "Empirical Overlay"] : ["PDF", "CDF", "Probability"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
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
          </Panel>
        </div>

        <Panel className="space-y-5">
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
        </Panel>
      </div>
    </div>
  );
}
