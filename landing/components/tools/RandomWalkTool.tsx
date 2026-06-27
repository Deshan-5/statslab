"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Field, Stat, Select, NumberInput, Panel, Btn , useRegisterToolState } from "./shared/ui";

const W = 720, H = 320, PAD = 16;
const MAX = 600;

interface PathRef {
  x: number;
  y: number;
  z: number;
  xs: number[];
  ys: number[];
  zs: number[];
}

function getProjected(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  range: number
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
  const denom = 1 - d * (zRotX / range);

  const scale = 140; // fits height of 320px
  const cx = W / 2;
  const cy = H / 2;

  const px = cx + ((xRotY / range) * scale) / denom;
  const py = cy - ((yRotX / range) * scale) / denom;

  return { px, py, depth: zRotX / range };
}

export default function RandomWalkTool() {
  const [drift, setDrift] = useState(0);
  const [rev, setRev] = useState(0.99);
  const [stepDist, setStepDist] = useState<"normal" | "uniform">("normal");
  const [pathCount, setPathCount] = useState(5);
  const [dim, setDim] = useState<"1D" | "2D" | "3D">("1D");
  const [running, setRunning] = useState(true);
  const refs = useRef<PathRef[]>([]);
  const [tick, setTick] = useState(0);

  // 3D rotation angles
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.3);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useRegisterToolState("random-walk", { drift, rev, stepDist, pathCount, dim }, { drift: setDrift, rev: setRev, stepDist: setStepDist, pathCount: setPathCount, dim: setDim });
  useEffect(() => {
    refs.current = Array.from({ length: pathCount }, () => ({
      x: 0,
      y: 0,
      z: 0,
      xs: [0],
      ys: [0],
      zs: [0]
    }));
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
        p.y += sample() + (dim !== "1D" ? drift : 0);
        p.y *= rev;
        if (dim === "3D") {
          p.z += sample() + drift;
          p.z *= rev;
        }
        p.xs.push(p.x); p.ys.push(p.y); p.zs.push(p.z);
        if (p.xs.length > MAX) { p.xs.shift(); p.ys.shift(); p.zs.shift(); }
      }
      setTick((t) => t + 1);
    }, 40);
    return () => clearInterval(id);
  }, [running, drift, rev, stepDist, dim]);

  // 1D rendering
  const yMin = -10, yMax = 10;
  const sx = (i: number) => PAD + (i / (MAX - 1)) * (W - 2 * PAD);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  // 2D & 3D dynamic range scale
  const all = useMemo(() => {
    return refs.current.flatMap((p) => {
      const end = p.xs.length;
      const step = Math.max(1, Math.floor(end / 100)); // Downsample range search for performance
      const out: number[] = [];
      for (let i = 0; i < end; i += step) {
        out.push(p.xs[i], p.ys[i]);
        if (dim === "3D") out.push(p.zs[i]);
      }
      return out;
    });
  }, [tick, dim]);

  const range = useMemo(() => {
    return Math.max(8, ...all.map(Math.abs));
  }, [all]);

  const sx2 = (v: number) => W / 2 + (v / range) * (W / 2 - PAD);
  const sy2 = (v: number) => H / 2 - (v / range) * (H / 2 - PAD);

  const COLORS = ["#64748b", "#fb923c", "#0ea5e9", "#16a34a", "#a855f7", "#dc2626", "#737373", "#0f766e", "#9d174d", "#475569"];

  // 3D rotation dragging handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (dim !== "3D") return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dim !== "3D" || !isDragging || !dragStart.current) return;
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
    if (dim !== "3D") return;
    setIsDragging(false);
    dragStart.current = null;
  };

  // Build 3D path coordinates
  const get3DPathD = (p: PathRef) => {
    const pointsStr: string[] = [];
    for (let k = 0; k < p.xs.length; k++) {
      const proj = getProjected(p.xs[k], p.ys[k], p.zs[k], yaw, pitch, range);
      pointsStr.push(`${k === 0 ? "M" : "L"}${proj.px.toFixed(1)},${proj.py.toFixed(1)}`);
    }
    return pointsStr.join(" ");
  };

  // 3D Bounding Box Outline and ticks
  const boxOutline3D = useMemo(() => {
    if (dim !== "3D") return [];
    const getProj = (x: number, y: number, z: number) => getProjected(x * range, y * range, z * range, yaw, pitch, range);
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]
    ];

    // Floor
    for (let i = 0; i < 4; i++) {
      const p1 = getProj(corners[i][0], corners[i][1], corners[i][2]);
      const p2 = getProj(corners[(i + 1) % 4][0], corners[(i + 1) % 4][1], corners[(i + 1) % 4][2]);
      edges.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py });
    }
    // Ceiling
    for (let i = 0; i < 4; i++) {
      const p1 = getProj(corners[i + 4][0], corners[i + 4][1], corners[i + 4][2]);
      const p2 = getProj(corners[((i + 1) % 4) + 4][0], corners[((i + 1) % 4) + 4][1], corners[((i + 1) % 4) + 4][2]);
      edges.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py });
    }
    // Pillars
    for (let i = 0; i < 4; i++) {
      const p1 = getProj(corners[i][0], corners[i][1], corners[i][2]);
      const p2 = getProj(corners[i + 4][0], corners[i + 4][1], corners[i + 4][2]);
      edges.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py });
    }

    return edges;
  }, [dim, yaw, pitch, range]);

  // 3D Endpoint circles with depth sorting
  const endpoints3D = useMemo(() => {
    if (dim !== "3D") return [];
    const pts = refs.current.map((p, i) => {
      const proj = getProjected(p.x, p.y, p.z, yaw, pitch, range);
      return {
        cx: proj.px,
        cy: proj.py,
        r: 4.5 / (1 - 0.25 * proj.depth),
        fill: COLORS[i % COLORS.length],
        depth: proj.depth
      };
    });
    // Sort so closer circles are drawn last
    return [...pts].sort((a, b) => a.depth - b.depth);
  }, [dim, tick, yaw, pitch, range]);

  // Stats
  const last = refs.current.map((p) => p.x);
  const maxV = Math.max(0, ...refs.current.map((p) => Math.max(...p.xs)));
  const minV = Math.min(0, ...refs.current.map((p) => Math.min(...p.xs)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className={`w-full h-auto select-none ${dim === "3D" ? "cursor-move" : ""}`}
            key={`${pathCount}-${dim}-${tick}`}
            onPointerDown={dim === "3D" ? handlePointerDown : undefined}
            onPointerMove={dim === "3D" ? handlePointerMove : undefined}
            onPointerUp={dim === "3D" ? handlePointerUp : undefined}
            onPointerLeave={dim === "3D" ? handlePointerUp : undefined}
            style={{ touchAction: "none" }}
          >
            {dim === "1D" && (
              <>
                <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                {refs.current.map((p, i) => (
                  <path key={i} d={p.xs.map((v, k) => `${k === 0 ? "M" : "L"}${sx(k).toFixed(2)},${sy(v).toFixed(2)}`).join(" ")}
                        fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={pathCount === 1 ? 1.6 : 1.1}
                        strokeOpacity={pathCount === 1 ? 1 : 0.7} />
                ))}
              </>
            )}

            {dim === "2D" && (
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

            {dim === "3D" && (
              <>
                {/* 3D Bounding Box */}
                {boxOutline3D.map((edge, i) => (
                  <line key={`e-${i}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="var(--chart-axis)" strokeWidth={0.7} opacity={0.3} />
                ))}

                {/* 3D Paths */}
                {refs.current.map((p, i) => (
                  <path key={i} d={get3DPathD(p)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={1.2} strokeOpacity={0.8} />
                ))}

                {/* 3D Endpoints depth-sorted */}
                {endpoints3D.map((circle, i) => (
                  <circle key={`c3d-${i}`} cx={circle.cx} cy={circle.cy} r={circle.r} fill={circle.fill} stroke="#ffffff" strokeWidth={1} />
                ))}

                {/* Drag hint */}
                <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                  Drag to rotate view (Yaw/Pitch)
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
        
        <Select label="Dimension" value={dim} onChange={(v) => setDim(v as "1D" | "2D" | "3D")}
          options={[
            { value: "1D", label: "1D Mode" },
            { value: "2D", label: "2D Mode" },
            { value: "3D", label: "3D Mode" }
          ]}
        />

        <Stat label="Mean x" value={(last.reduce((s, v) => s + v, 0) / last.length).toFixed(3)} />
        <Stat label="Max reached" value={maxV.toFixed(3)} />
        <Stat label="Min reached" value={minV.toFixed(3)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Resume"}</Btn>
          <Btn onClick={() => { refs.current.forEach((p) => { p.x = 0; p.y = 0; p.z = 0; p.xs = [0]; p.ys = [0]; p.zs = [0]; }); setTick((t) => t + 1); }}>Reset</Btn>
        </div>
      </Panel>
    </div>
  );
}
