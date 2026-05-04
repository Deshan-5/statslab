"use client";

import { useEffect, useRef, useState } from "react";
import { Stat, Panel, Btn, Select, NumberInput } from "./shared/ui";

const W = 360, H = 360, PAD = 20;
const SIZE = W - 2 * PAD;

type Pt = { x: number; y: number; inside: boolean };

export default function MonteCarloPiTool() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("fast");
  const insideRef = useRef(0);
  const totalRef = useRef(0);
  const [trace, setTrace] = useState<number[]>([]);

  useEffect(() => {
    if (!running) return;
    const interval = speed === "slow" ? 50 : speed === "medium" ? 20 : 8;
    const id = setInterval(() => {
      const x = Math.random();
      const y = Math.random();
      const inside = x * x + y * y <= 1;
      insideRef.current += inside ? 1 : 0;
      totalRef.current += 1;
      setPts((p) => {
        const n = [...p, { x, y, inside }];
        if (n.length > 1500) n.splice(0, n.length - 1500);
        return n;
      });
      if (totalRef.current % 25 === 0) {
        setTrace((t) => {
          const n = [...t, (4 * insideRef.current) / totalRef.current];
          if (n.length > 240) n.shift();
          return n;
        });
      }
    }, interval);
    return () => clearInterval(id);
  }, [running, speed]);

  const pi = totalRef.current === 0 ? 0 : (4 * insideRef.current) / totalRef.current;
  const sx = (v: number) => PAD + v * SIZE;
  const sy = (v: number) => PAD + (1 - v) * SIZE;

  // convergence trace
  const tW = 360, tH = 120;
  const tMin = trace.length ? Math.min(...trace) : Math.PI - 0.5;
  const tMax = trace.length ? Math.max(...trace) : Math.PI + 0.5;
  const tx = (i: number) => 8 + (i / Math.max(1, trace.length - 1)) * (tW - 16);
  const ty = (v: number) => tH - 8 - ((v - tMin) / (tMax - tMin || 1)) * (tH - 16);
  const tracePath = trace.map((v, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(2)},${ty(v).toFixed(2)}`).join(" ");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            <rect x={PAD} y={PAD} width={SIZE} height={SIZE} fill="none" stroke="var(--chart-axis)" />
            <path d={`M${PAD},${PAD + SIZE} A${SIZE},${SIZE} 0 0 1 ${PAD + SIZE},${PAD}`}
                  fill="#fbbf24" fillOpacity={0.12} stroke="#fbbf24" strokeWidth={1.2} />
            {pts.map((p, i) => (
              <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={1.4}
                      fill={p.inside ? "#16a34a" : "#dc2626"} fillOpacity={0.85} />
            ))}
          </svg>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Convergence</div>
          <svg viewBox={`0 0 ${tW} ${tH}`} className="w-full h-auto">
            <line x1={8} y1={ty(Math.PI)} x2={tW - 8} y2={ty(Math.PI)} stroke="#fb923c" strokeDasharray="4 4" />
            <text x={tW - 8} y={ty(Math.PI) - 4} fontSize="10" fill="#fb923c" textAnchor="end">π = 3.1416</text>
            <path d={tracePath} fill="none" stroke="var(--chart-ink)" strokeWidth={1.6} />
          </svg>
        </Panel>
      </div>
      <Panel className="space-y-5">
        <Stat label="π estimate" value={pi.toFixed(5)} />
        <Stat label="Samples" value={totalRef.current.toLocaleString()} />
        <Stat label="Inside" value={insideRef.current.toLocaleString()} />
        <Stat label="Error" value={(Math.abs(pi - Math.PI) || 0).toFixed(5)} />
        <Select label="Speed" value={speed} onChange={(v) => setSpeed(v as typeof speed)}
          options={[{ value: "slow", label: "Slow" }, { value: "medium", label: "Medium" }, { value: "fast", label: "Fast" }]} />
        <NumberInput label="Step samples"  value={1} onChange={(v) => {
          for (let i = 0; i < Math.max(1, Math.round(v)); i++) {
            const x = Math.random(), y = Math.random();
            const inside = x * x + y * y <= 1;
            insideRef.current += inside ? 1 : 0;
            totalRef.current += 1;
          }
          setPts((p) => [...p]);
        }} step={100} min={1} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
          <Btn onClick={() => { insideRef.current = 0; totalRef.current = 0; setPts([]); setTrace([]); }}>Reset</Btn>
        </div>
      </Panel>
    </div>
  );
}
