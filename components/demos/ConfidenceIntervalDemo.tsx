"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const W = 320, H = 200, PAD = 18;
const TRUE_MU = 0.5;
const N_LINES = 9;

function rand(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeIntervals(seedKey: number) {
  const r = rand(seedKey);
  return Array.from({ length: N_LINES }, () => {
    const center = TRUE_MU + (r() - 0.5) * 0.5;
    const width = 0.18 + r() * 0.18;
    const lo = center - width / 2;
    const hi = center + width / 2;
    return { lo, hi, center };
  });
}

export default function ConfidenceIntervalDemo() {
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setSeed((s) => s + 1), 2200);
    return () => clearInterval(id);
  }, []);

  const intervals = makeIntervals(seed);
  const sx = (v: number) => PAD + v * (W - 2 * PAD);
  const rowY = (i: number) => PAD + (i + 0.5) * ((H - 2 * PAD) / N_LINES);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={sx(TRUE_MU)} y1={PAD} x2={sx(TRUE_MU)} y2={H - PAD} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="3 3" />
      {intervals.map((iv, i) => {
        const hit = iv.lo <= TRUE_MU && TRUE_MU <= iv.hi;
        return (
          <g key={`${seed}-${i}`}>
            <motion.line
              x1={sx(iv.lo)}
              x2={sx(iv.hi)}
              y1={rowY(i)}
              y2={rowY(i)}
              stroke={hit ? "#16a34a" : "#dc2626"}
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            />
            <motion.circle
              cx={sx(iv.center)}
              cy={rowY(i)}
              r={3}
              fill={hit ? "#16a34a" : "#dc2626"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.05 }}
            />
          </g>
        );
      })}
    </svg>
  );
}
