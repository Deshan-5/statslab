"use client";

import { useEffect, useRef, useState } from "react";

const W = 320, H = 200, PAD = 16;
const BINS = 18;

// Skewed source (Gamma-like via sum of exponentials).
function sampleSkewed() {
  let s = 0;
  for (let i = 0; i < 2; i++) s += -Math.log(Math.random());
  return s;
}

function meanOfN(n: number) {
  let s = 0;
  for (let i = 0; i < n; i++) s += sampleSkewed();
  return s / n;
}

export default function CLTDemo() {
  const [counts, setCounts] = useState<number[]>(() => Array(BINS).fill(0));
  const [drawn, setDrawn] = useState(0);
  const nRef = useRef(8);

  useEffect(() => {
    const id = setInterval(() => {
      const m = meanOfN(nRef.current);
      const x = Math.max(0, Math.min(BINS - 1, Math.floor((m / 6) * BINS)));
      setCounts((prev) => {
        const next = [...prev];
        next[x] += 1;
        return next;
      });
      setDrawn((d) => {
        const nd = d + 1;
        if (nd > 220) {
          setCounts(Array(BINS).fill(0));
          return 0;
        }
        return nd;
      });
    }, 35);
    return () => clearInterval(id);
  }, []);

  const max = Math.max(1, ...counts);
  const barW = (W - 2 * PAD) / BINS;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e5e5e5" />
      {counts.map((c, i) => {
        const h = (c / max) * (H - 2 * PAD - 8);
        return (
          <rect
            key={i}
            x={PAD + i * barW + 1}
            y={H - PAD - h}
            width={barW - 2}
            height={h}
            fill="var(--chart-ink)"
            fillOpacity={0.85}
            rx={1.5}
            style={{ transition: "y 0.15s linear, height 0.15s linear" }}
          />
        );
      })}
      <text x={PAD} y={20} fontSize="10" fill="#737373">
        sampling dist of x̄ — n = {nRef.current}, draws = {drawn}
      </text>
    </svg>
  );
}
