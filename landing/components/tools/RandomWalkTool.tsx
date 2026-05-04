"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Stat, Select, NumberInput, Panel, Btn } from "./shared/ui";

const W = 720, H = 320, PAD = 16;
const MAX = 600;

export default function RandomWalkTool() {
  const [drift, setDrift] = useState(0);
  const [rev, setRev] = useState(0.99);
  const [stepDist, setStepDist] = useState<"normal" | "uniform">("normal");
  const [pathCount, setPathCount] = useState(5);
  const [twoD, setTwoD] = useState(false);
  const [running, setRunning] = useState(true);
  const refs = useRef<{ x: number; y: number; xs: number[]; ys: number[] }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    refs.current = Array.from({ length: pathCount }, () => ({ x: 0, y: 0, xs: [0], ys: [0] }));
    setTick(0);
  }, [pathCount]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const sample = () => stepDist === "normal"
        ? (Math.random() + Math.random() + Math.random() - 1.5) * 1.4
        : (Math.random() - 0.5) * 2;
      for (const p of refs.current) {
        p.x += sample() + drift;
        p.x *= rev;
        p.y += sample() + (twoD ? drift : 0);
        p.y *= rev;
        p.xs.push(p.x); p.ys.push(p.y);
        if (p.xs.length > MAX) { p.xs.shift(); p.ys.shift(); }
      }
      setTick((t) => t + 1);
    }, 40);
    return () => clearInterval(id);
  }, [running, drift, rev, stepDist, twoD]);

  // 1D rendering
  const yMin = -10, yMax = 10;
  const sx = (i: number) => PAD + (i / (MAX - 1)) * (W - 2 * PAD);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  // 2D rendering
  const all = refs.current.flatMap((p) => p.xs.flatMap((x, i) => [x, p.ys[i]]));
  const range = Math.max(8, ...all.map(Math.abs));
  const sx2 = (v: number) => W / 2 + (v / range) * (W / 2 - PAD);
  const sy2 = (v: number) => H / 2 - (v / range) * (H / 2 - PAD);

  const COLORS = ["#171717", "#fb923c", "#0ea5e9", "#16a34a", "#a855f7", "#dc2626", "#737373", "#0f766e", "#9d174d", "#475569"];

  // stats
  const last = refs.current.map((p) => p.x);
  const maxV = Math.max(0, ...refs.current.map((p) => Math.max(...p.xs)));
  const minV = Math.min(0, ...refs.current.map((p) => Math.min(...p.xs)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Panel>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" key={`${pathCount}-${twoD}-${tick}`}>
            {!twoD ? (
              <>
                <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                {refs.current.map((p, i) => (
                  <path key={i} d={p.xs.map((v, k) => `${k === 0 ? "M" : "L"}${sx(k).toFixed(2)},${sy(v).toFixed(2)}`).join(" ")}
                        fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={pathCount === 1 ? 1.6 : 1.1}
                        strokeOpacity={pathCount === 1 ? 1 : 0.7} />
                ))}
              </>
            ) : (
              <>
                <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="var(--chart-grid)" />
                <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="var(--chart-grid)" />
                {refs.current.map((p, i) => (
                  <path key={i} d={p.xs.map((v, k) => `${k === 0 ? "M" : "L"}${sx2(v).toFixed(2)},${sy2(p.ys[k]).toFixed(2)}`).join(" ")}
                        fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={1.2} strokeOpacity={0.8} />
                ))}
                {refs.current.map((p, i) => (
                  <circle key={`c${i}`} cx={sx2(p.x)} cy={sy2(p.y)} r={3.5} fill={COLORS[i % COLORS.length]} />
                ))}
              </>
            )}
          </svg>
        </Panel>
      </div>
      <Panel className="space-y-5">
        <Field label="Drift μ" value={drift.toFixed(2)}>
          <input type="range" min={-0.5} max={0.5} step={0.01} value={drift}
                 onChange={(e) => setDrift(Number(e.target.value))} className="w-full" />
        </Field>
        <NumberInput label="Drift exact" value={drift} onChange={setDrift} step={0.01} />
        <Field label="Reversion ×" value={rev.toFixed(3)}>
          <input type="range" min={0.9} max={1} step={0.001} value={rev}
                 onChange={(e) => setRev(Number(e.target.value))} className="w-full" />
        </Field>
        <Select label="Step distribution" value={stepDist} onChange={(v) => setStepDist(v as "normal" | "uniform")}
          options={[{ value: "normal", label: "Normal-ish" }, { value: "uniform", label: "Uniform" }]} />
        <Select label="# paths" value={String(pathCount)} onChange={(v) => setPathCount(Number(v))}
          options={[{ value: "1", label: "1" }, { value: "5", label: "5" }, { value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }]} />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={twoD} onChange={(e) => setTwoD(e.target.checked)} />
          2D mode
        </label>
        <Stat label="Mean x" value={(last.reduce((s, v) => s + v, 0) / last.length).toFixed(3)} />
        <Stat label="Max reached" value={maxV.toFixed(3)} />
        <Stat label="Min reached" value={minV.toFixed(3)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
          <Btn onClick={() => { refs.current.forEach((p) => { p.x = 0; p.y = 0; p.xs = [0]; p.ys = [0]; }); setTick((t) => t + 1); }}>Reset</Btn>
        </div>
      </Panel>
    </div>
  );
}
