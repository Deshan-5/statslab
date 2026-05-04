"use client";

import { useMemo, useState } from "react";
import {
  normalPDF, normalCDF, normalInv,
  parseNumbers, mean, sd, skewness, kurtosis,
} from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 36;

function pdfPath(mu: number, sigma: number) {
  const xs = Array.from({ length: 240 }, (_, i) => mu - 5 * sigma + (10 * sigma * i) / 239);
  const ys = xs.map((x) => normalPDF(x, mu, sigma));
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + ((x - (mu - 5 * sigma)) / (10 * sigma)) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" ");
  return { xs, ys, ymax, px, py, path };
}

const SAMPLE = "62, 65, 68, 70, 71, 72, 72, 73, 74, 75, 76, 77, 78, 80, 82, 84";

export default function NormalDistributionTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState("Curve");
  const [mu, setMu] = useState(0);
  const [sigma, setSigma] = useState(1);

  // probability calculator
  const [calcMode, setCalcMode] = useState<"lt" | "gt" | "between">("lt");
  const [aVal, setAVal] = useState(1);
  const [bVal, setBVal] = useState(2);

  // z-score calculator
  const [rawX, setRawX] = useState(75);

  // data overlay
  const [rawData, setRawData] = useState("");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const manualData = useMemo(() => parseNumbers(rawData), [rawData]);
  const dataPts = tab === "Data Overlay" && wsData && wsData.length >= 2 ? wsData : manualData;

  const c = pdfPath(mu, sigma);

  // shaded region path
  const shadeRegion = (() => {
    const inRegion = (x: number) =>
      calcMode === "lt" ? x <= aVal :
      calcMode === "gt" ? x >= aVal :
      x >= aVal && x <= bVal;
    let d = "";
    let started = false;
    for (let i = 0; i < c.xs.length; i++) {
      const x = c.xs[i], y = c.ys[i];
      if (inRegion(x)) {
        if (!started) { d += `M${c.px(x)},${H - PAD} L${c.px(x)},${c.py(y)}`; started = true; }
        else d += ` L${c.px(x)},${c.py(y)}`;
      } else if (started) {
        d += ` L${c.px(c.xs[i - 1])},${H - PAD} Z`;
        started = false;
      }
    }
    if (started) {
      const last = c.xs[c.xs.length - 1];
      d += ` L${c.px(last)},${H - PAD} Z`;
    }
    return d;
  })();

  const probability =
    calcMode === "lt"      ? normalCDF((aVal - mu) / sigma) :
    calcMode === "gt"      ? 1 - normalCDF((aVal - mu) / sigma) :
                             normalCDF((bVal - mu) / sigma) - normalCDF((aVal - mu) / sigma);

  const z = (rawX - mu) / sigma;
  const percentile = normalCDF(z) * 100;

  const overlayInterpretation = (() => {
    if (tab !== "Data Overlay" || !dataPts || dataPts.length < 4) return null;
    const fittedMu = mean(dataPts);
    const fittedSigma = sd(dataPts);
    const sk = skewness(dataPts);
    const ek = kurtosis(dataPts);
    const looksNormal = Math.abs(sk) < 0.5 && Math.abs(ek) < 1;
    return `Fitted μ=${fittedMu.toFixed(3)}, σ=${fittedSigma.toFixed(3)}. Sample skew=${sk.toFixed(3)}, excess kurt=${ek.toFixed(3)} — data ${looksNormal ? "appears" : "does not appear"} approximately Normal (rule of thumb: |skew|<0.5 and |excess kurt|<1).`;
  })();

  // overlay histogram
  const histo = (() => {
    if (!dataPts || dataPts.length < 2) return null;
    const bins = 14;
    const lo = mu - 5 * sigma, hi = mu + 5 * sigma;
    const w = (hi - lo) / bins;
    const counts = Array(bins).fill(0);
    for (const v of dataPts) {
      if (v < lo || v >= hi) continue;
      counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    }
    const max = Math.max(...counts, 1);
    // density-normalize
    const norm = counts.map((c) => c / dataPts.length / w);
    return { norm, lo, w, max: Math.max(...norm), bins };
  })();

  return (
    <div className="space-y-6">
      <Tabs tabs={["Curve", "Probability", "Z-Score", "Data Overlay"]} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              <line x1={c.px(mu)} y1={PAD} x2={c.px(mu)} y2={H - PAD} stroke="#fb923c" strokeDasharray="4 4" />
              {tab === "Probability" && shadeRegion && (
                <path d={shadeRegion} fill="#fb923c" fillOpacity={0.18} />
              )}
              {tab === "Z-Score" && (
                <line x1={c.px(rawX)} y1={PAD} x2={c.px(rawX)} y2={H - PAD} stroke="#2563eb" strokeWidth={2} />
              )}
              {tab === "Data Overlay" && histo && (() => {
                const ymax = Math.max(c.ymax, histo.max);
                const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
                const barW = (W - 2 * PAD) / histo.bins;
                return histo.norm.map((v, i) => (
                  <rect key={i}
                    x={PAD + i * barW + 1}
                    y={py(v)}
                    width={barW - 2}
                    height={H - PAD - py(v)}
                    fill="var(--chart-ink)" fillOpacity={0.18}
                  />
                ));
              })()}
              <path d={c.path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
              {[-3, -2, -1, 0, 1, 2, 3].map((z) => {
                const x = mu + z * sigma;
                return <text key={z} x={c.px(x)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{x.toFixed(1)}</text>;
              })}
            </svg>
          </Panel>
          {overlayInterpretation && (
            <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {overlayInterpretation}
              </p>
            </div>
          )}
        </div>

        <Panel className="space-y-5">
          <Field label="μ (mean)" value={mu.toFixed(2)}>
            <input type="range" min={-5} max={5} step={0.1} value={mu} onChange={(e) => setMu(Number(e.target.value))} className="w-full" />
          </Field>
          <NumberInput label="μ exact" value={mu} onChange={setMu} step={0.1} />
          <Field label="σ (std)" value={sigma.toFixed(2)}>
            <input type="range" min={0.2} max={5} step={0.1} value={sigma} onChange={(e) => setSigma(Number(e.target.value))} className="w-full" />
          </Field>
          <NumberInput label="σ exact" value={sigma} onChange={setSigma} step={0.1} min={0.01} />

          {tab === "Curve" && (
            <>
              <Stat label="Variance σ²" value={(sigma * sigma).toFixed(3)} />
              <Stat label="68% interval" value={`[${(mu - sigma).toFixed(2)}, ${(mu + sigma).toFixed(2)}]`} />
              <Stat label="95% interval" value={`[${(mu - 2 * sigma).toFixed(2)}, ${(mu + 2 * sigma).toFixed(2)}]`} />
              <Stat label="99.7% interval" value={`[${(mu - 3 * sigma).toFixed(2)}, ${(mu + 3 * sigma).toFixed(2)}]`} />
            </>
          )}

          {tab === "Probability" && (
            <>
              <Select label="Region" value={calcMode}
                onChange={(v) => setCalcMode(v as "lt" | "gt" | "between")}
                options={[
                  { value: "lt", label: "P(X ≤ a)" },
                  { value: "gt", label: "P(X ≥ a)" },
                  { value: "between", label: "P(a ≤ X ≤ b)" },
                ]} />
              <NumberInput label="a" value={aVal} onChange={setAVal} step={0.1} />
              {calcMode === "between" && <NumberInput label="b" value={bVal} onChange={setBVal} step={0.1} />}
              <Stat label="Probability" value={probability.toFixed(4)} sub={`${(probability * 100).toFixed(2)}%`} />
              <Formula text={
                calcMode === "lt" ? `Φ((${aVal} − ${mu})/${sigma})` :
                calcMode === "gt" ? `1 − Φ((${aVal} − ${mu})/${sigma})` :
                `Φ((${bVal} − ${mu})/${sigma}) − Φ((${aVal} − ${mu})/${sigma})`
              } />
            </>
          )}

          {tab === "Z-Score" && (
            <>
              <NumberInput label="Raw value x" value={rawX} onChange={setRawX} step={0.1} />
              <Stat label="z-score" value={z.toFixed(4)} />
              <Stat label="Percentile" value={`${percentile.toFixed(2)}%`} />
              <Formula text={`z = (x − μ) / σ = (${rawX} − ${mu}) / ${sigma}`} />
              <div className="text-xs text-neutral-500 mt-2">
                Inverse: at the {percentile.toFixed(0)}th percentile, x ≈ {(mu + normalInv(percentile / 100) * sigma).toFixed(2)}
              </div>
            </>
          )}

          {tab === "Data Overlay" && (
            <>
              {dataset && (
                <ColumnPicker label="Workspace column (optional)" value={valueCol} onChange={setValueCol} kind="numeric" autoPick={false} />
              )}
              {!(valueCol && wsData) && (
                <>
                  <DataTextArea label="Data" value={rawData} onChange={setRawData}
                    placeholder="62, 65, 68, …" rows={5} />
                  <SampleDataButton onClick={() => setRawData(SAMPLE)} />
                </>
              )}
              {dataPts && dataPts.length >= 2 && (
                <>
                  <Stat label="Sample n" value={`${dataPts.length}`} />
                  <Stat label="Sample mean" value={mean(dataPts).toFixed(3)} sub={`vs μ = ${mu}`} />
                  <Stat label="Sample SD"   value={sd(dataPts).toFixed(3)}   sub={`vs σ = ${sigma}`} />
                  <Btn onClick={() => { setMu(Number(mean(dataPts).toFixed(2))); setSigma(Number(sd(dataPts).toFixed(2))); }}>
                    Fit μ, σ to data
                  </Btn>
                </>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
