"use client";

import { useRef, useState, useMemo } from "react";

const VIEW_W = 480;
const VIEW_H = 360;
const PAD_L = 56;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 48;

const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

// Fixed scatter: roughly upward trend with noise.
const FIXED: { x: number; y: number }[] = [
  { x: 1.0,  y: 1.6 },
  { x: 1.7,  y: 2.0 },
  { x: 2.4,  y: 2.7 },
  { x: 3.1,  y: 2.9 },
  { x: 3.8,  y: 3.6 },
  { x: 4.5,  y: 3.4 },
  { x: 5.2,  y: 4.5 },
  { x: 5.9,  y: 4.7 },
  { x: 6.6,  y: 5.6 },
  { x: 7.3,  y: 5.3 },
  { x: 8.0,  y: 6.4 },
  { x: 8.7,  y: 6.9 },
];

const DOMAIN_X: [number, number] = [0, 10];
const DOMAIN_Y: [number, number] = [0, 8];

const sx = (x: number) => PAD_L + ((x - DOMAIN_X[0]) / (DOMAIN_X[1] - DOMAIN_X[0])) * PLOT_W;
const sy = (y: number) => PAD_T + (1 - (y - DOMAIN_Y[0]) / (DOMAIN_Y[1] - DOMAIN_Y[0])) * PLOT_H;
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
  // R²
  const ssTot = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const ssRes = pts.reduce((s, p) => {
    const yhat = intercept + slope * p.x;
    return s + (p.y - yhat) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

export default function ScatterRegressionDemo() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [orange, setOrange] = useState({ x: 5.5, y: 6.5 });
  const [dragging, setDragging] = useState(false);

  const all = useMemo(() => [...FIXED, orange], [orange]);
  const { slope, intercept, r2 } = useMemo(() => regression(all), [all]);

  const xL = DOMAIN_X[0], xR = DOMAIN_X[1];
  const lineX1 = sx(xL);
  const lineY1 = sy(intercept + slope * xL);
  const lineX2 = sx(xR);
  const lineY2 = sy(intercept + slope * xR);

  const toDataCoords = (clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * VIEW_W;
    const py = ((clientY - r.top) / r.height) * VIEW_H;
    const x = Math.max(DOMAIN_X[0] + 0.1, Math.min(DOMAIN_X[1] - 0.1, inv_x(px)));
    const y = Math.max(DOMAIN_Y[0] + 0.1, Math.min(DOMAIN_Y[1] - 0.1, inv_y(py)));
    return { x, y };
  };

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
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VIEW_H - PAD_B} stroke="#e5e5e5" strokeWidth={1} />
      <line x1={PAD_L} y1={VIEW_H - PAD_B} x2={VIEW_W - PAD_R} y2={VIEW_H - PAD_B} stroke="#e5e5e5" strokeWidth={1} />

      {/* gridlines */}
      {[2, 4, 6, 8].map((y) => (
        <line key={`gy-${y}`} x1={PAD_L} y1={sy(y)} x2={VIEW_W - PAD_R} y2={sy(y)} stroke="#f3f3f3" strokeWidth={1} />
      ))}
      {[2, 4, 6, 8].map((x) => (
        <line key={`gx-${x}`} x1={sx(x)} y1={PAD_T} x2={sx(x)} y2={VIEW_H - PAD_B} stroke="#f3f3f3" strokeWidth={1} />
      ))}

      {/* tick labels */}
      {[0, 2, 4, 6, 8].map((y) => (
        <text key={`ty-${y}`} x={PAD_L - 8} y={sy(y) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
          {y}
        </text>
      ))}
      {[0, 2, 4, 6, 8, 10].map((x) => (
        <text key={`tx-${x}`} x={sx(x)} y={VIEW_H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
          {x}
        </text>
      ))}

      {/* regression line */}
      <line
        x1={lineX1}
        y1={lineY1}
        x2={lineX2}
        y2={lineY2}
        stroke="#171717"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ transition: "all 0.06s linear" }}
      />

      {/* fixed points */}
      {FIXED.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={5}
          fill="#171717"
          fillOpacity={0.85}
        />
      ))}

      {/* orange draggable — interactions must NOT bubble to the parent card link */}
      <circle
        cx={sx(orange.x)}
        cy={sy(orange.y)}
        r={dragging ? 11 : 9}
        fill="#fb923c"
        stroke="#ffffff"
        strokeWidth={3}
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
          x={VIEW_W - PAD_R - 168}
          y={PAD_T + 8}
          width={160}
          height={48}
          rx={10}
          fill="#ffffff"
          stroke="#e5e5e5"
        />
        <text x={VIEW_W - PAD_R - 156} y={PAD_T + 26} fontSize="11" fill="#737373">
          ŷ = {slope.toFixed(2)}·x + {intercept.toFixed(2)}
        </text>
        <text x={VIEW_W - PAD_R - 156} y={PAD_T + 44} fontSize="11" fill="#737373">
          R² = {r2.toFixed(3)}
        </text>
      </g>
    </svg>
  );
}
