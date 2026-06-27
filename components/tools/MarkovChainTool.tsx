"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Field, Stat, Select, Panel, Btn, NumberInput, useRegisterToolState } from "./shared/ui";

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

function nodePos3D(k: number, i: number) {
  if (k === 2) {
    return [
      { x: -0.6, y: 0, z: 0 },
      { x: 0.6, y: 0, z: 0 }
    ][i];
  }
  if (k === 3) {
    return [
      { x: 0, y: 0.6, z: 0 },
      { x: -0.6, y: -0.4, z: -0.4 },
      { x: 0.6, y: -0.4, z: 0.4 }
    ][i];
  }
  return [
    { x: 0, y: 0.7, z: 0 },
    { x: -0.6, y: -0.3, z: -0.5 },
    { x: 0.6, y: -0.3, z: -0.5 },
    { x: 0, y: -0.3, z: 0.7 }
  ][i];
}

function getProjected(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number
) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const xRotY = x * cosYaw - z * sinYaw;
  const zRotY = x * sinYaw + z * cosYaw;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const yRotX = y * cosPitch - zRotY * sinPitch;
  const zRotX = y * sinPitch + zRotY * cosPitch;

  const d = 0.25;
  const denom = 1 - d * zRotX;
  const scale = 135; // fits nicely in 480x380
  const cx = W / 2;
  const cy = H / 2;

  const px = cx + (xRotY * scale) / denom;
  const py = cy - (yRotX * scale) / denom;

  return { px, py, depth: zRotX };
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

type RenderItem3D =
  | {
      type: "node";
      i: number;
      label: string;
      px: number;
      py: number;
      depth: number;
      active: boolean;
    }
  | {
      type: "edge";
      i: number;
      j: number;
      pa: { px: number; py: number; depth: number };
      pb: { px: number; py: number; depth: number };
      prob: number;
      depth: number;
      active: boolean;
    }
  | {
      type: "self-loop";
      i: number;
      p: { px: number; py: number; depth: number };
      prob: number;
      depth: number;
      active: boolean;
    };

export default function MarkovChainTool() {
  const [k, setK] = useState(3);
  const [P, setP] = useState<number[][]>(() => defaultMatrix(3));
  const [state, setState] = useState(0);
  const [history, setHistory] = useState<number[]>([0]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("medium");

  // 3D States
  const [is3D, setIs3D] = useState(false);
  const [yaw, setYaw] = useState(-0.6);
  const [pitch, setPitch] = useState(0.4);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useRegisterToolState("markov-chain", { k, P, state, speed, is3D, yaw, pitch }, {
    k: changeSize,
    P: setP,
    state: setState,
    speed: setSpeed,
    is3D: setIs3D,
    yaw: setYaw,
    pitch: setPitch,
  });

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

  // 3D dragging handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!is3D) return;
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!is3D || !isDragging3D || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const sensitivity = 0.007;
    setYaw((prev) => prev + dx * sensitivity);
    setPitch((prev) => {
      const next = prev - dy * sensitivity;
      return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, next));
    });
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    if (!is3D) return;
    setIsDragging3D(false);
    dragStart.current = null;
  };

  const renderItems3D = useMemo(() => {
    if (!is3D) return [];

    const projectedNodes = Array.from({ length: k }).map((_, i) => {
      const p = nodePos3D(k, i);
      return {
        i,
        label: String.fromCharCode(65 + i),
        ...getProjected(p.x, p.y, p.z, yaw, pitch),
      };
    });

    const items: RenderItem3D[] = [];

    // Add nodes
    projectedNodes.forEach((node) => {
      items.push({
        type: "node",
        i: node.i,
        label: node.label,
        px: node.px,
        py: node.py,
        depth: node.depth,
        active: state === node.i,
      });
    });

    // Add edges
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const prob = P[i][j];
        if (prob <= 0.001) continue;
        const active = state === i;

        if (i === j) {
          items.push({
            type: "self-loop",
            i,
            p: projectedNodes[i],
            prob,
            depth: projectedNodes[i].depth + 0.02, // slightly in front of node
            active,
          });
        } else {
          const pa = projectedNodes[i];
          const pb = projectedNodes[j];
          items.push({
            type: "edge",
            i,
            j,
            pa,
            pb,
            prob,
            depth: (pa.depth + pb.depth) / 2,
            active,
          });
        }
      }
    }

    items.sort((a, b) => a.depth - b.depth);
    return items;
  }, [is3D, k, P, state, yaw, pitch]);

  // ── render
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto select-none touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {is3D ? (
              renderItems3D.map((item, idx) => {
                if (item.type === "node") {
                  return (
                    <g key={`n-${item.i}-${idx}`}>
                      <circle
                        cx={item.px}
                        cy={item.py}
                        r={26}
                        fill={item.active ? "#171717" : "#fff"}
                        stroke={item.active ? "#171717" : "#d4d4d4"}
                        strokeWidth={1.5}
                      />
                      <text
                        x={item.px}
                        y={item.py + 5}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight={600}
                        fill={item.active ? "#fff" : "#171717"}
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                } else if (item.type === "self-loop") {
                  const cxCenter = W / 2;
                  const cyCenter = H / 2;
                  const dx = item.p.px - cxCenter;
                  const dy = item.p.py - cyCenter;
                  const len = Math.hypot(dx, dy) || 1;
                  const nx = dx / len;
                  const ny = dy / len;

                  const loopRadius = 14;
                  const dist = 26 + 10;
                  const lcx = item.p.px + nx * dist;
                  const lcy = item.p.py + ny * dist;

                  const tx = lcx + nx * (loopRadius + 6);
                  const ty = lcy + ny * (loopRadius + 6) + 3;

                  const w = 0.5 + 3 * item.prob;

                  return (
                    <g key={`loop-${item.i}-${idx}`}>
                      <circle
                        cx={lcx}
                        cy={lcy}
                        r={loopRadius}
                        stroke={item.active ? "#fb923c" : "#d4d4d4"}
                        strokeWidth={item.active ? w + 0.5 : w}
                        fill="none"
                        opacity={item.active ? 1 : 0.45}
                      />
                      <text
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        fontSize="10"
                        fill={item.active ? "#fb923c" : "#737373"}
                      >
                        {item.prob.toFixed(2)}
                      </text>
                    </g>
                  );
                } else {
                  // edge
                  const { pa, pb, prob, active } = item;
                  const dx = pb.px - pa.px;
                  const dy = pb.py - pa.py;
                  const dist = Math.hypot(dx, dy) || 1;
                  const R = 26;
                  const startX = pa.px + (dx / dist) * R;
                  const startY = pa.py + (dy / dist) * R;
                  const endX = pb.px - (dx / dist) * R;
                  const endY = pb.py - (dy / dist) * R;

                  const ox = -dy / dist;
                  const oy = dx / dist;
                  const offset = 18;
                  const ctrlX = (startX + endX) / 2 + ox * offset;
                  const ctrlY = (startY + endY) / 2 + oy * offset;

                  const w = 0.5 + 3 * prob;

                  return (
                    <g key={`e-${item.i}-${item.j}-${idx}`}>
                      <path
                        d={`M${startX},${startY} Q${ctrlX},${ctrlY} ${endX},${endY}`}
                        stroke={active ? "#fb923c" : "#d4d4d4"}
                        strokeWidth={active ? w + 0.5 : w}
                        fill="none"
                        opacity={active ? 1 : 0.45}
                      />
                      <text
                        x={ctrlX}
                        y={ctrlY}
                        textAnchor="middle"
                        fontSize="10"
                        fill={active ? "#fb923c" : "#737373"}
                      >
                        {prob.toFixed(2)}
                      </text>
                    </g>
                  );
                }
              })
            ) : (
              <>
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
              </>
            )}

            {is3D && (
              <>
                <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                  Drag to rotate view (Yaw/Pitch)
                </text>

                <g
                  className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setYaw(-0.6);
                    setPitch(0.4);
                  }}
                  transform={`translate(${W - 80}, ${H - 28})`}
                >
                  <rect width="70" height="16" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                  <text x="35" y="11" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
                </g>
              </>
            )}
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
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer font-medium border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <input
            type="checkbox" checked={is3D}
            onChange={(e) => setIs3D(e.target.checked)}
            className="rounded text-indigo-600"
          />
          3D Transition Diagram
        </label>
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
