"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const W = 320, H = 200;

const NODES = [
  { id: 0, x: W / 2, y: 50,  label: "A" },
  { id: 1, x: 70,    y: 150, label: "B" },
  { id: 2, x: W - 70, y: 150, label: "C" },
];

// Edges between every directed pair (excluding self-loops).
const EDGES: { from: number; to: number }[] = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) EDGES.push({ from: i, to: j });

// Simple stochastic matrix
const P = [
  [0.0, 0.6, 0.4],
  [0.5, 0.0, 0.5],
  [0.4, 0.6, 0.0],
];

export default function MarkovChainDemo() {
  const [state, setState] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => {
        const r = Math.random();
        let acc = 0;
        for (let j = 0; j < 3; j++) {
          acc += P[s][j];
          if (r < acc) return j;
        }
        return s;
      });
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Edges */}
      {EDGES.map(({ from, to }) => {
        const a = NODES[from], b = NODES[to];
        // Curve control point offset perpendicular to edge so opposite arrows don't overlap
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = -dy / len, oy = dx / len;
        const offset = 14;
        const cx = (a.x + b.x) / 2 + ox * offset;
        const cy = (a.y + b.y) / 2 + oy * offset;

        const active = state === from;

        return (
          <g key={`${from}-${to}`}>
            <path
              d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`}
              stroke={active ? "#fb923c" : "#d4d4d4"}
              strokeWidth={active ? 1.8 : 1}
              fill="none"
              opacity={active ? 1 : 0.6}
              strokeDasharray={active ? "0" : "3 3"}
              style={{ transition: "all 0.25s ease" }}
            />
          </g>
        );
      })}
      {/* Nodes */}
      {NODES.map((n) => {
        const active = state === n.id;
        return (
          <g key={n.id}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={26}
              fill={active ? "#171717" : "#ffffff"}
              stroke={active ? "#171717" : "#d4d4d4"}
              strokeWidth={1.5}
              animate={{ scale: active ? 1.05 : 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            />
            <text
              x={n.x}
              y={n.y + 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight={600}
              fill={active ? "#ffffff" : "#171717"}
            >
              {n.label}
            </text>
          </g>
        );
      })}
      <text x={16} y={20} fontSize="10" fill="#737373">
        current state: {NODES[state].label}
      </text>
    </svg>
  );
}
