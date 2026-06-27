"use client";

import { useMemo, useState } from "react";
import { normalCDF, normalInv, mean as meanFn, sd as sdFn } from "./shared/stats";
import {
  Tabs, Stat, Panel, Select, Field, Formula, Interpretation,
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 40;

type TestKind = "one-sample" | "two-sample";
type Tail = "two" | "right" | "left";

/** Power for a one-sample z/t test (large-n normal approximation). */
function powerOneSample(n: number, d: number, alpha: number, tail: Tail) {
  const ncp = d * Math.sqrt(n);
  if (tail === "two") {
    const z = normalInv(1 - alpha / 2);
    return 1 - normalCDF(z - ncp) + normalCDF(-z - ncp);
  }
  const z = normalInv(1 - alpha);
  return tail === "right" ? 1 - normalCDF(z - ncp) : normalCDF(-z + ncp);
}

/** Power for an equal-allocation two-sample test. n is per group. */
function powerTwoSample(n: number, d: number, alpha: number, tail: Tail) {
  const ncp = d * Math.sqrt(n / 2);
  if (tail === "two") {
    const z = normalInv(1 - alpha / 2);
    return 1 - normalCDF(z - ncp) + normalCDF(-z - ncp);
  }
  const z = normalInv(1 - alpha);
  return tail === "right" ? 1 - normalCDF(z - ncp) : normalCDF(-z + ncp);
}

function powerFn(kind: TestKind, n: number, d: number, alpha: number, tail: Tail) {
  return kind === "one-sample"
    ? powerOneSample(n, d, alpha, tail)
    : powerTwoSample(n, d, alpha, tail);
}

/** Bisection: solve power(n, d, alpha) = target for n. */
function solveN(kind: TestKind, d: number, alpha: number, power: number, tail: Tail) {
  if (Math.abs(d) < 1e-6) return Infinity;
  let lo = 2, hi = 4;
  for (let i = 0; i < 40; i++) {
    if (powerFn(kind, hi, Math.abs(d), alpha, tail) >= power) break;
    hi *= 2;
    if (hi > 1e7) return Infinity;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (powerFn(kind, mid, Math.abs(d), alpha, tail) >= power) hi = mid;
    else lo = mid;
  }
  return Math.ceil((lo + hi) / 2);
}

const TEST_KINDS: { value: TestKind; label: string }[] = [
  { value: "one-sample", label: "One-sample" },
  { value: "two-sample", label: "Two-sample (equal n)" },
];
const TAILS: { value: Tail; label: string }[] = [
  { value: "two", label: "Two-tailed" },
  { value: "right", label: "Right-tailed" },
  { value: "left", label: "Left-tailed" },
];

type Solve = "power" | "n" | "effect";

export default function PowerCalculatorTool() {
  const { dataset } = useWorkspace();
  const [kind, setKind] = useState<TestKind>("two-sample");
  const [tail, setTail] = useState<Tail>("two");
  const [solve, setSolve] = useState<Solve>("power");
  const [d, setD] = useState(0.5);
  const [n, setN] = useState(64);
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [tab, setTab] = useState("Solver");
  const [colA, setColA] = useState<string | null>(null);
  const [colB, setColB] = useState<string | null>(null);

  const prefill = () => {
    if (!dataset) return;
    const a = colA ? dataset.columns.find((c) => c.name === colA)?.numeric : null;
    const b = colB ? dataset.columns.find((c) => c.name === colB)?.numeric : null;
    if (a && a.length >= 2 && b && b.length >= 2) {
      const sP = Math.sqrt(((a.length - 1) * sdFn(a) ** 2 + (b.length - 1) * sdFn(b) ** 2) / (a.length + b.length - 2));
      if (sP > 0) setD(Number((Math.abs(meanFn(a) - meanFn(b)) / sP).toFixed(3)));
      setN(Math.min(a.length, b.length));
      setKind("two-sample");
    } else if (a && a.length >= 2) {
      const s = sdFn(a);
      if (s > 0) setD(Number((Math.abs(meanFn(a)) / s).toFixed(3)));
      setN(a.length);
      setKind("one-sample");
    }
  };

  // Derived value depending on what we're solving for.
  useRegisterToolState("power-calculator", { kind, tail, solve, d, n, alpha, power, tab }, { kind: setKind, tail: setTail, solve: setSolve, d: setD, n: setN, alpha: setAlpha, power: setPower, tab: setTab });
  const computed = useMemo(() => {
    if (solve === "power") return powerFn(kind, n, d, alpha, tail);
    if (solve === "n")     return solveN(kind, d, alpha, power, tail);
    // effect size given n, alpha, target power: bisection
    let lo = 0.001, hi = 5;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (powerFn(kind, n, mid, alpha, tail) >= power) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }, [solve, kind, n, d, alpha, power, tail]);

  // Power curve as a function of n at the current effect size.
  const curve = useMemo(() => {
    const target = solve === "n" ? computed : n;
    const targetN = Number.isFinite(target) ? target : n;
    const maxN = Math.max(20, Math.ceil(targetN * 2.5));
    const xs: number[] = [];
    for (let v = 2; v <= maxN; v += Math.max(1, Math.round(maxN / 80))) xs.push(v);
    return xs.map((nn) => ({ n: nn, p: powerFn(kind, nn, Math.abs(d), alpha, tail) }));
  }, [kind, d, alpha, tail, solve, n, computed]);

  const px = (v: number) => {
    const xMax = curve[curve.length - 1]?.n ?? 100;
    return PAD + ((v - 2) / (xMax - 2 || 1)) * (W - 2 * PAD);
  };
  const py = (v: number) => H - PAD - v * (H - 2 * PAD);

  const path = curve
    .map((c, i) => `${i === 0 ? "M" : "L"}${px(c.n).toFixed(2)},${py(c.p).toFixed(2)}`)
    .join(" ");

  const targetN = solve === "n" ? computed : n;

  const interpretation = useMemo(() => {
    const nLbl = kind === "two-sample" ? "per group" : "";
    if (solve === "power") {
      const p = computed as number;
      if (!Number.isFinite(p)) return null;
      const pct = (p * 100).toFixed(1);
      const verdict = p >= 0.8
        ? "well-powered (≥80% is the conventional threshold)"
        : p >= 0.5
          ? "underpowered — likely to miss true effects"
          : "severely underpowered — would rarely detect this effect";
      return `With n=${n} ${nLbl}, d=${d.toFixed(2)}, and α=${alpha}, you have ${pct}% power to detect this effect (${verdict}).`;
    }
    if (solve === "n") {
      const v = computed as number;
      if (!Number.isFinite(v)) return `Effect size d=${d.toFixed(2)} is too small to reach ${(power * 100).toFixed(0)}% power within reasonable n.`;
      const total = kind === "two-sample" ? Math.ceil(v) * 2 : Math.ceil(v);
      return `You need n=${Math.ceil(v)} ${nLbl} (total ${total}) to detect d=${d.toFixed(2)} at α=${alpha} with ${(power * 100).toFixed(0)}% power.`;
    }
    const dStar = computed as number;
    const tag = dStar < 0.2 ? "very small" : dStar < 0.5 ? "small" : dStar < 0.8 ? "medium" : "large";
    return `With n=${n} ${nLbl} at α=${alpha} and ${(power * 100).toFixed(0)}% target power, the smallest detectable effect is d≈${dStar.toFixed(3)} (${tag} by Cohen).`;
  }, [solve, computed, kind, n, d, alpha, power]);

  return (
    <div className="space-y-6">
      <Tabs tabs={["Solver"]} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
              Power vs sample size · Cohen&apos;s d = {d.toFixed(2)}, α = {alpha}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {[0.2, 0.5, 0.8, 1].map((p) => (
                <g key={p}>
                  <line x1={PAD} y1={py(p)} x2={W - PAD} y2={py(p)} stroke="var(--chart-grid)" strokeDasharray="3 4" />
                  <text x={PAD - 6} y={py(p) + 3} textAnchor="end" fontSize="10" fill="var(--chart-muted)">{p}</text>
                </g>
              ))}
              {/* 80% reference */}
              <line x1={PAD} y1={py(0.8)} x2={W - PAD} y2={py(0.8)} stroke="#fb923c" strokeDasharray="4 4" opacity={0.55} />
              <path d={path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
              {/* current operating point */}
              {Number.isFinite(targetN) && (
                <circle cx={px(targetN as number)} cy={py(powerFn(kind, targetN as number, d, alpha, tail))}
                  r={6} fill="#fb923c" stroke="#fff" strokeWidth={2} />
              )}
              <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">
                {kind === "two-sample" ? "n per group" : "n"}
              </text>
            </svg>
          </Panel>
          <Interpretation text={interpretation} />
        </div>

        <Panel className="space-y-5">
          {dataset && (
            <div className="space-y-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">Pre-fill from workspace</div>
              <ColumnPicker label="Column A" value={colA} onChange={setColA} kind="numeric" autoPick={false} />
              <ColumnPicker label="Column B (optional)" value={colB} onChange={setColB} kind="numeric" autoPick={false} />
              <button onClick={prefill}
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                Pre-fill effect & n
              </button>
            </div>
          )}
          <Select label="Test" value={kind} onChange={(v) => setKind(v as TestKind)} options={TEST_KINDS} />
          <Select label="Tail" value={tail} onChange={(v) => setTail(v as Tail)} options={TAILS} />
          <Select label="Solve for" value={solve}
            onChange={(v) => setSolve(v as Solve)}
            options={[
              { value: "power", label: "Power (given n, d, α)" },
              { value: "n", label: "Sample size (given d, α, power)" },
              { value: "effect", label: "Effect size (given n, α, power)" },
            ]} />

          {solve !== "effect" && (
            <Field label="Cohen's d" value={d.toFixed(2)}>
              <input type="range" min={0.05} max={2} step={0.05} value={d}
                onChange={(e) => setD(Number(e.target.value))} className="w-full" />
            </Field>
          )}
          {solve !== "n" && (
            <Field label={kind === "two-sample" ? "n per group" : "n"} value={String(n)}>
              <input type="range" min={2} max={500} step={1} value={n}
                onChange={(e) => setN(Number(e.target.value))} className="w-full" />
            </Field>
          )}
          <Field label="α" value={alpha.toFixed(3)}>
            <input type="range" min={0.001} max={0.1} step={0.001} value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))} className="w-full" />
          </Field>
          {solve !== "power" && (
            <Field label="Target power" value={power.toFixed(2)}>
              <input type="range" min={0.5} max={0.99} step={0.01} value={power}
                onChange={(e) => setPower(Number(e.target.value))} className="w-full" />
            </Field>
          )}

          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4 space-y-3">
            {solve === "power" && (
              <Stat label="Power (1−β)" value={Number.isFinite(computed) ? (computed as number).toFixed(4) : "—"}
                sub={`${((computed as number) * 100).toFixed(1)}%`} />
            )}
            {solve === "n" && (
              <Stat label={kind === "two-sample" ? "n per group" : "n"}
                value={Number.isFinite(computed) ? Math.ceil(computed as number).toString() : "∞"} />
            )}
            {solve === "effect" && (
              <Stat label="Detectable effect (d)" value={(computed as number).toFixed(4)} />
            )}
          </div>

          <Formula text={
            kind === "two-sample"
              ? "ncp = d · √(n/2)"
              : "ncp = d · √n"
          } />

          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Conventional effect sizes: <span className="font-mono">d = 0.2</span> small,
            <span className="font-mono"> 0.5</span> medium, <span className="font-mono">0.8</span> large (Cohen 1988).
          </p>
        </Panel>
      </div>
    </div>
  );
}
