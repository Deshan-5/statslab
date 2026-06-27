"use client";

import { useEffect, useState } from "react";

const W = 320, H = 200, PAD = 18;

// Unnormalised Beta(α, β) pdf shape, then numerically normalise for plotting.
function betaShape(a: number, b: number) {
  const xs = Array.from({ length: 120 }, (_, i) => 0.001 + 0.998 * (i / 119));
  const ys = xs.map((x) => Math.pow(x, a - 1) * Math.pow(1 - x, b - 1));
  return { xs, ys };
}

export default function BayesUpdateDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 24), 500);
    return () => clearInterval(id);
  }, []);

  const aPri = 2, bPri = 2;
  // Each step adds a "success" to drift the posterior right.
  const trueP = 0.7;
  const successes = Math.round(step * trueP);
  const failures = step - successes;
  const a = aPri + successes;
  const b = bPri + failures;

  const prior = betaShape(aPri, bPri);
  const post = betaShape(a, b);
  const ymax = Math.max(...prior.ys, ...post.ys);

  const sx = (x: number) => PAD + x * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);

  const toPath = (xs: number[], ys: number[]) =>
    xs.map((x, i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(2)},${sy(ys[i]).toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      <path d={toPath(prior.xs, prior.ys)} fill="none" stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 4" />
      <path d={toPath(post.xs, post.ys)} fill="none" stroke="var(--chart-ink)" strokeWidth={2}
            style={{ transition: "all 0.4s ease" }} />
      <line x1={sx(trueP)} y1={PAD} x2={sx(trueP)} y2={H - PAD} stroke="#fb923c" strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={PAD} y={20} fontSize="10" fill="#737373">
        Beta({a.toFixed(0)}, {b.toFixed(0)})
      </text>
      <text x={W - PAD} y={20} fontSize="10" fill="#737373" textAnchor="end">
        n = {step}
      </text>
    </svg>
  );
}
