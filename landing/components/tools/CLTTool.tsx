"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  rngFor, gauss, mean, sd, normalPDF, parseNumbers, skewness,
} from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Interpretation, useTutorInput, useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 36;
const BINS = 30;

type Source = "Normal" | "Uniform" | "Exponential" | "Bimodal" | "Custom" | "Workspace";

function popSampler(src: Source, custom: number[] | null) {
  const rng = rngFor(Math.floor(Math.random() * 1e9));
  if (src === "Normal")      return { fn: () => gauss(rng, 0, 1),                      mu: 0, sigma: 1 };
  if (src === "Uniform")     return { fn: () => rng() * Math.sqrt(12) - Math.sqrt(3),   mu: 0, sigma: 1 };
  if (src === "Exponential") return { fn: () => -Math.log(Math.max(rng(), 1e-9)) - 1,   mu: 0, sigma: 1 };
  if (src === "Bimodal")     return { fn: () => (rng() > 0.5 ? gauss(rng, -1.5, 0.5) : gauss(rng, 1.5, 0.5)), mu: 0, sigma: Math.sqrt(1.5 * 1.5 + 0.25) };
  // custom
  if (!custom || custom.length === 0) return { fn: () => gauss(rng), mu: 0, sigma: 1 };
  const m = mean(custom), s = sd(custom);
  return { fn: () => custom[Math.floor(Math.random() * custom.length)], mu: m, sigma: s };
}

export default function CLTTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState("Simulation");
  const [n, setN] = useState(15);
  const [src, setSrc] = useState<Source>("Exponential");
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast" | "manual">("fast");
  const [running, setRunning] = useState(true);
  const [customRaw, setCustomRaw] = useState("");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const customData = useMemo(() => {
    if (src === "Workspace") return wsData;
    return parseNumbers(customRaw);
  }, [customRaw, src, wsData]);

  const [means, setMeans] = useState<number[]>([]);
  const samplerRef = useRef<{ fn: () => number; mu: number; sigma: number }>(popSampler(src === "Workspace" ? "Custom" : src, customData));

  // re-init sampler whenever source / n / customData changes
  useEffect(() => {
    samplerRef.current = popSampler(src === "Workspace" ? "Custom" : src, customData);
    setMeans([]);
  }, [src, customData, n]);

  useEffect(() => {
    if (!running || speed === "manual") return;
    const interval = speed === "slow" ? 200 : speed === "medium" ? 70 : 25;
    const id = setInterval(() => {
      let s = 0;
      for (let i = 0; i < n; i++) s += samplerRef.current.fn();
      setMeans((prev) => {
        const nx = [...prev, s / n];
        if (nx.length > 4000) nx.shift();
        return nx;
      });
    }, interval);
    return () => clearInterval(id);
  }, [running, speed, n]);

  const drawOnce = () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += samplerRef.current.fn();
    setMeans((p) => [...p, s / n]);
  };

  useTutorInput({
    n: setN,
    speed: setSpeed,
    src: (val) => {
      // Validate or map value to Source
      if (["Normal", "Uniform", "Exponential", "Bimodal", "Custom"].includes(val)) {
        setSrc(val as Source);
      }
    },
    reset: () => setMeans([]),
    draw: () => drawOnce(),
  });

  useRegisterToolState("central-limit-theorem", { n, src, speed, running, customRaw, valueCol, tab }, {
    n: setN,
    src: (val) => { if (["Normal", "Uniform", "Exponential", "Bimodal", "Custom", "Workspace"].includes(val)) setSrc(val as Source); },
    speed: setSpeed,
    running: setRunning,
    customRaw: setCustomRaw,
    valueCol: setValueCol,
    tab: setTab,
  });

  // bin
  const sigma = samplerRef.current.sigma;
  const mu = samplerRef.current.mu;
  const theoreticalSE = sigma / Math.sqrt(n);
  const lo = mu - 4 * theoreticalSE, hi = mu + 4 * theoreticalSE;
  const w = (hi - lo) / BINS;
  const counts = Array(BINS).fill(0);
  for (const v of means) {
    if (v < lo || v >= hi) continue;
    counts[Math.min(BINS - 1, Math.floor((v - lo) / w))]++;
  }
  const total = Math.max(1, means.length);
  const density = counts.map((c) => c / total / w);
  const max = Math.max(...density, normalPDF(mu, mu, theoreticalSE));
  const sx = (x: number) => PAD + ((x - lo) / (hi - lo)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y / max) * (H - 2 * PAD);
  const barW = (W - 2 * PAD) / BINS;

  // theoretical normal overlay
  const xs = Array.from({ length: 200 }, (_, i) => lo + ((hi - lo) * i) / 199);
  const theory = xs.map((x) => normalPDF(x, mu, theoreticalSE));
  const theoryPath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(2)},${sy(theory[i]).toFixed(2)}`).join(" ");

  const meanSkew = means.length >= 8 ? skewness(means) : null;
  const closeToNormal = meanSkew !== null && Math.abs(meanSkew) < 0.3;
  const interpretation = means.length >= 8
    ? `With n=${n}, the sampling distribution of x̄ has SE=σ/√n=${theoreticalSE.toFixed(3)}. After ${means.length} sampled means, x̄ ${closeToNormal ? "looks ≈ Normal" : "is still settling toward Normal"} (skew=${meanSkew!.toFixed(3)}) — ${closeToNormal ? "the CLT is doing its job" : "more draws or larger n will tighten the bell"}.`
    : null;

  return (
    <div className="space-y-6">
      <Tabs tabs={["Simulation"]} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {density.map((v, i) => (
                <rect key={i} x={PAD + i * barW + 0.5} y={sy(v)} width={barW - 1}
                      height={H - PAD - sy(v)} fill="var(--chart-ink)" fillOpacity={0.85} rx={1.5}
                      style={{ transition: "y 0.15s linear, height 0.15s linear" }} />
              ))}
              <path d={theoryPath} fill="none" stroke="#fb923c" strokeWidth={2.2} />
              <line x1={sx(mu)} y1={PAD} x2={sx(mu)} y2={H - PAD} stroke="#fb923c" strokeDasharray="4 4" />
              <text x={PAD} y={20} fontSize="11" fill="var(--chart-muted)">
                Sampling distribution of x̄ — n = {n}, draws = {means.length}
              </text>
              <text x={W - PAD} y={20} fontSize="11" fill="var(--chart-muted)" textAnchor="end">
                σ/√n = {theoreticalSE.toFixed(3)}
              </text>
            </svg>
          </Panel>
          <Interpretation text={interpretation} />
        </div>

        <Panel className="space-y-5">
          <Field label="Sample size n" value={String(n)}>
            <input type="range" min={1} max={200} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
          </Field>
          <NumberInput label="n exact" value={n} onChange={(v) => setN(Math.max(1, Math.round(v)))} min={1} max={500} />
          <Select label="Source distribution" value={src}
            onChange={(v) => setSrc(v as Source)}
            options={[
              { value: "Normal", label: "Normal" },
              { value: "Uniform", label: "Uniform" },
              { value: "Exponential", label: "Exponential" },
              { value: "Bimodal", label: "Bimodal" },
              { value: "Custom", label: "Custom" },
              ...(dataset ? [{ value: "Workspace", label: `Workspace: ${dataset.name}` }] : []),
            ]} />
          {src === "Custom" && (
            <>
              <DataTextArea label="Population values" value={customRaw} onChange={setCustomRaw} rows={4} />
              <SampleDataButton onClick={() => setCustomRaw("1,2,2,3,3,3,4,4,5,8,12,15")} />
            </>
          )}
          {src === "Workspace" && dataset && (
            <ColumnPicker label="Column (population)" value={valueCol} onChange={setValueCol} kind="numeric" />
          )}
          <Select label="Speed" value={speed}
            onChange={(v) => setSpeed(v as typeof speed)}
            options={[
              { value: "manual", label: "Manual" },
              { value: "slow", label: "Slow" },
              { value: "medium", label: "Medium" },
              { value: "fast", label: "Fast" },
            ]} />
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
            <Btn onClick={() => setMeans([])}>Reset</Btn>
          </div>
          {speed === "manual" && <Btn onClick={drawOnce} primary>Draw one sample</Btn>}
          <Stat label="Population μ"   value={mu.toFixed(3)} />
          <Stat label="Population σ"   value={sigma.toFixed(3)} />
          <Stat label="Theoretical SE" value={theoreticalSE.toFixed(3)} sub="σ/√n" />
          <Stat label="Mean of x̄"      value={(means.length ? mean(means) : 0).toFixed(3)} />
          <Stat label="SD of x̄"        value={(means.length > 1 ? sd(means) : 0).toFixed(3)} />
        </Panel>
      </div>
    </div>
  );
}
