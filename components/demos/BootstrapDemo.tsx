"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const W = 320, H = 200, PAD = 14;
const ORIG = [3, 7, 4, 8, 2, 9, 5, 6, 4, 7, 3, 8];

function resample() {
  return ORIG.map(() => ORIG[Math.floor(Math.random() * ORIG.length)]);
}

export default function BootstrapDemo() {
  // Server + first client render must be deterministic to avoid hydration mismatch.
  // Start with the original sample mirrored, then begin resampling on mount.
  const [resamples, setResamples] = useState<number[][]>([ORIG, ORIG]);

  useEffect(() => {
    setResamples([resample(), resample()]);
    const id = setInterval(() => {
      setResamples((prev) => [resample(), prev[0]]);
    }, 900);
    return () => clearInterval(id);
  }, []);

  const barW = (W - 2 * PAD) / ORIG.length;

  function row(arr: number[], yTop: number, accent: boolean, label: string, key: string) {
    const max = 10;
    const rowH = 46;
    return (
      <g key={key}>
        <text x={PAD} y={yTop - 3} fontSize="9" fill="#737373" letterSpacing="0.04em">
          {label}
        </text>
        {arr.map((v, i) => {
          const h = (v / max) * rowH;
          return (
            <motion.rect
              key={`${key}-${i}`}
              x={PAD + i * barW + 1}
              width={barW - 2}
              initial={false}
              animate={{ y: yTop + (rowH - h), height: h }}
              transition={{ duration: 0.45, ease: "easeOut", delay: i * 0.02 }}
              fill={accent ? "#fb923c" : "var(--chart-ink)"}
              fillOpacity={accent ? 0.9 : 0.85}
              rx={1.5}
            />
          );
        })}
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {row(ORIG, 18, false, "ORIGINAL SAMPLE", "orig")}
      {row(resamples[0], 84, true, "BOOTSTRAP RESAMPLE", "rs0")}
      {row(resamples[1], 144, false, "PREVIOUS", "rs1")}
    </svg>
  );
}
