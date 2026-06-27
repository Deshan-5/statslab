"use client";

import { useEffect, useRef, useState } from "react";

const W = 320, H = 200;
const SIZE = 180;
const OFF_X = (W - SIZE) / 2;
const OFF_Y = (H - SIZE) / 2 + 4;

type Pt = { x: number; y: number; inside: boolean };

export default function MonteCarloDemo() {
  const [pts, setPts] = useState<Pt[]>([]);
  const insideRef = useRef(0);
  const totalRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const x = Math.random();
      const y = Math.random();
      const inside = x * x + y * y <= 1;
      insideRef.current += inside ? 1 : 0;
      totalRef.current += 1;
      setPts((prev) => {
        const next = [...prev, { x, y, inside }];
        if (next.length > 220) next.shift();
        return next;
      });
      if (totalRef.current > 600) {
        insideRef.current = 0;
        totalRef.current = 0;
        setPts([]);
      }
    }, 35);
    return () => clearInterval(id);
  }, []);

  const piEst = totalRef.current === 0 ? 0 : (4 * insideRef.current) / totalRef.current;

  const sx = (v: number) => OFF_X + v * SIZE;
  const sy = (v: number) => OFF_Y + (1 - v) * SIZE;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <rect x={OFF_X} y={OFF_Y} width={SIZE} height={SIZE} fill="none" stroke="#e5e5e5" />
      <path
        d={`M${OFF_X},${OFF_Y + SIZE} A${SIZE},${SIZE} 0 0 1 ${OFF_X + SIZE},${OFF_Y}`}
        fill="#fbbf24"
        fillOpacity={0.18}
        stroke="#fbbf24"
        strokeWidth={1.2}
      />
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={1.5}
          fill={p.inside ? "#16a34a" : "#dc2626"} fillOpacity={0.85} />
      ))}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#737373">
        π ≈ {piEst.toFixed(4)}   ({totalRef.current} samples)
      </text>
    </svg>
  );
}
