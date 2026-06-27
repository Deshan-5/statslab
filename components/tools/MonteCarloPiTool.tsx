"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Stat, Panel, Btn, Select, NumberInput , useRegisterToolState } from "./shared/ui";

const W = 360, H = 360, PAD = 20;
const SIZE = W - 2 * PAD;

type Pt = { x: number; y: number; z?: number; inside: boolean };

export default function MonteCarloPiTool() {
  const [is3D, setIs3D] = useState(false);
  const [pts, setPts] = useState<Pt[]>([]);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("fast");
  const insideRef = useRef(0);
  const totalRef = useRef(0);
  const [trace, setTrace] = useState<number[]>([]);

  // 3D states
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.3);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const resetSimulation = () => {
    insideRef.current = 0;
    totalRef.current = 0;
    setPts([]);
    setTrace([]);
  };

  const handleToggle3D = (checked: boolean) => {
    setIs3D(checked);
    resetSimulation();
  };

  useRegisterToolState("monte-carlo-pi", { is3D, speed }, { is3D: setIs3D, speed: setSpeed });
  useEffect(() => {
    if (!running) return;
    const interval = speed === "slow" ? 50 : speed === "medium" ? 20 : 8;
    const id = setInterval(() => {
      let x = 0, y = 0, z = 0, inside = false;
      if (is3D) {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        inside = x * x + y * y + z * z <= 1;
      } else {
        x = Math.random();
        y = Math.random();
        inside = x * x + y * y <= 1;
      }

      insideRef.current += inside ? 1 : 0;
      totalRef.current += 1;

      setPts((p) => {
        const item: Pt = is3D ? { x, y, z, inside } : { x, y, inside };
        const n = [...p, item];
        if (n.length > 1500) n.splice(0, n.length - 1500);
        return n;
      });

      if (totalRef.current % 25 === 0) {
        setTrace((t) => {
          const piVal = is3D
            ? (6 * insideRef.current) / totalRef.current
            : (4 * insideRef.current) / totalRef.current;
          const n = [...t, piVal];
          if (n.length > 240) n.shift();
          return n;
        });
      }
    }, interval);
    return () => clearInterval(id);
  }, [running, speed, is3D]);

  const pi = totalRef.current === 0
    ? 0
    : is3D
      ? (6 * insideRef.current) / totalRef.current
      : (4 * insideRef.current) / totalRef.current;

  const sx = (v: number) => PAD + v * SIZE;
  const sy = (v: number) => PAD + (1 - v) * SIZE;

  const tW = 360, tH = 120;
  const tMin = trace.length ? Math.min(...trace) : Math.PI - 0.5;
  const tMax = trace.length ? Math.max(...trace) : Math.PI + 0.5;
  const tx = (i: number) => 8 + (i / Math.max(1, trace.length - 1)) * (tW - 16);
  const ty = (v: number) => tH - 8 - ((v - tMin) / (tMax - tMin || 1)) * (tH - 16);
  const tracePath = trace.map((v, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(2)},${ty(v).toFixed(2)}`).join(" ");

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging3D || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setYaw((y) => y + dx * 0.01);
    setPitch((p) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p - dy * 0.01)));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(false);
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const renderItems3D = useMemo(() => {
    if (!is3D) return [];

    const getProj = (x: number, y: number, z: number) => {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const xRotY = x * cosYaw - z * sinYaw;
      const zRotY = x * sinYaw + z * cosYaw;

      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const yRotX = y * cosPitch - zRotY * sinPitch;
      const zRotX = y * sinPitch + zRotY * cosPitch;

      const d = 0.2;
      const denom = 1 - d * zRotX;
      const scale = 115;
      const cx = W / 2;
      const cy = H / 2;

      const px = cx + (xRotY * scale) / denom;
      const py = cy - (yRotX * scale) / denom;

      return { px, py, depth: zRotX };
    };

    interface PtItem {
      type: "pt";
      cx: number;
      cy: number;
      r: number;
      fill: string;
      depth: number;
    }
    interface EdgeItem {
      type: "edge";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      depth: number;
    }
    interface SphereRingItem {
      type: "ring";
      path: string;
      depth: number;
    }

    const output: (PtItem | EdgeItem | SphereRingItem)[] = [];

    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]
    ];
    const floorIndices = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const ceilIndices = [[4, 5], [5, 6], [6, 7], [7, 4]];
    const pillarIndices = [[0, 4], [1, 5], [2, 6], [3, 7]];

    const getEdgeProj = (c1: number[], c2: number[]) => {
      const p1 = getProj(c1[0], c1[1], c1[2]);
      const p2 = getProj(c2[0], c2[1], c2[2]);
      return { x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py, depth: (p1.depth + p2.depth) / 2 };
    };

    for (const [i1, i2] of floorIndices) output.push({ type: "edge", ...getEdgeProj(corners[i1], corners[i2]) });
    for (const [i1, i2] of ceilIndices) output.push({ type: "edge", ...getEdgeProj(corners[i1], corners[i2]) });
    for (const [i1, i2] of pillarIndices) output.push({ type: "edge", ...getEdgeProj(corners[i1], corners[i2]) });

    const sampleRing = (plane: "xy" | "xz" | "yz") => {
      const steps = 36;
      const ptsRing: { px: number; py: number; depth: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const theta = (2 * Math.PI * i) / steps;
        const c = Math.cos(theta), s = Math.sin(theta);
        const p = plane === "xy" ? getProj(c, s, 0)
                : plane === "xz" ? getProj(c, 0, s)
                : getProj(0, c, s);
        ptsRing.push(p);
      }
      const path = ptsRing.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
      const avgDepth = ptsRing.reduce((sum, p) => sum + p.depth, 0) / ptsRing.length;
      return { type: "ring" as const, path, depth: avgDepth };
    };

    output.push(sampleRing("xy"));
    output.push(sampleRing("xz"));
    output.push(sampleRing("yz"));

    for (const p of pts) {
      if (p.z === undefined) continue;
      const proj = getProj(p.x, p.y, p.z);
      output.push({
        type: "pt",
        cx: proj.px,
        cy: proj.py,
        r: 1.8 / (1 - 0.22 * proj.depth),
        fill: p.inside ? "#22c55e" : "#ef4444",
        depth: proj.depth
      });
    }

    return output.sort((a, b) => a.depth - b.depth);
  }, [is3D, pts, yaw, pitch]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Panel>
          {is3D ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto select-none cursor-move"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {renderItems3D.map((item, idx) => {
                if (item.type === "edge") {
                  return (
                    <line key={idx} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2}
                          stroke="var(--chart-axis)" strokeWidth={0.8} strokeOpacity={0.3} />
                  );
                } else if (item.type === "ring") {
                  return (
                    <path key={idx} d={item.path} fill="none" stroke="#fbbf24" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 3" />
                  );
                } else if (item.type === "pt") {
                  return (
                    <circle key={idx} cx={item.cx} cy={item.cy} r={item.r} fill={item.fill} fillOpacity={0.8} />
                  );
                }
                return null;
              })}

              <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                Drag to rotate view · Points inside sphere are green
              </text>

              <g 
                className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setYaw(0.6);
                  setPitch(0.3);
                }}
                transform={`translate(${W - 80}, ${H - 24})`}
              >
                <rect width="70" height="16" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                <text x="35" y="11" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
              </g>
            </svg>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <rect x={PAD} y={PAD} width={SIZE} height={SIZE} fill="none" stroke="var(--chart-axis)" />
              <path d={`M${PAD},${PAD + SIZE} A${SIZE},${SIZE} 0 0 1 ${PAD + SIZE},${PAD}`}
                    fill="#fbbf24" fillOpacity={0.12} stroke="#fbbf24" strokeWidth={1.2} />
              {pts.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={1.4}
                        fill={p.inside ? "#16a34a" : "#dc2626"} fillOpacity={0.85} />
              ))}
            </svg>
          )}
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
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <span className="text-sm font-semibold text-neutral-200">3D Sphere Estimation</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={is3D} onChange={(e) => handleToggle3D(e.target.checked)} />
            <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-white"></div>
          </label>
        </div>

        <Stat label="π estimate" value={pi.toFixed(5)} />
        <Stat label="Samples" value={totalRef.current.toLocaleString()} />
        <Stat label="Inside" value={insideRef.current.toLocaleString()} />
        <Stat label="Error" value={(Math.abs(pi - Math.PI) || 0).toFixed(5)} />
        <Select label="Speed" value={speed} onChange={(v) => setSpeed(v as typeof speed)}
          options={[{ value: "slow", label: "Slow" }, { value: "medium", label: "Medium" }, { value: "fast", label: "Fast" }]} />
        <NumberInput label="Step samples" value={1} onChange={(v) => {
          const steps = Math.max(1, Math.round(v));
          for (let i = 0; i < steps; i++) {
            let x = 0, y = 0, z = 0, inside = false;
            if (is3D) {
              x = Math.random() * 2 - 1;
              y = Math.random() * 2 - 1;
              z = Math.random() * 2 - 1;
              inside = x * x + y * y + z * z <= 1;
            } else {
              x = Math.random();
              y = Math.random();
              inside = x * x + y * y <= 1;
            }
            insideRef.current += inside ? 1 : 0;
            totalRef.current += 1;
          }
          setPts((p) => [...p]);
        }} step={100} min={1} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
          <Btn onClick={resetSimulation}>Reset</Btn>
        </div>
      </Panel>
    </div>
  );
}
