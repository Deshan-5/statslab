"use client";

import { useMemo, useState } from "react";
import {
  rngFor, gauss, mean, sd, parseNumbers, tCI, zCI,
} from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const SAMPLE = "9.1, 10.3, 8.8, 11.2, 10.5, 9.8, 10.1, 9.5, 10.0, 11.1, 9.9";

export default function ConfidenceIntervalsTool() {
  const [tab, setTab] = useState("Your Data");
  return (
    <div className="space-y-6">
      <Tabs tabs={["Your Data", "Summary Stats", "Coverage Simulation"]} active={tab} onChange={setTab} />
      {tab === "Your Data" && <YourData />}
      {tab === "Summary Stats" && <SummaryStats />}
      {tab === "Coverage Simulation" && <Coverage />}
    </div>
  );
}

function ConfidenceSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Select label="Preset" value={String(value)} onChange={(v) => onChange(Number(v))}
        options={[{ value: "0.90", label: "90%" }, { value: "0.95", label: "95%" }, { value: "0.99", label: "99%" }]} />
      <NumberInput label="Custom" value={value} onChange={(v) => onChange(Math.max(0.5, Math.min(0.999, v)))}
                   step={0.01} min={0.5} max={0.999} />
    </div>
  );
}

function CIBar({ ci, label }: { ci: { lower: number; upper: number; center: number }; label: string }) {
  const W = 600, H = 80, PAD = 24;
  const span = ci.upper - ci.lower;
  const lo = ci.lower - span * 0.4;
  const hi = ci.upper + span * 0.4;
  const sx = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="var(--chart-axis)" />
      <line x1={sx(ci.lower)} x2={sx(ci.upper)} y1={H / 2} y2={H / 2} stroke="var(--chart-ink)" strokeWidth={3} strokeLinecap="round" />
      <line x1={sx(ci.lower)} x2={sx(ci.lower)} y1={H / 2 - 8} y2={H / 2 + 8} stroke="var(--chart-ink)" strokeWidth={2} />
      <line x1={sx(ci.upper)} x2={sx(ci.upper)} y1={H / 2 - 8} y2={H / 2 + 8} stroke="var(--chart-ink)" strokeWidth={2} />
      <circle cx={sx(ci.center)} cy={H / 2} r={5} fill="#fb923c" stroke="#fff" strokeWidth={2} />
      <text x={sx(ci.lower)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{ci.lower.toFixed(3)}</text>
      <text x={sx(ci.upper)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{ci.upper.toFixed(3)}</text>
      <text x={sx(ci.center)} y={H / 2 - 14} textAnchor="middle" fontSize="11" fill="#fb923c" fontWeight={500}>x̄ = {ci.center.toFixed(3)}</text>
      <text x={W / 2} y={18} textAnchor="middle" fontSize="12" fill="var(--chart-ink)" fontWeight={500}>{label}</text>
    </svg>
  );
}

function YourData() {
  const { dataset } = useWorkspace();
  const [raw, setRaw] = useState("");
  const [conf, setConf] = useState(0.95);
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [useWs, setUseWs] = useState(!!dataset);
  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const manualData = useMemo(() => parseNumbers(raw), [raw]);
  const data = useWs && wsData ? wsData : manualData;
  const ci = data && data.length >= 2 ? tCI(data, conf) : null;
  const interpretation = ci
    ? `We are ${(conf * 100).toFixed(0)}% confident that the true population mean lies in [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}], with margin of error ±${ci.margin.toFixed(3)} (n=${data!.length}, SE=${ci.se.toFixed(3)}). If we resampled many times, about ${(conf * 100).toFixed(0)}% of such intervals would contain the true mean.`
    : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Panel>
          {ci ? (
            <>
              <CIBar ci={ci} label={`${(conf * 100).toFixed(0)}% T-interval (σ unknown)`} />
              <p className="text-sm text-neutral-600 mt-4 leading-relaxed">
                We are <span className="font-medium">{(conf * 100).toFixed(0)}% confident</span> the true population mean lies between{" "}
                <span className="font-mono">[{ci.lower.toFixed(3)}, {ci.upper.toFixed(3)}]</span>.
              </p>
            </>
          ) : (
            <div className="text-sm text-neutral-500 text-center py-12">Paste at least two values to compute a CI.</div>
          )}
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
        {dataset && (
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 -mt-2">
            <input type="checkbox" checked={useWs} onChange={(e) => setUseWs(e.target.checked)} />
            Use workspace
          </label>
        )}
        {useWs && dataset ? (
          <ColumnPicker label="Column" value={valueCol} onChange={setValueCol} kind="numeric" />
        ) : (
          <>
            <DataTextArea label="Sample data" value={raw} onChange={setRaw} rows={5} />
            <SampleDataButton onClick={() => setRaw(SAMPLE)} />
          </>
        )}
        <ConfidenceSelect value={conf} onChange={setConf} />
        {data && (
          <>
            <Stat label="Sample size n" value={String(data.length)} />
            <Stat label="x̄"   value={data.length ? mean(data).toFixed(4) : "—"} />
            <Stat label="s"   value={data.length > 1 ? sd(data).toFixed(4) : "—"} />
            {ci && <Stat label="Margin"   value={`±${ci.margin.toFixed(4)}`} sub={`SE = ${ci.se.toFixed(4)}`} />}
          </>
        )}
        <Formula text="x̄ ± t* · (s / √n)" />
      </Panel>
    </div>
  );
}

function SummaryStats() {
  const [xbar, setXbar] = useState(10);
  const [s, setS] = useState(2);
  const [n, setN] = useState(30);
  const [conf, setConf] = useState(0.95);
  const [sigmaKnown, setSigmaKnown] = useState(false);
  const ci = sigmaKnown
    ? zCI(xbar, s, n, conf)
    : (() => {
        // synthesize CI directly without raw data
        const seVal = s / Math.sqrt(n);
        // re-use tCI shape using a fake array? simpler: compute t* manually via tCrit
        // Already present: tCI requires data. Inline equivalent:
        // pull tCrit from stats:
        // (we keep this readable rather than DRY)
        return null;
      })();
  // Compute t-interval inline:
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tCrit } = require("./shared/stats") as typeof import("./shared/stats");
  const tStar = tCrit(1 - conf, n - 1);
  const seVal = s / Math.sqrt(n);
  const margin = sigmaKnown ? (ci as ReturnType<typeof zCI>).margin : tStar * seVal;
  const lower = xbar - margin, upper = xbar + margin;
  const interpretation = `We are ${(conf * 100).toFixed(0)}% confident that the true mean lies in [${lower.toFixed(3)}, ${upper.toFixed(3)}], with margin of error ±${margin.toFixed(3)} around x̄=${xbar.toFixed(3)} (n=${n}, ${sigmaKnown ? "σ known — Z-interval" : "σ unknown — T-interval"}).`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Panel>
          <CIBar ci={{ lower, upper, center: xbar }}
                 label={`${(conf * 100).toFixed(0)}% ${sigmaKnown ? "Z" : "T"}-interval`} />
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
        <NumberInput label="Sample mean x̄" value={xbar} onChange={setXbar} step={0.1} />
        <NumberInput label={sigmaKnown ? "σ (known)" : "s (sample SD)"} value={s} onChange={setS} step={0.1} min={0.001} />
        <NumberInput label="Sample size n" value={n} onChange={(v) => setN(Math.max(2, Math.round(v)))} min={2} />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={sigmaKnown} onChange={(e) => setSigmaKnown(e.target.checked)} />
          σ is known (use Z-interval)
        </label>
        <ConfidenceSelect value={conf} onChange={setConf} />
        <Stat label="Margin of error" value={`±${margin.toFixed(4)}`} />
        <Stat label="Standard error"  value={seVal.toFixed(4)} />
        <Stat label="Lower"           value={lower.toFixed(4)} />
        <Stat label="Upper"           value={upper.toFixed(4)} />
        <Formula text={sigmaKnown ? "x̄ ± z* · (σ / √n)" : "x̄ ± t* · (s / √n)"} />
      </Panel>
    </div>
  );
}

function Coverage() {
  const [n, setN] = useState(25);
  const [k, setK] = useState(60);
  const [conf, setConf] = useState(0.95);
  const [seed, setSeed] = useState(1);
  const trueMu = 50, sigma = 10;

  const ivs = useMemo(() => {
    const rng = rngFor(seed);
    const out: { lo: number; hi: number; mean: number; hit: boolean }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tCrit } = require("./shared/stats") as typeof import("./shared/stats");
    const tStar = tCrit(1 - conf, n - 1);
    for (let i = 0; i < k; i++) {
      let s = 0, ssq = 0;
      const sample: number[] = [];
      for (let j = 0; j < n; j++) { const v = gauss(rng, trueMu, sigma); sample.push(v); s += v; ssq += v * v; }
      const m = s / n;
      const v = (ssq - n * m * m) / (n - 1);
      const se = Math.sqrt(v / n);
      const margin = tStar * se;
      const lo = m - margin, hi = m + margin;
      out.push({ lo, hi, mean: m, hit: lo <= trueMu && trueMu <= hi });
    }
    return out;
  }, [n, k, conf, seed]);
  const covered = ivs.filter((i) => i.hit).length;
  const coverPct = (covered / k) * 100;
  const nominalPct = conf * 100;
  const diff = coverPct - nominalPct;
  const interpretation = `Of ${k} simulated samples (n=${n} each from N(${trueMu}, ${sigma}²)), ${covered} intervals (${coverPct.toFixed(1)}%) captured the true mean μ=${trueMu}. Nominal coverage is ${nominalPct.toFixed(0)}% — empirical is ${Math.abs(diff) < 2 ? "right on target" : diff > 0 ? `${diff.toFixed(1)} pp higher (sampling noise)` : `${Math.abs(diff).toFixed(1)} pp lower (sampling noise)`}.`;

  const W = 720, H = 360, PAD = 28;
  const minX = trueMu - 5 * sigma / Math.sqrt(n), maxX = trueMu + 5 * sigma / Math.sqrt(n);
  const sx = (v: number) => PAD + ((v - minX) / (maxX - minX)) * (W - 2 * PAD);
  const rowY = (i: number) => PAD + (i + 0.5) * ((H - 2 * PAD) / k);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Panel>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            <line x1={sx(trueMu)} y1={PAD} x2={sx(trueMu)} y2={H - PAD} stroke="#fb923c" strokeWidth={1.5} strokeDasharray="4 4" />
            {ivs.map((iv, i) => (
              <g key={i}>
                <line x1={sx(iv.lo)} x2={sx(iv.hi)} y1={rowY(i)} y2={rowY(i)}
                  stroke={iv.hit ? "#16a34a" : "#dc2626"} strokeWidth={2} strokeLinecap="round" />
                <circle cx={sx(iv.mean)} cy={rowY(i)} r={2.5} fill={iv.hit ? "#16a34a" : "#dc2626"} />
              </g>
            ))}
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
        <Stat label="Empirical coverage" value={`${covered}/${k} = ${((covered / k) * 100).toFixed(1)}%`} />
        <Stat label="Nominal" value={`${(conf * 100).toFixed(0)}%`} />
        <Field label="n per CI" value={String(n)}>
          <input type="range" min={5} max={150} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
        </Field>
        <NumberInput label="n exact" value={n} onChange={(v) => setN(Math.max(2, Math.round(v)))} min={2} />
        <Field label="# of CIs" value={String(k)}>
          <input type="range" min={10} max={200} value={k} onChange={(e) => setK(Number(e.target.value))} className="w-full" />
        </Field>
        <ConfidenceSelect value={conf} onChange={setConf} />
        <Btn onClick={() => setSeed((s) => s + 1)}>New samples</Btn>
      </Panel>
    </div>
  );
}
