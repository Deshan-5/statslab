"use client";

import { useEffect, useState } from "react";

const W = 320, H = 200, PAD = 16;
const N = 14;

function rand(seed: number) {
  // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePoints(seedKey: number) {
  const r = rand(seedKey);
  const slope = 0.4 + r() * 0.4;
  const intercept = -1 + r() * 1.5;
  return Array.from({ length: N }, (_, i) => {
    const x = (i / (N - 1)) * 8 + 1;
    const y = slope * x + intercept + (r() - 0.5) * 1.6;
    return { x, y };
  });
}

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
  return { slope, intercept: my - slope * mx };
}

export default function LinearRegressionDemo() {
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setSeed((s) => s + 1), 2400);
    return () => clearInterval(id);
  }, []);

  const pts = makePoints(seed);
  const { slope, intercept } = regression(pts);

  const xMin = 0, xMax = 10, yMin = -2, yMax = 6;
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      <line
        x1={sx(xMin)}
        y1={sy(intercept + slope * xMin)}
        x2={sx(xMax)}
        y2={sy(intercept + slope * xMax)}
        stroke="#6366f1"
        strokeWidth={2}
        style={{ transition: "all 0.6s ease" }}
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={3.5}
          fill="#fb923c"
          style={{ transition: "all 0.6s ease" }}
        />
      ))}
    </svg>
  );
}
