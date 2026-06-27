"use client";

import { useRef, useState, useMemo, useEffect } from "react";

const VIEW_W = 480;
const VIEW_H = 360;
const PAD_L = 56;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 48;

const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

const FIXED: { x: number; y: number }[] = [
  { x: 1.0, y: 1.6 }, { x: 1.7, y: 2.0 }, { x: 2.4, y: 2.7 },
  { x: 3.1, y: 2.9 }, { x: 3.8, y: 3.6 }, { x: 4.5, y: 3.4 },
  { x: 5.2, y: 4.5 }, { x: 5.9, y: 4.7 }, { x: 6.6, y: 5.6 },
  { x: 7.3, y: 5.3 }, { x: 8.0, y: 6.4 }, { x: 8.7, y: 6.9 },
];

const DOMAIN_X: [number, number] = [0, 10];
const DOMAIN_Y: [number, number] = [0, 8];

const sx2d = (x: number) => PAD_L + ((x - DOMAIN_X[0]) / (DOMAIN_X[1] - DOMAIN_X[0])) * PLOT_W;
const sy2d = (y: number) => PAD_T + (1 - (y - DOMAIN_Y[0]) / (DOMAIN_Y[1] - DOMAIN_Y[0])) * PLOT_H;
const inv_x = (px: number) => DOMAIN_X[0] + ((px - PAD_L) / PLOT_W) * (DOMAIN_X[1] - DOMAIN_X[0]);
const inv_y = (py: number) => DOMAIN_Y[0] + (1 - (py - PAD_T) / PLOT_H) * (DOMAIN_Y[1] - DOMAIN_Y[0]);

function regression(pts: { x: number; y: number }[]) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const ssTot = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

// ─── 3D projection constants ──────────────────────────────────────────────────
const PITCH = 0.22;   // fixed downward tilt
const FOCUS = 3.8;    // perspective focal depth
const SCALE3D = 108;  // pixel scale per unit
const CX3D = 240;     // canvas center x
const CY3D = 175;     // canvas center y

// Normalise data coords to 3D space
const toX3 = (x: number) => (x - 5) * 0.30;
const toY3 = (y: number) => (y - 4) * 0.25;
const toZ3 = (residual: number) => residual * 0.50;

interface Props {
  mode?: "2d" | "3d";
}

export default function ScatterRegressionDemo({ mode = "2d" }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [orange, setOrange] = useState({ x: 5.5, y: 6.5 });
  const [dragging, setDragging] = useState(false);
  const [yaw, setYaw] = useState(0.5);

  const all = useMemo(() => [...FIXED, orange], [orange]);
  const { slope, intercept, r2 } = useMemo(() => regression(all), [all]);

  // Auto-rotate in 3D mode
  useEffect(() => {
    if (mode !== "3d") return;
    let id: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setYaw(y => y + dt * 0.28);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mode]);

  // Project a 3D point → SVG screen coords
  const project = (x3: number, y3: number, z3: number) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const rx = x3 * cy + z3 * sy;
    const rz = -x3 * sy + z3 * cy;
    const ry = y3 * cp - rz * sp;
    const rz2 = y3 * sp + rz * cp;
    const p = FOCUS / (FOCUS + rz2);
    return { sx: CX3D + rx * SCALE3D * p, sy: CY3D - ry * SCALE3D * p, depth: rz2 };
  };

  const toDataCoords = (clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * VIEW_W;
    const py = ((clientY - r.top) / r.height) * VIEW_H;
    const x = Math.max(DOMAIN_X[0] + 0.1, Math.min(DOMAIN_X[1] - 0.1, inv_x(px)));
    const y = Math.max(DOMAIN_Y[0] + 0.1, Math.min(DOMAIN_Y[1] - 0.1, inv_y(py)));
    return { x, y };
  };

  // ── 3D render ──────────────────────────────────────────────────────────────
  if (mode === "3d") {
    // Compute projected positions for all data points
    const pts3d = all.map((pt, i) => {
      const yhat = intercept + slope * pt.x;
      const residual = pt.y - yhat;
      const x3 = toX3(pt.x);
      const y3 = toY3(pt.y);
      const z3 = toZ3(residual);
      const yhat3 = toY3(yhat);

      const proj = project(x3, y3, z3);
      const projReg = project(x3, yhat3, 0);  // foot on the regression line

      return {
        ...proj,
        footSx: projReg.sx,
        footSy: projReg.sy,
        isOrange: i === all.length - 1,
      };
    });

    // Sort back-to-front (painter's algorithm)
    const sorted = [...pts3d].sort((a, b) => a.depth - b.depth);

    // Sample the regression line at z=0
    const regLine: string[] = [];
    for (let xi = 0; xi <= 10; xi += 0.4) {
      const yhat = intercept + slope * xi;
      const p = project(toX3(xi), toY3(yhat), 0);
      regLine.push(`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`);
    }

    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto select-none"
        style={{ touchAction: "none" }}
      >
        {/* Dashed residual drop-lines: point → foot on regression line */}
        {pts3d.map((pt, i) => (
          <line
            key={`res-${i}`}
            x1={pt.sx} y1={pt.sy}
            x2={pt.footSx} y2={pt.footSy}
            stroke={pt.isOrange ? "#fb923c" : "var(--chart-axis)"}
            strokeWidth={pt.isOrange ? 1.4 : 0.9}
            strokeOpacity={0.38}
            strokeDasharray="3 2"
          />
        ))}

        {/* Regression line in 3D */}
        <polyline
          points={regLine.join(" ")}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Small foot dots on regression line */}
        {pts3d.map((pt, i) => (
          <circle
            key={`foot-${i}`}
            cx={pt.footSx} cy={pt.footSy} r={2}
            fill={pt.isOrange ? "#fb923c" : "#6366f1"}
            fillOpacity={0.55}
          />
        ))}

        {/* Points back-to-front */}
        {sorted.map((pt, i) => {
          const d01 = Math.max(0, Math.min(1, (pt.depth + 1.5) / 3));
          const r = pt.isOrange ? 8 : (3.2 + d01 * 2.8);
          return (
            <circle
              key={i}
              cx={pt.sx} cy={pt.sy} r={r}
              fill={pt.isOrange ? "#fb923c" : "var(--chart-ink)"}
              fillOpacity={pt.isOrange ? 1 : 0.6 + d01 * 0.35}
              stroke={pt.isOrange ? "var(--chart-bg)" : "none"}
              strokeWidth={pt.isOrange ? 2.5 : 0}
            />
          );
        })}

        {/* Readout (fixed, not projected) */}
        <g>
          <rect
            x={VIEW_W - PAD_R - 160} y={PAD_T + 6}
            width={152} height={44} rx={8}
            fill="var(--chart-bg)" stroke="var(--chart-axis)"
          />
          <text x={VIEW_W - PAD_R - 150} y={PAD_T + 22} fontSize="11" fill="var(--chart-muted)">
            ŷ = {slope.toFixed(2)}·x + {intercept.toFixed(2)}
          </text>
          <text x={VIEW_W - PAD_R - 150} y={PAD_T + 38} fontSize="11" fill="var(--chart-muted)">
            R² = {r2.toFixed(3)}
          </text>
        </g>

        {/* Z-axis label */}
        <text x={PAD_L} y={VIEW_H - 10} fontSize="9" fill="var(--chart-muted)" opacity={0.65} fontFamily="monospace">
          Z = residual from regression
        </text>
      </svg>
    );
  }

  // ── 2D render (original) ───────────────────────────────────────────────────
  const xL = DOMAIN_X[0], xR = DOMAIN_X[1];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto select-none"
      style={{ touchAction: "none" }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const c = toDataCoords(e.clientX, e.clientY);
        if (c) setOrange(c);
      }}
    >
      {/* axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VIEW_H - PAD_B} stroke="var(--chart-axis)" strokeWidth={1} />
      <line x1={PAD_L} y1={VIEW_H - PAD_B} x2={VIEW_W - PAD_R} y2={VIEW_H - PAD_B} stroke="var(--chart-axis)" strokeWidth={1} />

      {/* gridlines */}
      {[2, 4, 6, 8].map((y) => (
        <line key={`gy-${y}`} x1={PAD_L} y1={sy2d(y)} x2={VIEW_W - PAD_R} y2={sy2d(y)} stroke="var(--chart-grid)" strokeWidth={1} />
      ))}
      {[2, 4, 6, 8].map((x) => (
        <line key={`gx-${x}`} x1={sx2d(x)} y1={PAD_T} x2={sx2d(x)} y2={VIEW_H - PAD_B} stroke="var(--chart-grid)" strokeWidth={1} />
      ))}

      {/* tick labels */}
      {[0, 2, 4, 6, 8].map((y) => (
        <text key={`ty-${y}`} x={PAD_L - 8} y={sy2d(y) + 4} textAnchor="end" fontSize="10" fill="var(--chart-muted)">{y}</text>
      ))}
      {[0, 2, 4, 6, 8, 10].map((x) => (
        <text key={`tx-${x}`} x={sx2d(x)} y={VIEW_H - PAD_B + 14} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">{x}</text>
      ))}

      {/* regression line */}
      <line
        x1={sx2d(xL)} y1={sy2d(intercept + slope * xL)}
        x2={sx2d(xR)} y2={sy2d(intercept + slope * xR)}
        stroke="#6366f1"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ transition: "all 0.06s linear" }}
      />

      {/* fixed data points */}
      {FIXED.map((p, i) => (
        <circle key={i} cx={sx2d(p.x)} cy={sy2d(p.y)} r={4.5} fill="var(--chart-ink)" fillOpacity={0.85} />
      ))}

      {/* orange draggable point */}
      <circle
        cx={sx2d(orange.x)}
        cy={sy2d(orange.y)}
        r={dragging ? 10 : 8}
        fill="#fb923c"
        stroke="var(--chart-bg)"
        strokeWidth={2.5}
        style={{ cursor: dragging ? "grabbing" : "grab", transition: "r 0.12s ease" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
          setDragging(false);
        }}
        onPointerCancel={(e) => {
          (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
          setDragging(false);
        }}
        onLostPointerCapture={() => setDragging(false)}
      />

      {/* readout */}
      <g>
        <rect
          x={VIEW_W - PAD_R - 160} y={PAD_T + 6}
          width={152} height={44} rx={8}
          fill="var(--chart-bg)" stroke="var(--chart-axis)"
        />
        <text x={VIEW_W - PAD_R - 150} y={PAD_T + 22} fontSize="11" fill="var(--chart-muted)">
          ŷ = {slope.toFixed(2)}·x + {intercept.toFixed(2)}
        </text>
        <text x={VIEW_W - PAD_R - 150} y={PAD_T + 38} fontSize="11" fill="var(--chart-muted)">
          R² = {r2.toFixed(3)}
        </text>
      </g>
    </svg>
  );
}
