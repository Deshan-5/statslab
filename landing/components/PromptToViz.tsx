"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const W = 360, H = 240, PAD = 24;
const BINS = 22;

function sampleSkewed() {
  return -Math.log(Math.random()) - Math.log(Math.random());
}

function generateMeans(n: number, draws = 1500) {
  const means: number[] = [];
  for (let i = 0; i < draws; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += sampleSkewed();
    means.push(s / n);
  }
  return means;
}

function histogram(values: number[], bins: number, range: [number, number]) {
  const [lo, hi] = range;
  const w = (hi - lo) / bins;
  const counts = Array(bins).fill(0);
  for (const v of values) {
    if (v < lo || v >= hi) continue;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)));
    counts[idx] += 1;
  }
  return counts;
}

const TOOL = "/app?tool=central-limit-theorem";

export default function PromptToViz() {
  const [n, setN] = useState(8);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeed((s) => s + 1), 1800);
    return () => clearInterval(id);
  }, []);

  const means = useMemo(() => generateMeans(n), [n, seed]);
  const counts = histogram(means, BINS, [0, 6]);
  const max = Math.max(1, ...counts);
  const barW = (W - 2 * PAD) / BINS;
  const meanOfMeans = means.reduce((a, b) => a + b, 0) / means.length;
  const sx = (v: number) => PAD + (v / 6) * (W - 2 * PAD);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <Link
          href={TOOL}
          className="block group cursor-pointer"
          aria-label="Open Central Limit Theorem in Stats Lab"
        >
          <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-[1.1] text-neutral-900 group-hover:opacity-90">
            From data to visualizations,
            <br className="hidden md:block" /> in seconds.
          </h2>
          <div className="mt-8 rounded-xl bg-neutral-50 border border-neutral-200 p-6 font-mono text-[13px] leading-relaxed text-neutral-700 shadow-sm group-hover:border-neutral-300 transition-colors">
            <span className="text-neutral-400">{">"} </span>
            Visualize the Central Limit Theorem. Sample from a skewed distribution, plot the
            sampling distribution of the mean, and add a slider for sample size <em>n</em>.
          </div>
        </Link>

        <Link
          href={TOOL}
          className="block rounded-3xl border border-neutral-200 bg-white p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          aria-label="Open Central Limit Theorem in Stats Lab"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Sampling distribution of x̄
            </div>
            <div className="text-xs text-neutral-500 font-mono">x̄̄ = {meanOfMeans.toFixed(3)}</div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto pointer-events-none">
            <line x1={PAD} y1={H - PAD - 18} x2={W - PAD} y2={H - PAD - 18} stroke="#e5e5e5" />
            {counts.map((c, i) => {
              const h = (c / max) * (H - 2 * PAD - 30);
              return (
                <rect
                  key={i}
                  x={PAD + i * barW + 0.5}
                  y={H - PAD - 18 - h}
                  width={barW - 1}
                  height={h}
                  fill="#171717"
                  fillOpacity={0.85}
                  rx={1.5}
                  style={{ transition: "y 0.18s ease, height 0.18s ease" }}
                />
              );
            })}
            <line x1={sx(meanOfMeans)} y1={PAD} x2={sx(meanOfMeans)} y2={H - PAD - 18}
                  stroke="#fb923c" strokeWidth={1.6} strokeDasharray="4 4" />
            {[0, 1, 2, 3, 4, 5, 6].map((tk) => (
              <text key={tk} x={sx(tk)} y={H - PAD} textAnchor="middle" fontSize="10" fill="#a3a3a3">{tk}</text>
            ))}
          </svg>

          <div
            className="mt-5"
            onClick={stop}
            onPointerDown={stop}
            onPointerUp={stop}
            onMouseDown={stop}
            onMouseUp={stop}
            onTouchStart={stop}
            onKeyDown={stop}
          >
            <label htmlFor="n-range" className="flex items-center justify-between text-sm">
              <span className="text-neutral-700">
                Sample size <span className="font-mono">n</span>
              </span>
              <span className="font-mono text-neutral-900">{n}</span>
            </label>
            <input
              id="n-range"
              type="range"
              min={1}
              max={100}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              aria-label="Sample size"
              className="mt-2 w-full accent-neutral-900"
              onClick={stop}
            />
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-400 mt-1 font-mono">
              <span>1</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
