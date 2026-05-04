"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseNumbers, mean, sd, median, quantile,
} from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const SAMPLE = "12, 14, 9, 18, 22, 11, 13, 19, 16, 15, 14, 17, 12, 21, 10, 13, 18, 16, 14, 12";

type Statistic = "mean" | "median" | "sd" | "p25" | "p75";

function compute(stat: Statistic, arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  if (stat === "mean")    return mean(arr);
  if (stat === "median")  return median(arr);
  if (stat === "sd")      return sd(arr);
  if (stat === "p25")     return quantile(sorted, 0.25);
  return quantile(sorted, 0.75);
}

export default function BootstrapTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState<string>(dataset ? "Workspace" : "Your Data");
  const [raw, setRaw] = useState(SAMPLE);
  const [stat, setStat] = useState<Statistic>("mean");
  const [B, setB] = useState(2000);
  const [animated, setAnimated] = useState(false);
  const [stats, setStats] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [valueCol, setValueCol] = useState<string | null>(null);

  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const manualData = useMemo(() => parseNumbers(raw) ?? [], [raw]);
  const data = tab === "Workspace" && wsData ? wsData : manualData;
  const observed = data.length > 0 ? compute(stat, data) : 0;

  function runAll() {
    if (data.length < 2) return;
    const out: number[] = [];
    for (let i = 0; i < B; i++) {
      const re = Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
      out.push(compute(stat, re));
    }
    setStats(out);
  }

  function runAnimated() {
    if (data.length < 2 || running) return;
    setStats([]);
    setRunning(true);
  }
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setStats((prev) => {
        if (prev.length >= B) { setRunning(false); return prev; }
        const re = Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
        return [...prev, compute(stat, re)];
      });
    }, 8);
    return () => clearInterval(id);
  }, [running, B, data, stat]);

  // CI + summary
  const sortedStats = [...stats].sort((a, b) => a - b);
  const ci = stats.length > 1 ? {
    lo: quantile(sortedStats, 0.025),
    hi: quantile(sortedStats, 0.975),
  } : null;
  const bootMean = stats.length ? mean(stats) : 0;
  const bootSE = stats.length > 1 ? sd(stats) : 0;

  const statLabel: Record<Statistic, string> = {
    mean: "mean",
    median: "median",
    sd: "standard deviation",
    p25: "25th percentile",
    p75: "75th percentile",
  };
  const interpretation = useMemo(() => {
    if (!ci || stats.length < 2) return null;
    const med = median(stats);
    const skew = (bootMean - med) / (bootSE || 1);
    const shape = Math.abs(skew) < 0.15 ? "symmetric" : skew > 0 ? "right-skewed" : "left-skewed";
    const bias = bootMean - observed;
    return `Bootstrap 95% percentile CI for the ${statLabel[stat]}: [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]. Bootstrap SE = ${bootSE.toFixed(3)}; bias ≈ ${bias >= 0 ? "+" : ""}${bias.toFixed(3)} from observed (${observed.toFixed(3)}). The sampling distribution looks ${shape} across ${stats.length} resamples.`;
  }, [ci, stats, bootMean, bootSE, observed, stat]);

  // histogram
  const W = 720, H = 320, PAD = 36;
  const BINS = 40;
  let lo = 0, hi = 1;
  if (stats.length) {
    lo = Math.min(...stats); hi = Math.max(...stats);
    const pad = (hi - lo) * 0.08 || 0.5;
    lo -= pad; hi += pad;
  }
  const w = (hi - lo) / BINS;
  const counts = Array(BINS).fill(0);
  for (const v of stats) {
    if (v < lo || v >= hi) continue;
    counts[Math.min(BINS - 1, Math.floor((v - lo) / w))]++;
  }
  const max = Math.max(1, ...counts);
  const sx = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD);
  const sy = (c: number) => H - PAD - (c / max) * (H - 2 * PAD);
  const barW = (W - 2 * PAD) / BINS;

  return (
    <div className="space-y-6">
      <Tabs tabs={dataset ? ["Workspace", "Your Data"] : ["Your Data"]} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {counts.map((c, i) => (
                <rect key={i} x={PAD + i * barW + 0.5} y={sy(c)} width={barW - 1}
                      height={H - PAD - sy(c)} fill="var(--chart-ink)" fillOpacity={0.85} rx={1.5} />
              ))}
              {stats.length > 0 && (
                <>
                  <line x1={sx(observed)} y1={PAD} x2={sx(observed)} y2={H - PAD}
                        stroke="#fb923c" strokeWidth={2} strokeDasharray="4 4" />
                  <text x={sx(observed)} y={PAD + 14} textAnchor="middle" fontSize="11" fill="#fb923c">observed</text>
                </>
              )}
              {ci && (
                <>
                  <line x1={sx(ci.lo)} y1={H - PAD - 8} x2={sx(ci.hi)} y2={H - PAD - 8}
                        stroke="#16a34a" strokeWidth={3} strokeLinecap="round" />
                  <text x={sx((ci.lo + ci.hi) / 2)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="#16a34a">95% CI</text>
                </>
              )}
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
          {tab === "Workspace" && dataset ? (
            <ColumnPicker label="Column" value={valueCol} onChange={setValueCol} kind="numeric" />
          ) : (
            <>
              <DataTextArea label="Original sample" value={raw} onChange={setRaw} rows={5} />
              <SampleDataButton onClick={() => setRaw(SAMPLE)} />
            </>
          )}
          <Select label="Statistic" value={stat} onChange={(v) => setStat(v as Statistic)}
            options={[
              { value: "mean",   label: "Mean" },
              { value: "median", label: "Median" },
              { value: "sd",     label: "Standard deviation" },
              { value: "p25",    label: "25th percentile" },
              { value: "p75",    label: "75th percentile" },
            ]} />
          <Field label="B (resamples)" value={String(B)}>
            <input type="range" min={100} max={10000} step={100} value={B}
                   onChange={(e) => setB(Number(e.target.value))} className="w-full" />
          </Field>
          <NumberInput label="B exact" value={B} onChange={(v) => setB(Math.max(100, Math.round(v)))} min={100} max={50000} />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} />
            Animate accumulation
          </label>
          <Btn primary onClick={() => animated ? runAnimated() : runAll()}>
            {running ? "Running…" : "Run bootstrap"}
          </Btn>
          <Stat label="Observed" value={observed.toFixed(4)} />
          <Stat label="Bootstrap mean" value={bootMean.toFixed(4)} />
          <Stat label="Bootstrap SE"   value={bootSE.toFixed(4)} />
          {ci && <Stat label="95% percentile CI" value={`[${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`} />}
          <Stat label="Resamples drawn" value={`${stats.length} / ${B}`} />
          <Formula text="θ̂* ← statistic of resample with replacement; SE_boot = SD(θ̂*₁..θ̂*_B)" />
        </Panel>
      </div>
    </div>
  );
}
