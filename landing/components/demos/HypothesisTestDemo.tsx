"use client";

import { useEffect, useState } from "react";

const W = 320, H = 200, PAD = 18;
const CRIT = 1.96;

function curvePath() {
  const xs = Array.from({ length: 100 }, (_, i) => -3.5 + (7 * i) / 99);
  const ys = xs.map((x) => Math.exp(-(x * x) / 2));
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + ((x + 3.5) / 7) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  return {
    line: xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" "),
    rejArea: (() => {
      // Right rejection region polygon
      const right = xs.filter((x) => x >= CRIT);
      const rys = right.map((x) => Math.exp(-(x * x) / 2));
      let d = `M${px(CRIT)},${H - PAD}`;
      right.forEach((x, i) => { d += ` L${px(x).toFixed(2)},${py(rys[i]).toFixed(2)}`; });
      d += ` L${px(right[right.length - 1])},${H - PAD} Z`;
      return d;
    })(),
    rejAreaLeft: (() => {
      const left = xs.filter((x) => x <= -CRIT);
      const lys = left.map((x) => Math.exp(-(x * x) / 2));
      let d = `M${px(left[0])},${H - PAD}`;
      left.forEach((x, i) => { d += ` L${px(x).toFixed(2)},${py(lys[i]).toFixed(2)}`; });
      d += ` L${px(-CRIT)},${H - PAD} Z`;
      return d;
    })(),
    px,
    py,
  };
}

export default function HypothesisTestDemo() {
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

  const { line, rejArea, rejAreaLeft, px, py } = curvePath();
  // Observed statistic oscillates between rejecting and not rejecting.
  const obs = Math.sin(t * 0.6) * 2.6;
  const obsPx = px(obs);
  const obsPy = py(Math.exp(-(obs * obs) / 2));
  const inReject = Math.abs(obs) >= CRIT;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
      <path d={rejArea} fill="#dc2626" fillOpacity={0.12} />
      <path d={rejAreaLeft} fill="#dc2626" fillOpacity={0.12} />
      <path d={line} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
      <line x1={px(CRIT)} y1={PAD} x2={px(CRIT)} y2={H - PAD} stroke="#dc2626" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={px(-CRIT)} y1={PAD} x2={px(-CRIT)} y2={H - PAD} stroke="#dc2626" strokeWidth={1} strokeDasharray="3 3" />

      <line x1={obsPx} y1={H - PAD} x2={obsPx} y2={obsPy} stroke={inReject ? "#dc2626" : "#16a34a"} strokeWidth={2} />
      <circle cx={obsPx} cy={obsPy} r={4.5} fill={inReject ? "#dc2626" : "#16a34a"} stroke="#fff" strokeWidth={2} />

      <text x={PAD} y={20} fontSize="10" fill="#737373">
        z = {obs.toFixed(2)}   {inReject ? "reject H₀" : "fail to reject"}
      </text>
    </svg>
  );
}
