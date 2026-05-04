"use client";

import { useEffect, useRef, useState } from "react";

const W = 320, H = 200, PAD = 16;
const MAX_POINTS = 220;

export default function RandomWalkDemo() {
  const valRef = useRef(0);
  const [series, setSeries] = useState<number[]>([0]);

  useEffect(() => {
    const id = setInterval(() => {
      const step = (Math.random() - 0.5) * 1.6;
      valRef.current += step;
      // Soft pull toward zero so it doesn't drift off-screen.
      valRef.current *= 0.98;
      setSeries((prev) => {
        const next = [...prev, valRef.current];
        if (next.length > MAX_POINTS) {
          next.shift();
        }
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, []);

  const min = -6, max = 6;
  const sx = (i: number) => PAD + (i / (MAX_POINTS - 1)) * (W - 2 * PAD);
  const sy = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD);

  const path = series.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(2)},${sy(v).toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="#e5e5e5" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#171717" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {series.length > 0 && (
        <circle
          cx={sx(series.length - 1)}
          cy={sy(series[series.length - 1])}
          r={3.5}
          fill="#fb923c"
        />
      )}
    </svg>
  );
}
