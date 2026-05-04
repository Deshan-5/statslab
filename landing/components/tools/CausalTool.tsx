"use client";

import { useMemo, useState } from "react";
import { rngFor, gauss, ols } from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, SampleDataButton, Panel, Btn,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 360, PAD = 36;

function parseTriplets(text: string): { x: number; y: number; z: number }[] | null {
  const lines = text.trim().split(/\n/).filter((l) => l.trim());
  const out: { x: number; y: number; z: number }[] = [];
  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((s) => Number(s.trim()));
    if (parts.length < 3 || parts.some(isNaN)) return null;
    out.push({ x: parts[0], y: parts[1], z: parts[2] });
  }
  return out.length ? out : null;
}

function generate(seed: number, n: number, conf: number, eff: number) {
  const rng = rngFor(seed);
  return Array.from({ length: n }, () => {
    const z = gauss(rng);
    const x = conf * z + gauss(rng) * 0.5;
    const y = eff * x + conf * z + gauss(rng) * 0.5;
    return { x, y, z };
  });
}

export default function CausalTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Simulation");
  const [conf, setConf] = useState(1.5);
  const [eff, setEff] = useState(0.4);
  const [n, setN] = useState(160);
  const [seed, setSeed] = useState(1);
  const [raw, setRaw] = useState("");
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  const [zCol, setZCol] = useState<string | null>(null);

  const wsData = useMemo(() => {
    if (!dataset || !xCol || !yCol || !zCol) return null;
    const xC = dataset.columns.find((c) => c.name === xCol);
    const yC = dataset.columns.find((c) => c.name === yCol);
    const zC = dataset.columns.find((c) => c.name === zCol);
    if (!xC || !yC || !zC) return null;
    const out: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = Number(xC.values[i]);
      const yv = Number(yC.values[i]);
      const zv = Number(zC.values[i]);
      if (!isNaN(xv) && !isNaN(yv) && !isNaN(zv)) out.push({ x: xv, y: yv, z: zv });
    }
    return out.length >= 10 ? out : null;
  }, [dataset, xCol, yCol, zCol]);

  const userData = useMemo(() => parseTriplets(raw), [raw]);
  const data =
    tab === "Workspace" && wsData ? wsData :
    tab === "Your Data" && userData ? userData :
    generate(seed, n, conf, eff);

  const naive = ols(data.map((d) => d.x), data.map((d) => d.y));
  const mz = data.reduce((s, d) => s + d.z, 0) / data.length;
  const mx = data.reduce((s, d) => s + d.x, 0) / data.length;
  const my = data.reduce((s, d) => s + d.y, 0) / data.length;
  let bx = 0, by = 0, dz2 = 0;
  for (const d of data) { bx += (d.x - mx) * (d.z - mz); by += (d.y - my) * (d.z - mz); dz2 += (d.z - mz) ** 2; }
  const xOnZ = dz2 ? bx / dz2 : 0;
  const yOnZ = dz2 ? by / dz2 : 0;
  const resid = data.map((d) => ({ x: d.x - mx - xOnZ * (d.z - mz), y: d.y - my - yOnZ * (d.z - mz) }));
  const adjusted = ols(resid.map((r) => r.x), resid.map((r) => r.y));

  // Simple matching: bin Z, compute within-bin slopes, average
  const Z_BINS = 8;
  const zMin = Math.min(...data.map((d) => d.z)), zMax = Math.max(...data.map((d) => d.z));
  const w = (zMax - zMin) / Z_BINS;
  const binSlopes: number[] = [];
  for (let b = 0; b < Z_BINS; b++) {
    const lo = zMin + b * w, hi = lo + w;
    const inBin = data.filter((d) => d.z >= lo && d.z < hi);
    if (inBin.length >= 4) {
      const r = ols(inBin.map((p) => p.x), inBin.map((p) => p.y));
      binSlopes.push(r.slope);
    }
  }
  const matched = binSlopes.length ? binSlopes.reduce((s, v) => s + v, 0) / binSlopes.length : 0;

  const bias = naive.slope - adjusted.slope;
  const biasMagnitude = Math.abs(bias);
  const biasLabel =
    biasMagnitude < 0.05 ? "negligible — Z is not a strong confounder here" :
    biasMagnitude < 0.2 ? "modest" :
    biasMagnitude < 0.5 ? "substantial" :
    "very large — naive estimate is heavily distorted";
  const interpretation = `Naive Y~X slope = ${naive.slope.toFixed(3)}. After adjusting for Z, slope = ${adjusted.slope.toFixed(3)}. Confounding bias ≈ ${bias.toFixed(3)} (${biasLabel}). Matching across ${binSlopes.length} Z-bins gives ${matched.toFixed(3)} as a robustness check.`;

  const range = 4;
  const sxLeft = (v: number, off: number) => off + ((v + range) / (2 * range)) * (W / 2 - 2 * PAD);
  const sy = (v: number) => H - PAD - ((v + range) / (2 * range)) * (H - 2 * PAD);

  function panel(points: { x: number; y: number }[], slope: number, intercept: number, off: number, color: string, title: string, sub: string) {
    return (
      <g>
        <rect x={off - 4} y={PAD - 18} width={W / 2 - 2 * PAD + 8} height={H - 2 * PAD + 24} fill="none" stroke="var(--chart-grid)" rx={6} />
        <text x={off} y={PAD - 8} fontSize="12" fill="var(--chart-muted)" fontWeight={500}>{title}</text>
        <text x={off + W / 2 - 2 * PAD} y={PAD - 8} fontSize="11" fill="var(--chart-muted)" textAnchor="end">{sub}</text>
        <line x1={off} y1={sy(0)} x2={off + W / 2 - 2 * PAD} y2={sy(0)} stroke="var(--chart-grid)" />
        <line x1={off} y1={sy(intercept + slope * -range)} x2={off + W / 2 - 2 * PAD} y2={sy(intercept + slope * range)} stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={sxLeft(p.x, off)} cy={sy(p.y)} r={2} fill={color} fillOpacity={0.55} />
        ))}
      </g>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={dataset ? ["Workspace", "Simulation", "Your Data"] : ["Simulation", "Your Data"]}
            active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {panel(data.map((d) => ({ x: d.x, y: d.y })), naive.slope, naive.intercept, PAD,
                     "#dc2626", "Naive Y ~ X", `slope = ${naive.slope.toFixed(3)}`)}
              {panel(resid, adjusted.slope, adjusted.intercept, W / 2 + PAD,
                     "#16a34a", "Adjusted Y|Z ~ X|Z", `slope = ${adjusted.slope.toFixed(3)}`)}
            </svg>
          </Panel>
          <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
              Interpretation
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {interpretation}
            </p>
          </div>
        </div>
        <Panel className="space-y-5">
          <DAG />
          {tab === "Workspace" && dataset && (
            <>
              <ColumnPicker label="X (treatment)" value={xCol} onChange={setXCol} kind="numeric" />
              <ColumnPicker label="Y (outcome)" value={yCol} onChange={setYCol} kind="numeric" />
              <ColumnPicker label="Z (confounder)" value={zCol} onChange={setZCol} kind="numeric" />
            </>
          )}
          {tab === "Simulation" ? (
            <>
              <Field label="Confounder strength" value={conf.toFixed(2)}>
                <input type="range" min={0} max={3} step={0.05} value={conf} onChange={(e) => setConf(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="Confounder exact" value={conf} onChange={setConf} step={0.05} />
              <Field label="True effect" value={eff.toFixed(2)}>
                <input type="range" min={-1} max={2} step={0.05} value={eff} onChange={(e) => setEff(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="Effect exact" value={eff} onChange={setEff} step={0.05} />
              <Field label="Sample size n" value={String(n)}>
                <input type="range" min={30} max={1000} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="n exact" value={n} onChange={(v) => setN(Math.max(10, Math.round(v)))} min={10} />
              <Btn onClick={() => setSeed((s) => s + 1)}>New sample</Btn>
            </>
          ) : (
            <>
              <DataTextArea label="X, Y, Z (one row per observation)" value={raw} onChange={setRaw} rows={6}
                placeholder="1.2, 3.5, 0.8" />
              <SampleDataButton onClick={() => setRaw(generate(1, 80, 1.5, 0.4).map((d) => `${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)}`).join("\n"))} />
            </>
          )}
          <Stat label="Naive slope"    value={naive.slope.toFixed(3)} sub={tab === "Simulation" ? `bias from ${eff.toFixed(2)}` : undefined} />
          <Stat label="Adjusted slope" value={adjusted.slope.toFixed(3)} />
          <Stat label="Matching slope" value={matched.toFixed(3)} sub={`${binSlopes.length} bins`} />
        </Panel>
      </div>
    </div>
  );
}

function DAG() {
  return (
    <svg viewBox="0 0 200 110" className="w-full">
      <defs>
        <marker id="cau-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill="var(--chart-muted)" />
        </marker>
      </defs>
      <circle cx={40} cy={80} r={18} fill="var(--chart-bg)" stroke="var(--chart-ink)" strokeWidth={1.5} />
      <text x={40} y={86} textAnchor="middle" fontSize="14" fontWeight={600}>X</text>
      <circle cx={160} cy={80} r={18} fill="var(--chart-bg)" stroke="var(--chart-ink)" strokeWidth={1.5} />
      <text x={160} y={86} textAnchor="middle" fontSize="14" fontWeight={600}>Y</text>
      <circle cx={100} cy={20} r={18} fill="var(--chart-bg)" stroke="#fb923c" strokeWidth={2} />
      <text x={100} y={26} textAnchor="middle" fontSize="14" fontWeight={600}>Z</text>
      <line x1={88}  y1={32} x2={56}  y2={66} stroke="var(--chart-muted)" strokeWidth={1.5} markerEnd="url(#cau-ar)" />
      <line x1={112} y1={32} x2={144} y2={66} stroke="var(--chart-muted)" strokeWidth={1.5} markerEnd="url(#cau-ar)" />
      <line x1={60}  y1={80} x2={140} y2={80} stroke="var(--chart-ink)" strokeWidth={1.5} markerEnd="url(#cau-ar)" />
    </svg>
  );
}
