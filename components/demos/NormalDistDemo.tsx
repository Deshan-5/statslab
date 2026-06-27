"use client";

import { useEffect, useState } from "react";

const W = 320, H = 200, PAD = 16;

function bellPath(mu: number, sigma: number) {
  const xs = Array.from({ length: 80 }, (_, i) => -4 + (8 * i) / 79);
  const ys = xs.map((x) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)));
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + ((x + 4) / 8) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  return xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" ");
}

export default function NormalDistDemo() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const mu = Math.sin(t * 0.6) * 1.6;
  const sigma = 0.6 + 0.45 * (1 + Math.sin(t * 0.4)) / 2;
  const path = bellPath(mu, sigma);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      <path d={`${path} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`} fill="#fbbf24" fillOpacity={0.18} />
      <path d={path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} strokeLinejoin="round" />
      <text x={PAD} y={20} fontSize="10" fill="#737373">
        μ = {mu.toFixed(2)}   σ = {sigma.toFixed(2)}
      </text>
    </svg>
  );
}
