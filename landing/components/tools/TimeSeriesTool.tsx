"use client";

import { useMemo, useState } from "react";
import { rngFor, gauss, mean, sd, acf, parseNumbers } from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 360, PAD = 28;
const N = 240;
const LAGS = 24;

type Model = "AR1" | "AR2" | "MA1" | "ARMA";

function simulate(model: Model, params: { phi: number; phi2: number; theta: number }, seed: number) {
  const rng = rngFor(seed);
  const eps = Array.from({ length: N }, () => gauss(rng));
  const xs = new Array<number>(N);
  for (let t = 0; t < N; t++) {
    const e = eps[t];
    if (model === "AR1") xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + e;
    else if (model === "AR2") xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + (t > 1 ? params.phi2 * xs[t - 2] : 0) + e;
    else if (model === "MA1") xs[t] = e + (t > 0 ? params.theta * eps[t - 1] : 0);
    else xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + e + (t > 0 ? params.theta * eps[t - 1] : 0);
  }
  return xs;
}

export default function TimeSeriesTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Simulation");
  const [model, setModel] = useState<Model>("AR1");
  const [phi, setPhi] = useState(0.7);
  const [phi2, setPhi2] = useState(-0.2);
  const [theta, setTheta] = useState(0.5);
  const [seed, setSeed] = useState(1);
  const [raw, setRaw] = useState("");
  const [valueCol, setValueCol] = useState<string | null>(null);

  const wsSeries = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);

  const userSeries = useMemo(() => parseNumbers(raw), [raw]);
  const series =
    tab === "Workspace" && wsSeries && wsSeries.length >= 4 ? wsSeries :
    tab === "Your Data" && userSeries && userSeries.length >= 4 ? userSeries :
    simulate(model, { phi, phi2, theta }, seed);

  const ac = useMemo(() => acf(series, Math.min(LAGS, Math.max(2, series.length - 1))), [series]);
  const m = mean(series), s = sd(series);

  // ADF-like indicator: is the lag-1 ACF close to 1?
  const r1 = ac[1] ?? 0;
  const stationary = Math.abs(r1) < 0.95;

  const sMin = Math.min(...series) - 0.5, sMax = Math.max(...series) + 0.5;
  const tx = (i: number) => PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const ty = (v: number) => H * 0.55 - PAD * 0.5 - ((v - sMin) / (sMax - sMin || 1)) * (H * 0.55 - 1.5 * PAD);
  const seriesPath = series.map((v, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(2)},${ty(v).toFixed(2)}`).join(" ");

  const ay = (v: number) => H - PAD - ((v + 1) / 2) * (H * 0.4 - PAD);
  const ax = (k: number) => PAD + (k / (ac.length - 1)) * (W - 2 * PAD);
  const ci = 1.96 / Math.sqrt(series.length);

  const interpretation = (() => {
    if (series.length < 8) return null;
    const q = Math.max(2, Math.floor(series.length / 4));
    const firstSlice = series.slice(0, q);
    const lastSlice = series.slice(-q);
    const firstMean = mean(firstSlice);
    const lastMean = mean(lastSlice);
    const drift = lastMean - firstMean;
    const trendLabel =
      Math.abs(drift) < 0.5 * s ? "no clear trend" :
      drift > 0 ? "an upward trend" : "a downward trend";
    let r1Label: string;
    if (Math.abs(r1) < 0.2) r1Label = "weak";
    else if (Math.abs(r1) < 0.5) r1Label = r1 > 0 ? "moderate positive" : "moderate negative";
    else r1Label = r1 > 0 ? "strong positive" : "strong negative";
    return `Lag-1 autocorrelation r₁=${r1.toFixed(3)} (${r1Label}). Series mean drifted from ${firstMean.toFixed(2)} to ${lastMean.toFixed(2)} (Δ=${drift.toFixed(2)}) — ${trendLabel}. Series is ${stationary ? "likely" : "likely not"} stationary (|r₁| ${stationary ? "<" : "≥"} 0.95).`;
  })();

  return (
    <div className="space-y-6">
      <Tabs tabs={dataset ? ["Workspace", "Simulation", "Your Data"] : ["Simulation", "Your Data"]}
            active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={ty(0)} x2={W - PAD} y2={ty(0)} stroke="var(--chart-grid)" />
              <path d={seriesPath} fill="none" stroke="var(--chart-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              <text x={PAD} y={20} fontSize="11" fill="var(--chart-muted)">
                {tab === "Simulation" ? `${model} simulated · n = ${series.length}` : `Your series · n = ${series.length}`}
              </text>

              <line x1={PAD} y1={ay(0)} x2={W - PAD} y2={ay(0)} stroke="var(--chart-muted)" />
              <line x1={PAD} y1={ay(ci)}  x2={W - PAD} y2={ay(ci)}  stroke="#fb923c" strokeDasharray="3 3" strokeWidth={1} />
              <line x1={PAD} y1={ay(-ci)} x2={W - PAD} y2={ay(-ci)} stroke="#fb923c" strokeDasharray="3 3" strokeWidth={1} />
              {ac.map((v, k) => (
                <line key={k} x1={ax(k)} y1={ay(0)} x2={ax(k)} y2={ay(v)}
                      stroke={Math.abs(v) > ci ? "#171717" : "#a3a3a3"} strokeWidth={2.5} strokeLinecap="round" />
              ))}
              <text x={PAD} y={H * 0.62} fontSize="11" fill="var(--chart-muted)">Sample ACF</text>
            </svg>
          </Panel>
          {interpretation && (
            <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {interpretation}
              </p>
            </div>
          )}
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <ColumnPicker label="Series column" value={valueCol} onChange={setValueCol} kind="numeric" />
          )}
          {tab === "Simulation" ? (
            <>
              <Select label="Model" value={model} onChange={(v) => setModel(v as Model)}
                options={[
                  { value: "AR1", label: "AR(1)" },
                  { value: "AR2", label: "AR(2)" },
                  { value: "MA1", label: "MA(1)" },
                  { value: "ARMA", label: "ARMA(1,1)" },
                ]} />
              {(model === "AR1" || model === "AR2" || model === "ARMA") && (
                <>
                  <Field label="φ" value={phi.toFixed(2)}>
                    <input type="range" min={-0.95} max={0.95} step={0.01} value={phi} onChange={(e) => setPhi(Number(e.target.value))} className="w-full" />
                  </Field>
                  <NumberInput label="φ exact" value={phi} onChange={setPhi} step={0.01} min={-0.99} max={0.99} />
                </>
              )}
              {model === "AR2" && (
                <Field label="φ₂" value={phi2.toFixed(2)}>
                  <input type="range" min={-0.95} max={0.95} step={0.01} value={phi2} onChange={(e) => setPhi2(Number(e.target.value))} className="w-full" />
                </Field>
              )}
              {(model === "MA1" || model === "ARMA") && (
                <Field label="θ" value={theta.toFixed(2)}>
                  <input type="range" min={-0.95} max={0.95} step={0.01} value={theta} onChange={(e) => setTheta(Number(e.target.value))} className="w-full" />
                </Field>
              )}
              <Btn onClick={() => setSeed((s) => s + 1)}>New noise</Btn>
            </>
          ) : (
            <>
              <DataTextArea label="Time-series values (in order)" value={raw} onChange={setRaw} rows={5} />
              <SampleDataButton onClick={() => setRaw(simulate("AR1", { phi: 0.7, phi2: 0, theta: 0 }, 1).map((v) => v.toFixed(3)).join(", "))} />
            </>
          )}
          <Stat label="Mean"     value={m.toFixed(3)} />
          <Stat label="Variance" value={(s * s).toFixed(3)} />
          <Stat label="r(1)"     value={r1.toFixed(3)} />
          <Stat label="Stationarity" value={stationary ? "✓ likely" : "✗ unlikely"}
                sub={`|r(1)| ${stationary ? "<" : "≥"} 0.95`} />
          <Stat label="95% CI band" value={`±${ci.toFixed(3)}`} />
        </Panel>
      </div>
    </div>
  );
}
