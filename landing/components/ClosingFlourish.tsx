"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";

const W = 480, H = 360;
const N_POINTS = 70;

function makePoints(): { x: number; y: number; z: number; cluster: number }[] {
  const out: { x: number; y: number; z: number; cluster: number }[] = [];
  let seed = 7;
  const rng = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < N_POINTS; i++) {
    const t = i / N_POINTS;
    const cluster = Math.floor(rng() * 3);
    const cx = cluster === 0 ? -0.7 : cluster === 1 ? 0.7 : 0;
    const cy = cluster === 0 ? -0.4 : cluster === 1 ? 0.4 : 0.1;
    const cz = cluster === 0 ? 0.3 : cluster === 1 ? -0.3 : 0.7;
    const jitter = () => (rng() - 0.5) * 0.55;
    out.push({
      x: cx + jitter(),
      y: cy + jitter(),
      z: cz + jitter() + 0.4 * Math.sin(t * Math.PI * 2),
      cluster,
    });
  }
  return out;
}

const POINTS = makePoints();
const CLUSTER_COLORS = ["#171717", "#fb923c", "#737373"];

export default function ClosingFlourish() {
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0.25);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!draggingRef.current) setYaw((y) => y + dt * 0.35);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const project = (p: { x: number; y: number; z: number }) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let x = p.x * cy + p.z * sy;
    let z = -p.x * sy + p.z * cy;
    let y = p.y * cp - z * sp;
    z = p.y * sp + z * cp;
    const scale = 100;
    return { sx: W / 2 + x * scale, sy: H / 2 + y * scale, depth: z };
  };

  const projected = POINTS.map((p, i) => ({ p, i, ...project(p) }))
    .sort((a, b) => a.depth - b.depth);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32 text-center">
      <p className="text-sm text-neutral-500 mb-6">
        PCA projection. Try dragging to rotate!
      </p>

      <Link
        href="/app"
        className="mx-auto max-w-2xl block rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        aria-label="Open Stats Lab"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "none" }}
          aria-label="Interactive 3D PCA projection. Drag to rotate."
          role="img"
          onClick={stop}
          onPointerDown={(e) => {
            stop(e);
            draggingRef.current = true;
            lastRef.current = { x: e.clientX, y: e.clientY };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            stop(e);
            if (!draggingRef.current) return;
            const dx = e.clientX - lastRef.current.x;
            const dy = e.clientY - lastRef.current.y;
            lastRef.current = { x: e.clientX, y: e.clientY };
            setYaw((v) => v + dx * 0.01);
            setPitch((v) => Math.max(-1.2, Math.min(1.2, v + dy * 0.01)));
          }}
          onPointerUp={(e) => { stop(e); draggingRef.current = false; }}
          onPointerCancel={(e) => { stop(e); draggingRef.current = false; }}
          onPointerLeave={(e) => { stop(e); draggingRef.current = false; }}
        >
          {(() => {
            const o = project({ x: 0, y: 0, z: 0 });
            const ax = project({ x: 1.4, y: 0, z: 0 });
            const ay = project({ x: 0, y: 1.4, z: 0 });
            const az = project({ x: 0, y: 0, z: 1.4 });
            return (
              <g opacity={0.45}>
                <line x1={o.sx} y1={o.sy} x2={ax.sx} y2={ax.sy} stroke="#d4d4d4" />
                <line x1={o.sx} y1={o.sy} x2={ay.sx} y2={ay.sy} stroke="#d4d4d4" />
                <line x1={o.sx} y1={o.sy} x2={az.sx} y2={az.sy} stroke="#d4d4d4" />
              </g>
            );
          })()}

          {projected.map(({ p, i, sx, sy, depth }) => {
            const tFront = (depth + 1.5) / 3;
            const r = 3 + tFront * 3.5;
            const opacity = 0.35 + tFront * 0.6;
            return (
              <circle
                key={i}
                cx={sx}
                cy={sy}
                r={r}
                fill={CLUSTER_COLORS[p.cluster]}
                opacity={opacity}
              />
            );
          })}
        </svg>
      </Link>

      <h2 className="mt-14 font-medium tracking-tightest text-5xl md:text-6xl leading-[1.05] text-neutral-900">
        Drop your data. Explore the tools.
      </h2>
      <p className="mt-5 text-lg text-neutral-600 max-w-xl mx-auto">
        Twenty-plus statistics tools, every one of them ready the moment your
        CSV lands.
      </p>

      <Link
        href="/app"
        className="mt-10 inline-flex items-center rounded-full bg-neutral-900 text-white px-8 py-3 text-base font-medium hover:bg-neutral-800 transition-colors"
      >
        Open the lab
      </Link>
    </section>
  );
}
