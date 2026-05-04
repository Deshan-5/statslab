"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, Stat, Select, Panel, Btn, NumberInput } from "./shared/ui";

const W = 480, H = 380;

function defaultMatrix(k: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row = Array(k).fill(0).map(() => Math.random());
    const sum = row.reduce((a, b) => a + b, 0);
    m.push(row.map((v) => v / sum));
  }
  return m;
}

function nodePos(k: number, i: number) {
  if (k === 2) return [{ x: 130, y: 190 }, { x: 350, y: 190 }][i];
  if (k === 3) return [{ x: 240, y: 70 }, { x: 100, y: 280 }, { x: 380, y: 280 }][i];
  return [
    { x: 110, y: 100 }, { x: 370, y: 100 },
    { x: 110, y: 280 }, { x: 370, y: 280 },
  ][i];
}

function stationary(P: number[][]): number[] {
  // power iteration
  const k = P.length;
  let v = Array(k).fill(1 / k);
  for (let it = 0; it < 200; it++) {
    const nx = Array(k).fill(0);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) nx[j] += v[i] * P[i][j];
    const s = nx.reduce((a, b) => a + b, 0) || 1;
    v = nx.map((x) => x / s);
  }
  return v;
}

export default function MarkovChainTool() {
  const [k, setK] = useState(3);
  const [P, setP] = useState<number[][]>(() => defaultMatrix(3));
  const [state, setState] = useState(0);
  const [history, setHistory] = useState<number[]>([0]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("medium");

  const stat = useMemo(() => stationary(P), [P]);
  const empirical = useMemo(() => {
    const c = Array(k).fill(0);
    for (const s of history) c[s] += 1;
    return c.map((x) => x / Math.max(1, history.length));
  }, [history, k]);

  useEffect(() => {
    if (!running) return;
    const interval = speed === "slow" ? 800 : speed === "medium" ? 350 : 120;
    const id = setInterval(() => step(), interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, speed, state, P]);

  function step() {
    const r = Math.random();
    let acc = 0;
    for (let j = 0; j < k; j++) {
      acc += P[state][j];
      if (r < acc) {
        setState(j);
        setHistory((h) => [...h, j].slice(-300));
        return;
      }
    }
  }

  function changeSize(newK: number) {
    setK(newK);
    setP(defaultMatrix(newK));
    setState(0);
    setHistory([0]);
  }

  function setCell(i: number, j: number, v: number) {
    const np = P.map((r) => [...r]);
    np[i][j] = v;
    setP(np);
  }

  function normalize() {
    const np = P.map((r) => {
      const s = r.reduce((a, b) => a + b, 0);
      return s > 0 ? r.map((v) => v / s) : r.map(() => 1 / r.length);
    });
    setP(np);
  }

  // ── render
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {/* edges */}
            {Array.from({ length: k }).map((_, i) =>
              Array.from({ length: k }).map((__, j) => {
                if (i === j) return null;
                const a = nodePos(k, i)!, b = nodePos(k, j)!;
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const ox = -dy / len, oy = dx / len;
                const cx = (a.x + b.x) / 2 + ox * 18;
                const cy = (a.y + b.y) / 2 + oy * 18;
                const active = i === state;
                const w = 0.5 + 3 * P[i][j];
                return (
                  <g key={`${i}-${j}`}>
                    <path d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`}
                      stroke={active ? "#fb923c" : "#d4d4d4"} strokeWidth={active ? w + 0.5 : w}
                      fill="none" opacity={active ? 1 : 0.45} />
                    <text x={cx} y={cy} textAnchor="middle" fontSize="10" fill={active ? "#fb923c" : "#737373"}>
                      {P[i][j].toFixed(2)}
                    </text>
                  </g>
                );
              }),
            )}
            {/* nodes */}
            {Array.from({ length: k }).map((_, i) => {
              const p = nodePos(k, i)!;
              const active = state === i;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={26}
                          fill={active ? "#171717" : "#fff"}
                          stroke={active ? "#171717" : "#d4d4d4"} strokeWidth={1.5} />
                  <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="14" fontWeight={600}
                        fill={active ? "#fff" : "#171717"}>
                    {String.fromCharCode(65 + i)}
                  </text>
                </g>
              );
            })}
          </svg>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Visit frequency vs. stationary</div>
          <svg viewBox={`0 0 ${W} 100`} className="w-full h-auto">
            {Array.from({ length: k }).map((_, i) => {
              const x = 30 + i * ((W - 60) / k) + ((W - 60) / k) * 0.15;
              const w = ((W - 60) / k) * 0.3;
              return (
                <g key={i}>
                  <rect x={x} y={80 - empirical[i] * 70} width={w} height={empirical[i] * 70} fill="var(--chart-ink)" />
                  <rect x={x + w + 4} y={80 - stat[i] * 70} width={w} height={stat[i] * 70} fill="#fb923c" />
                  <text x={x + w + 2} y={94} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{String.fromCharCode(65 + i)}</text>
                </g>
              );
            })}
            <g transform="translate(10, 12)">
              <rect width={10} height={10} fill="var(--chart-ink)" /><text x={14} y={9} fontSize="10" fill="var(--chart-muted)">Empirical</text>
              <rect width={10} height={10} fill="#fb923c" y={14} /><text x={14} y={23} fontSize="10" fill="var(--chart-muted)">Stationary</text>
            </g>
          </svg>
        </Panel>
      </div>

      <Panel className="space-y-5">
        <Select label="States" value={String(k)} onChange={(v) => changeSize(Number(v))}
          options={[{ value: "2", label: "2×2" }, { value: "3", label: "3×3" }, { value: "4", label: "4×4" }]} />
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Transition matrix P</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${k}, minmax(0, 1fr))` }}>
            <span />
            {Array.from({ length: k }).map((_, j) => (
              <span key={`h${j}`} className="text-[10px] text-neutral-400 text-center">→{String.fromCharCode(65 + j)}</span>
            ))}
            {P.map((row, i) => (
              <Row key={i} label={String.fromCharCode(65 + i)}
                values={row}
                onChange={(j, v) => setCell(i, j, v)}
                rowSum={row.reduce((s, v) => s + v, 0)} />
            ))}
          </div>
          <Btn onClick={normalize}>Normalize rows</Btn>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={step}>Step</Btn>
          <Btn primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Auto-run"}</Btn>
        </div>
        <Select label="Speed" value={speed} onChange={(v) => setSpeed(v as typeof speed)}
          options={[{ value: "slow", label: "Slow" }, { value: "medium", label: "Medium" }, { value: "fast", label: "Fast" }]} />
        <Stat label="Current state" value={String.fromCharCode(65 + state)} />
        <Stat label="Steps taken"   value={String(history.length - 1)} />
        <Btn onClick={() => { setHistory([0]); setState(0); }}>Reset</Btn>
      </Panel>
    </div>
  );
}

function Row({ label, values, onChange, rowSum }: { label: string; values: number[]; onChange: (j: number, v: number) => void; rowSum: number }) {
  const ok = Math.abs(rowSum - 1) < 0.01;
  return (
    <>
      <span className="text-xs text-neutral-500 self-center">{label}</span>
      {values.map((v, j) => (
        <input key={j} type="number" step={0.01} value={v.toFixed(2)}
               onChange={(e) => onChange(j, Number(e.target.value))}
               className={`w-full rounded border px-1.5 py-1 text-xs font-mono ${ok ? "border-neutral-200" : "border-red-300 bg-red-50"}`} />
      ))}
    </>
  );
}
