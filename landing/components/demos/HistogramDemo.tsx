"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const W = 320, H = 200, PAD = 16;
const BINS = 12;

function targetHeights(t: number) {
  // Two slowly drifting normal-ish bumps.
  const xs = Array.from({ length: BINS }, (_, i) => -3 + (6 * i) / (BINS - 1));
  return xs.map((x) => {
    const a = Math.exp(-((x + 1.2 + Math.sin(t) * 0.6) ** 2) / 1.2);
    const b = 0.7 * Math.exp(-((x - 1 - Math.cos(t * 0.7) * 0.6) ** 2) / 1.0);
    return a + b;
  });
}

export default function HistogramDemo() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((s) => s + 0.5), 700);
    return () => clearInterval(id);
  }, []);

  const heights = targetHeights(t);
  const max = Math.max(...heights);
  const barW = (W - 2 * PAD) / BINS;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      {heights.map((h, i) => {
        const barH = (h / max) * (H - 2 * PAD - 6);
        return (
          <motion.rect
            key={i}
            x={PAD + i * barW + 1.5}
            width={barW - 3}
            initial={false}
            animate={{ y: H - PAD - barH, height: barH }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
            fill="var(--chart-ink)"
            fillOpacity={0.85}
            rx={2}
          />
        );
      })}
    </svg>
  );
}
