"use client";

import { useMemo, useState } from "react";
import {
  zTest, tTest, welchTest, pairedTTest, chi2GoF,
  parseNumbers, mean, sd, normalPDF, tCDF, chi2CDF,
} from "./shared/stats";
import {
  Tabs, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Verdict, StepByStep, Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

type Tail = "two" | "left" | "right";
const TAIL_OPTS = [
  { value: "two", label: "two-tailed" },
  { value: "left", label: "left-tailed" },
  { value: "right", label: "right-tailed" },
];
const ALPHA_OPTS = [
  { value: "0.01", label: "0.01" },
  { value: "0.05", label: "0.05" },
  { value: "0.10", label: "0.10" },
];

const W = 720, H = 280, PAD = 28;

function effectSizeLabel(d: number): string {
  const a = Math.abs(d);
  if (a < 0.2) return "negligible";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  return "large";
}

function Interpretation({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
        Interpretation
      </div>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
        {text}
      </p>
    </div>
  );
}

function htInterpretation(r: { pValue: number; reject: boolean; effectSize?: number }, alpha: number): string {
  const d = r.effectSize ?? 0;
  const verdict = r.reject ? "Reject H₀" : "Fail to reject H₀";
  const pStr = r.pValue < 1e-4 ? r.pValue.toExponential(2) : r.pValue.toFixed(4);
  return `${verdict} at α=${alpha} — p=${pStr}. Effect size d=${d.toFixed(3)} (${effectSizeLabel(d)}; thresholds <0.2 / 0.2–0.5 / 0.5–0.8 / >0.8).`;
}

function zRegionChart({ stat, alpha, tail, df }: { stat: number; alpha: number; tail: Tail; df: number | null }) {
  const xs = Array.from({ length: 240 }, (_, i) => -4 + (8 * i) / 239);
  const pdf = (x: number) => df ? Math.exp(-0.5 * x * x) * 1 : normalPDF(x); // visual normal
  const ys = xs.map(pdf);
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + ((x + 4) / 8) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" ");
  const cv = df === null ? -1 / 0 : 0; // not used directly
  // for visualization we just shade by tail and stat-comparison
  // crit-by-area approximation
  const critGuess = tail === "two" ? (alpha === 0.01 ? 2.576 : alpha === 0.05 ? 1.96 : 1.645)
                                   : (alpha === 0.01 ? 2.326 : alpha === 0.05 ? 1.645 : 1.282);
  function shade(side: "left" | "right") {
    const c = side === "right" ? critGuess : -critGuess;
    const filtered = side === "right" ? xs.filter((x) => x >= c) : xs.filter((x) => x <= c);
    const lys = filtered.map(pdf);
    let d = `M${px(side === "right" ? c : filtered[0])},${H - PAD}`;
    filtered.forEach((x, i) => { d += ` L${px(x).toFixed(2)},${py(lys[i]).toFixed(2)}`; });
    d += ` L${px(side === "right" ? filtered[filtered.length - 1] : c)},${H - PAD} Z`;
    return d;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {(tail === "two" || tail === "right") && <path d={shade("right")} fill="#dc2626" fillOpacity={0.12} />}
      {(tail === "two" || tail === "left")  && <path d={shade("left")}  fill="#dc2626" fillOpacity={0.12} />}
      <path d={path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
      <line x1={px(stat)} y1={H - PAD} x2={px(stat)} y2={py(pdf(Math.max(-3.99, Math.min(3.99, stat))))}
            stroke="#fb923c" strokeWidth={2} />
      <circle cx={px(Math.max(-3.99, Math.min(3.99, stat)))} cy={py(pdf(Math.max(-3.99, Math.min(3.99, stat))))}
              r={5} fill="#fb923c" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

export default function HypothesisTestTool() {
  const [tab, setTab] = useState("One-Sample Z");
  return (
    <div className="space-y-6">
      <Tabs tabs={["One-Sample Z", "One-Sample T", "Two-Sample T", "Paired T", "Chi-Square"]} active={tab} onChange={setTab} />
      {tab === "One-Sample Z" && <OneZ />}
      {tab === "One-Sample T" && <OneT />}
      {tab === "Two-Sample T" && <TwoT />}
      {tab === "Paired T" && <Paired />}
      {tab === "Chi-Square" && <ChiSq />}
    </div>
  );
}

function OneZ() {
  const [xbar, setXbar] = useState(102);
  const [mu0, setMu0]   = useState(100);
  const [sigma, setSig] = useState(10);
  const [n, setN]       = useState(30);
  const [alpha, setA]   = useState(0.05);
  const [tail, setTail] = useState<Tail>("two");
  const r = zTest(xbar, mu0, sigma, n, alpha, tail);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>{zRegionChart({ stat: r.testStat, alpha, tail, df: null })}</Panel>
        <Panel><Verdict reject={r.reject} pValue={r.pValue} alpha={alpha} /></Panel>
        <Interpretation text={htInterpretation(r, alpha)} />
      </div>
      <Panel className="space-y-5">
        <NumberInput label="Sample mean x̄" value={xbar} onChange={setXbar} step={0.1} />
        <NumberInput label="Null mean μ₀"   value={mu0}  onChange={setMu0}  step={0.1} />
        <NumberInput label="σ (known)"      value={sigma} onChange={setSig} step={0.1} min={0.001} />
        <NumberInput label="Sample size n"  value={n}    onChange={(v) => setN(Math.max(2, Math.round(v)))} min={2} />
        <Select label="α" value={String(alpha)} onChange={(v) => setA(Number(v))} options={ALPHA_OPTS} />
        <Select label="Alternative" value={tail} onChange={(v) => setTail(v as Tail)} options={TAIL_OPTS} />
        <Stat label="Z statistic" value={r.testStat.toFixed(4)} />
        <Stat label="p-value"     value={r.pValue.toFixed(4)} />
        <Stat label="Critical |z*|" value={r.critValue.toFixed(4)} />
        <Stat label="Cohen's d"   value={(r.effectSize ?? 0).toFixed(4)} />
        <Formula text="z = (x̄ − μ₀) / (σ / √n)" />
        <StepByStep steps={[
          { label: "SE = σ/√n", value: (sigma / Math.sqrt(n)).toFixed(4) },
          { label: "x̄ − μ₀",     value: (xbar - mu0).toFixed(4) },
          { label: "z",          value: r.testStat.toFixed(4) },
          { label: "p-value",    value: r.pValue.toFixed(4) },
        ]} />
      </Panel>
    </div>
  );
}

function OneT() {
  const { dataset } = useWorkspace();
  const SAMPLE = "5.1, 5.4, 4.9, 5.3, 5.0, 5.2, 4.8, 5.5, 5.1, 5.0";
  const [raw, setRaw] = useState(SAMPLE);
  const [mu0, setMu0] = useState(5.0);
  const [alpha, setA] = useState(0.05);
  const [tail, setTail] = useState<Tail>("two");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [useWs, setUseWs] = useState(!!dataset);
  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const manualData = useMemo(() => parseNumbers(raw), [raw]);
  const data = useWs && wsData ? wsData : manualData;
  const r = data && data.length >= 2 ? tTest(data, mu0, alpha, tail) : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          {r ? zRegionChart({ stat: r.testStat, alpha, tail, df: r.df ?? null }) : <Empty msg="Paste at least 2 values." />}
        </Panel>
        {r && <Panel><Verdict reject={r.reject} pValue={r.pValue} alpha={alpha} /></Panel>}
        {r && <Interpretation text={htInterpretation(r, alpha)} />}
      </div>
      <Panel className="space-y-5">
        {dataset && (
          <div className="flex items-center justify-between gap-3 -mt-2">
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={useWs} onChange={(e) => setUseWs(e.target.checked)} />
              Use workspace
            </label>
          </div>
        )}
        {useWs && dataset ? (
          <ColumnPicker label="Column" value={valueCol} onChange={setValueCol} kind="numeric" />
        ) : (
          <>
            <DataTextArea label="Sample data" value={raw} onChange={setRaw} rows={4} />
            <SampleDataButton onClick={() => setRaw(SAMPLE)} />
          </>
        )}
        <NumberInput label="μ₀" value={mu0} onChange={setMu0} step={0.1} />
        <Select label="α" value={String(alpha)} onChange={(v) => setA(Number(v))} options={ALPHA_OPTS} />
        <Select label="Alternative" value={tail} onChange={(v) => setTail(v as Tail)} options={TAIL_OPTS} />
        {r && (
          <>
            <Stat label="t" value={r.testStat.toFixed(4)} sub={`df = ${r.df}`} />
            <Stat label="p" value={r.pValue.toFixed(4)} />
            <Stat label="Critical |t*|" value={r.critValue.toFixed(4)} />
            <Stat label="Cohen's d" value={(r.effectSize ?? 0).toFixed(4)} />
          </>
        )}
        <Formula text="t = (x̄ − μ₀) / (s / √n)" />
      </Panel>
    </div>
  );
}

function TwoT() {
  const { dataset, categoricalColumns } = useWorkspace();
  const S1 = "5.1, 4.8, 5.3, 4.9, 5.5, 5.0, 4.7, 5.2";
  const S2 = "4.8, 4.5, 5.0, 4.6, 5.1, 4.7, 4.4, 4.9";
  const [r1, setR1] = useState(S1);
  const [r2, setR2] = useState(S2);
  const [alpha, setA] = useState(0.05);
  const [tail, setTail] = useState<Tail>("two");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [groupCol, setGroupCol] = useState<string | null>(null);
  const [useWs, setUseWs] = useState(!!dataset);

  const ws = useMemo(() => {
    if (!dataset || !valueCol || !groupCol) return null;
    const v = dataset.columns.find((c) => c.name === valueCol);
    const g = dataset.columns.find((c) => c.name === groupCol);
    if (!v || !g) return null;
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < dataset.rows.length; i++) {
      const raw = v.values[i];
      const num = typeof raw === "number" ? raw : Number(raw);
      if (raw === null || isNaN(num)) continue;
      const key = String(g.values[i] ?? "—");
      const arr = buckets.get(key) ?? [];
      arr.push(num); buckets.set(key, arr);
    }
    const entries = Array.from(buckets.entries()).filter(([, vs]) => vs.length >= 2);
    if (entries.length < 2) return null;
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return { name1: entries[0][0], d1: entries[0][1], name2: entries[1][0], d2: entries[1][1] };
  }, [dataset, valueCol, groupCol]);

  const d1 = useWs && ws ? ws.d1 : parseNumbers(r1);
  const d2 = useWs && ws ? ws.d2 : parseNumbers(r2);
  const r = d1 && d2 && d1.length >= 2 && d2.length >= 2 ? welchTest(d1, d2, alpha, tail) : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>{r ? zRegionChart({ stat: r.testStat, alpha, tail, df: r.df ?? null }) : <Empty msg="Paste data in both groups." />}</Panel>
        {r && <Panel><Verdict reject={r.reject} pValue={r.pValue} alpha={alpha} /></Panel>}
        {r && <Interpretation text={htInterpretation(r, alpha)} />}
      </div>
      <Panel className="space-y-5">
        {dataset && (
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 -mt-2">
            <input type="checkbox" checked={useWs} onChange={(e) => setUseWs(e.target.checked)} />
            Use workspace
          </label>
        )}
        {useWs && dataset ? (
          <>
            <ColumnPicker label="Value (numeric)" value={valueCol} onChange={setValueCol} kind="numeric" />
            <ColumnPicker label="Group by" value={groupCol} onChange={setGroupCol} kind="categorical"
              autoPick={categoricalColumns.length > 0} />
            {ws && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Comparing <span className="font-mono">{ws.name1}</span> (n={ws.d1.length}) vs{" "}
                <span className="font-mono">{ws.name2}</span> (n={ws.d2.length}).
              </p>
            )}
          </>
        ) : (
          <>
            <DataTextArea label="Sample 1" value={r1} onChange={setR1} rows={3} />
            <DataTextArea label="Sample 2" value={r2} onChange={setR2} rows={3} />
            <SampleDataButton onClick={() => { setR1(S1); setR2(S2); }} />
          </>
        )}
        <Select label="α" value={String(alpha)} onChange={(v) => setA(Number(v))} options={ALPHA_OPTS} />
        <Select label="Alternative" value={tail} onChange={(v) => setTail(v as Tail)} options={TAIL_OPTS} />
        {r && (
          <>
            <Stat label="t (Welch)" value={r.testStat.toFixed(4)} sub={`df = ${(r.df ?? 0).toFixed(2)}`} />
            <Stat label="p"         value={r.pValue.toFixed(4)} />
            <Stat label="Cohen's d" value={(r.effectSize ?? 0).toFixed(4)} />
          </>
        )}
        <Formula text="t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)" />
      </Panel>
    </div>
  );
}

function Paired() {
  const A = "82, 85, 78, 90, 87, 80, 88, 84";
  const B = "85, 88, 82, 92, 89, 84, 90, 86";
  const [r1, setR1] = useState(A);
  const [r2, setR2] = useState(B);
  const [alpha, setA] = useState(0.05);
  const [tail, setTail] = useState<Tail>("two");
  const d1 = useMemo(() => parseNumbers(r1), [r1]);
  const d2 = useMemo(() => parseNumbers(r2), [r2]);
  const aligned = d1 && d2 && d1.length === d2.length && d1.length >= 2;
  const r = aligned ? pairedTTest(d1!, d2!, alpha, tail) : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>{r ? zRegionChart({ stat: r.testStat, alpha, tail, df: r.df ?? null }) : <Empty msg="Two equal-length samples required." />}</Panel>
        {r && <Panel><Verdict reject={r.reject} pValue={r.pValue} alpha={alpha} /></Panel>}
        {r && <Interpretation text={htInterpretation(r, alpha)} />}
      </div>
      <Panel className="space-y-5">
        <DataTextArea label="Before" value={r1} onChange={setR1} rows={3} />
        <DataTextArea label="After"  value={r2} onChange={setR2} rows={3} />
        <SampleDataButton onClick={() => { setR1(A); setR2(B); }} />
        <Select label="α" value={String(alpha)} onChange={(v) => setA(Number(v))} options={ALPHA_OPTS} />
        <Select label="Alternative" value={tail} onChange={(v) => setTail(v as Tail)} options={TAIL_OPTS} />
        {r && (
          <>
            <Stat label="t" value={r.testStat.toFixed(4)} sub={`df = ${r.df}`} />
            <Stat label="p" value={r.pValue.toFixed(4)} />
            <Stat label="Mean diff" value={d1 && d2 ? mean(d1.map((v, i) => v - d2[i])).toFixed(4) : "—"} />
          </>
        )}
        <Formula text="t = d̄ / (s_d / √n)" />
      </Panel>
    </div>
  );
}

function ChiSq() {
  const [obs, setObs] = useState<number[]>([22, 18, 30, 14, 16]);
  const [exp, setExp] = useState<number[]>([20, 20, 20, 20, 20]);
  const [alpha, setA] = useState(0.05);

  const r = obs.length === exp.length && obs.length >= 2 ? chi2GoF(obs, exp, alpha) : null;

  // chi-square curve
  const W = 720, H = 280, PAD = 28;
  if (!r) return <Empty msg="Need at least 2 categories." />;
  const df = r.df!;
  const xMax = Math.max(20, df * 4);
  const xs = Array.from({ length: 240 }, (_, i) => (xMax * i) / 239);
  const pdf = (x: number) => x <= 0 ? 0 : Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - lnGammaShim(df / 2)) / Math.pow(2, df / 2);
  const ys = xs.map(pdf);
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + (x / xMax) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" ");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            <path d={path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
            <line x1={px(r.testStat)} y1={H - PAD} x2={px(r.testStat)} y2={py(pdf(r.testStat))} stroke="#fb923c" strokeWidth={2} />
            <circle cx={px(r.testStat)} cy={py(pdf(r.testStat))} r={5} fill="#fb923c" stroke="#fff" strokeWidth={2} />
            <line x1={px(r.critValue)} y1={PAD} x2={px(r.critValue)} y2={H - PAD} stroke="#dc2626" strokeDasharray="4 4" />
            <text x={px(r.critValue) + 4} y={PAD + 12} fontSize="11" fill="#dc2626">χ²* = {r.critValue.toFixed(2)}</text>
          </svg>
        </Panel>
        <Panel><Verdict reject={r.reject} pValue={r.pValue} alpha={alpha} /></Panel>
        <Interpretation text={(() => {
          const N = obs.reduce((s, v) => s + v, 0);
          const phi = N > 0 ? Math.sqrt(r.testStat / N) : 0;
          const verdict = r.reject ? "Reject H₀" : "Fail to reject H₀";
          const pStr = r.pValue < 1e-4 ? r.pValue.toExponential(2) : r.pValue.toFixed(4);
          return `${verdict} at α=${alpha} — p=${pStr}. χ²=${r.testStat.toFixed(3)} on df=${r.df}. Effect size φ=${phi.toFixed(3)} (${effectSizeLabel(phi)}; thresholds <0.2 / 0.2–0.5 / 0.5–0.8 / >0.8).`;
        })()} />
      </div>
      <Panel className="space-y-5">
        <CategoryEditor label="Observed" values={obs} onChange={setObs} />
        <CategoryEditor label="Expected" values={exp} onChange={setExp} />
        <Btn onClick={() => { const t = obs.reduce((s, v) => s + v, 0); setExp(obs.map(() => t / obs.length)); }}>
          Auto-fill expected (uniform)
        </Btn>
        <Select label="α" value={String(alpha)} onChange={(v) => setA(Number(v))} options={ALPHA_OPTS} />
        <Stat label="χ²" value={r.testStat.toFixed(4)} sub={`df = ${r.df}`} />
        <Stat label="p-value" value={r.pValue.toFixed(4)} />
        <Stat label="χ²* critical" value={r.critValue.toFixed(4)} />
      </Panel>
    </div>
  );
}

function CategoryEditor({ label, values, onChange }: { label: string; values: number[]; onChange: (v: number[]) => void }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{label}</div>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-neutral-400 w-4">{i + 1}</span>
            <input type="number" value={v}
              onChange={(e) => { const nv = [...values]; nv[i] = Number(e.target.value); onChange(nv); }}
              className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm font-mono" />
            <button onClick={() => onChange(values.filter((_, k) => k !== i))} className="text-xs text-neutral-400 hover:text-red-600">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...values, 0])} className="mt-2 text-xs text-orange-600 hover:text-orange-700 underline">
        + Add category
      </button>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-neutral-500 text-center py-12">{msg}</div>;
}

function lnGammaShim(z: number): number {
  // Stirling-ish approximation good enough for chi-square plotting.
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGammaShim(1 - z);
  z -= 1;
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
