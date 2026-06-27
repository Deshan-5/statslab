"use client";

/**
 * Flowing graph background for the landing hero.
 *
 * - Faint static graph-paper grid (48px squares).
 * - Two smooth sine-mixed curves drifting across, different phases / amplitudes.
 * - Sparse scatter dots that breathe slowly via Lissajous offsets.
 * - No cursor input. Pure time-based animation, ~60fps.
 * - Theme-aware: re-reads `.dark` on <html> each frame.
 * - prefers-reduced-motion: single static frame.
 */
import { useEffect, useRef } from "react";

const GRID = 48;
const N_DOTS = 26;

type Dot = { ax: number; ay: number; phaseX: number; phaseY: number; freq: number; r: number };

export default function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;
    let dots: Dot[] = [];

    function rngFor(seed: number) {
      let s = seed | 0;
      return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function makeDots() {
      const rng = rngFor(7);
      dots = [];
      for (let i = 0; i < N_DOTS; i++) {
        dots.push({
          ax: rng() * W,
          ay: rng() * H,
          phaseX: rng() * Math.PI * 2,
          phaseY: rng() * Math.PI * 2,
          freq: 0.18 + rng() * 0.22,
          r: 1.2 + rng() * 1.6,
        });
      }
    }

    const resize = () => {
      const r = parent.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      makeDots();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function isDark() {
      return document.documentElement.classList.contains("dark");
    }

    function curvePath(t: number, amp: number, freq: number, phase: number, yCenter: number, samples = 80) {
      const pts: string[] = [];
      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const k = (x / W) * Math.PI * 4;
        const y =
          yCenter +
          amp * Math.sin(k * freq + phase + t) +
          amp * 0.5 * Math.sin(k * freq * 2.3 + phase * 0.7 + t * 0.7);
        pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return pts.join(" ");
    }

    let raf = 0;
    let last = performance.now();
    const start = last;

    const tick = () => {
      last = performance.now();
      const t = (last - start) / 1000;
      const dark = isDark();

      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();

      // Two flowing curves, different amplitude / phase / center.
      const curveColor = dark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.18)";
      drawCurve(curvePath(t * 0.6, H * 0.13, 1.0, 0,    H * 0.55), curveColor, 1.4);
      drawCurve(curvePath(t * 0.4, H * 0.10, 1.4, 1.6,  H * 0.40), curveColor, 1.1);
      // One bolder accent curve in orange, very faint
      drawCurve(
        curvePath(t * 0.5, H * 0.08, 1.2, 0.8, H * 0.62),
        "rgba(251,146,60,0.35)",
        1.6,
      );

      // Drifting dots (Lissajous offsets from anchor)
      for (const d of dots) {
        const offsetX = 12 * Math.sin(t * d.freq + d.phaseX);
        const offsetY = 10 * Math.sin(t * d.freq * 1.3 + d.phaseY);
        const cx = d.ax + offsetX;
        const cy = d.ay + offsetY;
        ctx.fillStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.16)";
        ctx.beginPath();
        ctx.arc(cx, cy, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    function drawCurve(d: string, stroke: string, width: number) {
      const path = new Path2D(d);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.stroke(path);
    }

    if (reduced) {
      tick();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 pointer-events-none"
    />
  );
}
