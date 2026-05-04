"use client";

import { useMemo, useState } from "react";
import {
  Tabs, Field, Stat, NumberInput, Select, Panel, Btn, Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 36;

function logBeta(x: number, a: number, b: number) {
  if (x <= 0 || x >= 1) return -Infinity;
  return (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x);
}

function curve(a: number, b: number, n = 240) {
  const xs = Array.from({ length: n }, (_, i) => 0.001 + 0.998 * (i / (n - 1)));
  const log = xs.map((x) => logBeta(x, a, b));
  const m = Math.max(...log);
  const ys = log.map((l) => Math.exp(l - m));
  return { xs, ys };
}

// 95% HPD via grid search
function hpd(xs: number[], ys: number[], conf = 0.95) {
  const dx = xs[1] - xs[0];
  const total = ys.reduce((s, v) => s + v * dx, 0);
  const ranks = ys.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  let acc = 0;
  const inside = new Set<number>();
  for (const r of ranks) {
    inside.add(r.i);
    acc += r.v * dx;
    if (acc / total >= conf) break;
  }
  let lo = Infinity, hi = -Infinity;
  inside.forEach((i) => { if (xs[i] < lo) lo = xs[i]; if (xs[i] > hi) hi = xs[i]; });
  return { lo, hi };
}

const PRIOR_PRESETS: { value: string; label: string; a: number; b: number }[] = [
  { value: "uniform", label: "Uniform Beta(1,1)", a: 1, b: 1 },
  { value: "jeffreys", label: "Jeffreys Beta(0.5,0.5)", a: 0.5, b: 0.5 },
  { value: "informative", label: "Informative Beta(10,10)", a: 10, b: 10 },
  { value: "custom", label: "Custom", a: 2, b: 2 },
];

export default function BayesianTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState("Beta-Binomial");
  const [preset, setPreset] = useState("custom");
  const [aPri, setAPri] = useState(2);
  const [bPri, setBPri] = useState(2);
  const [n, setN] = useState(10);
  const [k, setK] = useState(8);
  const [binCol, setBinCol] = useState<string | null>(null);

  const wsCount = useMemo(() => {
    if (!dataset || !binCol) return null;
    const c = dataset.columns.find((c) => c.name === binCol);
    if (!c) return null;
    let total = 0, hits = 0;
    for (const v of c.values) {
      if (v === null || v === "") continue;
      total++;
      const num = typeof v === "number" ? v : Number(v);
      if (!isNaN(num) && num !== 0) hits++;
      else if (typeof v === "string" && /^(true|yes|y|success|t)$/i.test(v.trim())) hits++;
    }
    return total >= 1 ? { total, hits } : null;
  }, [dataset, binCol]);

  const [seqLog, setSeqLog] = useState<string[]>([]);
  const [seqA, setSeqA] = useState(2);
  const [seqB, setSeqB] = useState(2);

  function applyPreset(p: string) {
    setPreset(p);
    const item = PRIOR_PRESETS.find((x) => x.value === p);
    if (item && p !== "custom") { setAPri(item.a); setBPri(item.b); }
  }

  // Direct mode
  const aPost = aPri + k;
  const bPost = bPri + (n - k);
  const prior = useMemo(() => curve(aPri, bPri), [aPri, bPri]);
  const post = useMemo(() => curve(aPost, bPost), [aPost, bPost]);
  const yMax = Math.max(0.001, ...prior.ys, ...post.ys);
  const sx = (x: number) => PAD + x * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y / yMax) * (H - 2 * PAD);
  const path = (xs: number[], ys: number[]) =>
    xs.map((x, i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(2)},${sy(ys[i]).toFixed(2)}`).join(" ");

  const postMean = aPost / (aPost + bPost);
  const postMode = aPost > 1 && bPost > 1 ? (aPost - 1) / (aPost + bPost - 2) : NaN;
  const postVar = (aPost * bPost) / (((aPost + bPost) ** 2) * (aPost + bPost + 1));
  const ci = hpd(post.xs, post.ys, 0.95);

  // Sequential
  const seqPost = useMemo(() => curve(seqA, seqB), [seqA, seqB]);
  const seqYMax = Math.max(...seqPost.ys);
  const seqPath = seqPost.xs.map((x, i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(2)},${(H - PAD - (seqPost.ys[i] / seqYMax) * (H - 2 * PAD)).toFixed(2)}`).join(" ");

  const priorWeight = aPri + bPri;
  const dataWeight = n;
  const dominator = priorWeight > dataWeight ? "prior" : dataWeight > priorWeight ? "data" : "balanced";
  const bbInterpretation = `Posterior mean = ${postMean.toFixed(4)}. 95% HPD = [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]. Prior weight equivalent to ${priorWeight.toFixed(1)} pseudo-trials; data weight = ${dataWeight} (${dominator === "balanced" ? "evenly balanced" : dominator + " dominates"}).`;

  const seqMean = seqA / (seqA + seqB);
  const seqHPD = useMemo(() => hpd(seqPost.xs, seqPost.ys, 0.95), [seqPost]);
  const seqInterpretation = `Posterior mean = ${seqMean.toFixed(4)}. 95% HPD = [${seqHPD.lo.toFixed(3)}, ${seqHPD.hi.toFixed(3)}]. Current Beta(${seqA.toFixed(1)}, ${seqB.toFixed(1)}) reflects ${seqLog.length} observation${seqLog.length === 1 ? "" : "s"} updated onto the initial prior.`;

  function addObs(success: boolean) {
    const newA = seqA + (success ? 1 : 0);
    const newB = seqB + (success ? 0 : 1);
    setSeqA(newA); setSeqB(newB);
    setSeqLog([...seqLog, `Obs ${seqLog.length + 1}: ${success ? "success" : "failure"} → Beta(${newA.toFixed(0)}, ${newB.toFixed(0)})`]);
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={["Beta-Binomial", "Sequential"]} active={tab} onChange={setTab} />

      {tab === "Beta-Binomial" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Panel>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <text key={t} x={sx(t)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{t}</text>
                ))}
                {/* HPD shading */}
                <rect x={sx(ci.lo)} y={PAD} width={sx(ci.hi) - sx(ci.lo)} height={H - 2 * PAD}
                      fill="#fb923c" fillOpacity={0.08} />
                <path d={path(prior.xs, prior.ys)} fill="none" stroke="var(--chart-muted)" strokeWidth={2} strokeDasharray="5 5" />
                <path d={path(post.xs, post.ys)}   fill="none" stroke="#fb923c" strokeWidth={2.5} />
                <line x1={sx(postMean)} y1={PAD} x2={sx(postMean)} y2={H - PAD} stroke="#fb923c" strokeWidth={1.5} />
                <g transform={`translate(${PAD + 10}, ${PAD + 8})`}>
                  <rect width={210} height={64} fill="var(--chart-bg)" stroke="var(--chart-axis)" rx={6} />
                  <text x={10} y={20} fontSize="11" fill="var(--chart-ink)">Prior Beta({aPri.toFixed(1)}, {bPri.toFixed(1)})</text>
                  <line x1={156} y1={16} x2={186} y2={16} stroke="var(--chart-muted)" strokeWidth={2} strokeDasharray="5 5" />
                  <text x={10} y={42} fontSize="11" fill="var(--chart-ink)">Posterior Beta({aPost.toFixed(1)}, {bPost.toFixed(1)})</text>
                  <line x1={156} y1={38} x2={186} y2={38} stroke="#fb923c" strokeWidth={2.5} />
                  <text x={10} y={58} fontSize="10" fill="var(--chart-muted)">95% HPD ≈ [{ci.lo.toFixed(3)}, {ci.hi.toFixed(3)}]</text>
                </g>
              </svg>
            </Panel>
            <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {bbInterpretation}
              </p>
            </div>
          </div>

          <Panel className="space-y-5">
            {dataset && (
              <>
                <ColumnPicker label="Workspace binary column (optional)"
                  value={binCol} onChange={setBinCol} kind="any" autoPick={false} />
                {wsCount && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setN(wsCount.total); setK(wsCount.hits); }}
                      className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      Apply: k = {wsCount.hits}, n = {wsCount.total}
                    </button>
                  </div>
                )}
              </>
            )}
            <Select label="Prior preset" value={preset} onChange={applyPreset}
              options={PRIOR_PRESETS.map(({ value, label }) => ({ value, label }))} />
            <Field label="Prior α" value={aPri.toFixed(1)}>
              <input type="range" min={0.5} max={20} step={0.5} value={aPri} onChange={(e) => { setPreset("custom"); setAPri(Number(e.target.value)); }} className="w-full" />
            </Field>
            <NumberInput label="α exact" value={aPri} onChange={(v) => { setPreset("custom"); setAPri(v); }} step={0.5} min={0.1} />
            <Field label="Prior β" value={bPri.toFixed(1)}>
              <input type="range" min={0.5} max={20} step={0.5} value={bPri} onChange={(e) => { setPreset("custom"); setBPri(Number(e.target.value)); }} className="w-full" />
            </Field>
            <NumberInput label="β exact" value={bPri} onChange={(v) => { setPreset("custom"); setBPri(v); }} step={0.5} min={0.1} />
            <NumberInput label="Trials n" value={n} onChange={(v) => setN(Math.max(k, Math.round(v)))} min={1} />
            <NumberInput label="Successes k" value={k} onChange={(v) => setK(Math.max(0, Math.min(n, Math.round(v))))} min={0} max={n} />
            <Stat label="Posterior mean"     value={postMean.toFixed(4)} />
            <Stat label="Posterior mode"     value={Number.isFinite(postMode) ? postMode.toFixed(4) : "—"} />
            <Stat label="Posterior variance" value={postVar.toFixed(5)} />
            <Stat label="95% HPD"            value={`[${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}]`} />
            <Formula text="Posterior = Beta(α + k, β + n − k)" />
          </Panel>
        </div>
      )}

      {tab === "Sequential" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Panel>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
                <path d={seqPath} fill="none" stroke="#fb923c" strokeWidth={2.5} />
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <text key={t} x={sx(t)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{t}</text>
                ))}
                <text x={PAD} y={20} fontSize="11" fill="var(--chart-muted)">Beta({seqA.toFixed(0)}, {seqB.toFixed(0)})</text>
              </svg>
            </Panel>
            <Panel>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Update log</div>
              <div className="font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
                {seqLog.length === 0 && <div className="text-neutral-400">No observations yet.</div>}
                {seqLog.map((l, i) => <div key={i} className="text-neutral-700">{l}</div>)}
              </div>
            </Panel>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {seqInterpretation}
              </p>
            </div>
          </div>
          <Panel className="space-y-5">
            <NumberInput label="Initial α" value={seqA} onChange={setSeqA} step={0.5} min={0.1} />
            <NumberInput label="Initial β" value={seqB} onChange={setSeqB} step={0.5} min={0.1} />
            <div className="grid grid-cols-2 gap-2">
              <Btn primary onClick={() => addObs(true)}>+ Success</Btn>
              <Btn onClick={() => addObs(false)}>+ Failure</Btn>
            </div>
            <Btn onClick={() => { setSeqA(2); setSeqB(2); setSeqLog([]); }}>Reset</Btn>
            <Stat label="Posterior mean" value={(seqA / (seqA + seqB)).toFixed(4)} />
            <Stat label="Total observations" value={String(seqLog.length)} />
          </Panel>
        </div>
      )}
    </div>
  );
}
