"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const W = 320, H = 200;
const N = 6;

function corrColor(v: number) {
  // -1 → red, 0 → neutral, +1 → green
  const r = v < 0 ? 220 + Math.round(35 * (1 + v)) : 240;
  const g = v < 0 ? 40 + Math.round(80 * (1 + v)) : 200 - Math.round(40 * v);
  const b = v < 0 ? 60 + Math.round(80 * (1 + v)) : 120;
  const a = 0.18 + 0.6 * Math.abs(v);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

export default function CorrelationHeatmapDemo() {
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

  const cell = Math.min((W - 32) / N, (H - 32) / N);
  const offX = (W - cell * N) / 2;
  const offY = (H - cell * N) / 2;

  const matrix: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => {
      if (i === j) return 1;
      const phase = (i + j) * 0.5 + (i - j) * 0.3;
      return Math.max(-1, Math.min(1, Math.sin(t * 0.5 + phase)));
    }),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {matrix.map((row, i) =>
        row.map((v, j) => (
          <motion.rect
            key={`${i}-${j}`}
            x={offX + j * cell + 1}
            y={offY + i * cell + 1}
            width={cell - 2}
            height={cell - 2}
            rx={3}
            fill={corrColor(v)}
            stroke="#e5e5e5"
            strokeWidth={0.5}
            animate={{ fill: corrColor(v) }}
            transition={{ duration: 0.4 }}
          />
        )),
      )}
    </svg>
  );
}
