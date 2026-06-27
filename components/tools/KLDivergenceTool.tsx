"use client";

import { useMemo, useRef, useState } from "react";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import {
  RotateCcw,
  Sparkles,
  Target,
  Flame,
  Split,
  Info,
  Gauge,
  Brain,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function normPdf(x: number, m: number, s: number) {
  return (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - m) / s, 2));
}

function gaussianKL(aMean: number, aStd: number, bMean: number, bStd: number) {
  const aVar = aStd * aStd;
  const bVar = bStd * bStd;

  return Math.log(bStd / aStd) + (aVar + Math.pow(aMean - bMean, 2)) / (2 * bVar) - 0.5;
}

function gaussianCrossEntropy(aMean: number, aStd: number, bMean: number, bStd: number) {
  const bVar = bStd * bStd;
  const aVar = aStd * aStd;

  return 0.5 * Math.log(2 * Math.PI * bVar) + (aVar + Math.pow(aMean - bMean, 2)) / (2 * bVar);
}

function gaussianEntropy(std: number) {
  return 0.5 * Math.log(2 * Math.PI * Math.E * std * std);
}

type KLMode = "P_Q" | "Q_P";
type PresetType = "Perfect" | "MeanShift" | "TooWide" | "TooNarrow" | "Collapse";

interface CurvePoint {
  x: number;
  p: number;
  q: number;
  localPQ: number;
  localQP: number;
}

export default function KLDivergenceTool() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pMean = 0;
  const pStd = 1.0;

  const [qMean, setQMean] = useState(2.0);
  const [qStd, setQStd] = useState(1.5);
  const [mode, setMode] = useState<KLMode>("P_Q");
  const [showSurprise, setShowSurprise] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 520;
  const H = 320;
  const PAD = 28;
  const X_RANGE = 6;
  const Y_MAX = 0.52;

  const sx = (x: number) => PAD + ((x + X_RANGE) / (2 * X_RANGE)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / Y_MAX) * (H - PAD * 2);

  const pts = useMemo<CurvePoint[]>(() => {
    const arr: CurvePoint[] = [];

    for (let i = 0; i <= 260; i++) {
      const x = -6 + (i / 260) * 12;
      const p = normPdf(x, pMean, pStd);
      const q = normPdf(x, qMean, qStd);

      const safeP = Math.max(p, 1e-12);
      const safeQ = Math.max(q, 1e-12);

      arr.push({
        x,
        p,
        q,
        localPQ: Math.max(0, safeP * Math.log(safeP / safeQ)),
        localQP: Math.max(0, safeQ * Math.log(safeQ / safeP)),
      });
    }

    return arr;
  }, [qMean, qStd]);

  useRegisterToolState("kl-divergence", { qMean, qStd, mode, showSurprise }, { qMean: setQMean, qStd: setQStd, mode: setMode, showSurprise: setShowSurprise });
  const metrics = useMemo(() => {
    const klPQ = gaussianKL(pMean, pStd, qMean, qStd);
    const klQP = gaussianKL(qMean, qStd, pMean, pStd);

    const activeKL = mode === "P_Q" ? klPQ : klQP;

    const crossEntPQ = gaussianCrossEntropy(pMean, pStd, qMean, qStd);
    const crossEntQP = gaussianCrossEntropy(qMean, qStd, pMean, pStd);

    const entropyP = gaussianEntropy(pStd);
    const entropyQ = gaussianEntropy(qStd);

    return {
      klPQ,
      klQP,
      activeKL,
      crossEnt: mode === "P_Q" ? crossEntPQ : crossEntQP,
      entropyBase: mode === "P_Q" ? entropyP : entropyQ,
    };
  }, [qMean, qStd, mode]);

  const toArea = (kind: "p" | "q") => {
    const top = pts
      .map((d, i) => `${i === 0 ? "M" : "L"} ${sx(d.x)} ${sy(kind === "p" ? d.p : d.q)}`)
      .join(" ");

    return `${top} L ${sx(pts[pts.length - 1].x)} ${H - PAD} L ${sx(pts[0].x)} ${H - PAD} Z`;
  };

  const toLine = (kind: "p" | "q") => {
    return pts
      .map((d, i) => `${i === 0 ? "M" : "L"} ${sx(d.x)} ${sy(kind === "p" ? d.p : d.q)}`)
      .join(" ");
  };

  const maxLocal = useMemo(() => {
    const vals = pts.map((d) => (mode === "P_Q" ? d.localPQ : d.localQP));
    return Math.max(1e-8, ...vals);
  }, [pts, mode]);

  const surpriseBars = useMemo(() => {
    return pts.filter((_, i) => i % 3 === 0);
  }, [pts]);

  const hoverPoint = hoverIndex === null ? null : pts[hoverIndex];

  const setPreset = (type: PresetType) => {
    if (type === "Perfect") {
      setQMean(0);
      setQStd(1);
    }

    if (type === "MeanShift") {
      setQMean(2);
      setQStd(1);
    }

    if (type === "TooWide") {
      setQMean(0);
      setQStd(2.4);
    }

    if (type === "TooNarrow") {
      setQMean(0);
      setQStd(0.45);
    }

    if (type === "Collapse") {
      setQMean(1.2);
      setQStd(0.32);
    }
  };

  const reset = () => {
    setQMean(2);
    setQStd(1.5);
    setMode("P_Q");
    setShowSurprise(true);
    setHoverIndex(null);
  };

  const getStatusMessage = () => {
    if (metrics.activeKL < 0.01) {
      return "Perfect match — the model distribution Q explains the target distribution almost exactly.";
    }

    if (Math.abs(qMean - pMean) > 1.5) {
      return "Mean shift — Q is placing probability in the wrong region, so it pays a heavy surprise penalty.";
    }

    if (qStd > pStd * 1.8) {
      return "Too uncertain — Q spreads probability too widely. It is safer, but less sharp.";
    }

    if (qStd < pStd * 0.65) {
      return "Overconfident — Q is too narrow and misses important tail regions. KL punishes this strongly.";
    }

    return "Close but not perfect — Q roughly follows P, but still wastes information compared with the true distribution.";
  };

  const getSeverity = () => {
    if (metrics.activeKL < 0.05) return { label: "Excellent", color: "text-emerald-500", icon: Target };
    if (metrics.activeKL < 0.5) return { label: "Good", color: "text-cyan-500", icon: Gauge };
    if (metrics.activeKL < 1.5) return { label: "Mismatch", color: "text-orange-500", icon: Split };
    return { label: "High Surprise", color: "text-red-500", icon: Flame };
  };

  const severity = getSeverity();
  const SeverityIcon = severity.icon;

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, px / rect.width));
    const x = -X_RANGE + ratio * 2 * X_RANGE;

    let best = 0;
    let bestDist = Infinity;

    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - x);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }

    setHoverIndex(best);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
        <Panel className="relative overflow-hidden group">

          <div className="relative flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-500" />
                <span className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold">
                  KL Divergence Lab
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Watch where the model distribution becomes surprised by the true distribution.
              </p>
            </div>

            <div className={`flex items-center gap-1.5 text-xs font-bold ${severity.color}`}>
              <SeverityIcon className="w-4 h-4" />
              {severity.label}
            </div>
          </div>

          <div className="relative w-full h-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              className="relative w-full h-auto bg-white/70 dark:bg-[#08080b] rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-[inset_0_0_20px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] cursor-crosshair"
            >
              <defs>
                <filter id="kl-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="kl-glow-subtle" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                <linearGradient id="kl-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.02" />
                </linearGradient>

                <linearGradient id="p-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="q-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                </linearGradient>
                
                <linearGradient id="penalty-pq-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="penalty-qp-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              <rect x={0} y={0} width={W} height={H} fill="url(#kl-bg)" />

              {[...Array(7)].map((_, i) => {
                const x = PAD + (i / 6) * (W - PAD * 2);
                return (
                  <line
                    key={`gx-${i}`}
                    x1={x}
                    y1={PAD}
                    x2={x}
                    y2={H - PAD}
                    stroke="currentColor"
                    className="text-neutral-200 dark:text-neutral-800"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                );
              })}

              {[...Array(5)].map((_, i) => {
                const y = PAD + (i / 4) * (H - PAD * 2);
                return (
                  <line
                    key={`gy-${i}`}
                    x1={PAD}
                    y1={y}
                    x2={W - PAD}
                    y2={y}
                    stroke="currentColor"
                    className="text-neutral-200 dark:text-neutral-800"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                );
              })}

              <line
                x1={PAD}
                y1={H - PAD}
                x2={W - PAD}
                y2={H - PAD}
                stroke="currentColor"
                className="text-neutral-300 dark:text-neutral-700"
                strokeWidth={1.2}
              />
              <line
                x1={sx(0)}
                y1={PAD}
                x2={sx(0)}
                y2={H - PAD}
                stroke="currentColor"
                className="text-neutral-300 dark:text-neutral-700"
                strokeWidth={1.2}
              />

              <AnimatePresence>
                {showSurprise &&
                  surpriseBars.map((d, i) => {
                    const local = mode === "P_Q" ? d.localPQ : d.localQP;
                    const alpha = Math.min(0.72, local / maxLocal);
                    const topY = sy(Math.max(d.p, d.q));
                    const height = H - PAD - topY;

                    if (alpha < 0.03) return null;

                    return (
                      <motion.rect
                        key={`surprise-${i}`}
                        initial={{ opacity: 0, height: 0, y: H - PAD }}
                        animate={{
                          opacity: alpha,
                          height: Math.max(1, height),
                          y: topY,
                        }}
                        exit={{ opacity: 0, height: 0, y: H - PAD }}
                        transition={{
                          type: "spring",
                          stiffness: 120,
                          damping: 15,
                          mass: 1,
                        }}
                        x={sx(d.x) - 1.2}
                        width={2.4}
                        fill={mode === "P_Q" ? "url(#penalty-pq-grad)" : "url(#penalty-qp-grad)"}
                        rx={1}
                        filter="url(#kl-glow-subtle)"
                      />
                    );
                  })}
              </AnimatePresence>

              <motion.path
                d={toArea("q")}
                fill="url(#q-grad)"
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />
              <motion.path
                d={toLine("q")}
                fill="none"
                stroke="currentColor"
                className="text-orange-500 dark:text-orange-400"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#kl-glow)"
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />

              <motion.path
                d={toArea("p")}
                fill="url(#p-grad)"
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />
              <motion.path
                d={toLine("p")}
                fill="none"
                stroke="currentColor"
                className="text-blue-500 dark:text-blue-400"
                strokeWidth={3}
                strokeDasharray="6 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#kl-glow-subtle)"
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />

              {hoverPoint && (
                <>
                  <line
                    x1={sx(hoverPoint.x)}
                    y1={PAD}
                    x2={sx(hoverPoint.x)}
                    y2={H - PAD}
                    stroke="#22d3ee"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.8}
                  />
                    <motion.circle
                      cx={sx(hoverPoint.x)}
                      cy={sy(hoverPoint.p)}
                      r={5}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={2}
                      layout
                      filter="url(#kl-glow-subtle)"
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    />
                    <motion.circle
                      cx={sx(hoverPoint.x)}
                      cy={sy(hoverPoint.q)}
                      r={5}
                      fill="#f97316"
                      stroke="#ffffff"
                      strokeWidth={2}
                      layout
                      filter="url(#kl-glow-subtle)"
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    />
                </>
              )}

              <text x={PAD} y={H - 8} fill="currentColor" className="text-neutral-400 font-mono" fontSize={10}>
                -6
              </text>
              <text x={sx(0) - 4} y={H - 8} fill="currentColor" className="text-neutral-400 font-mono" fontSize={10}>
                0
              </text>
              <text x={W - PAD - 10} y={H - 8} fill="currentColor" className="text-neutral-400 font-mono" fontSize={10}>
                6
              </text>
            </svg>

            <AnimatePresence>
              {hoverPoint && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute pointer-events-none rounded-xl bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border border-neutral-200 dark:border-slate-800 shadow-2xl p-3 z-10 w-44"
                  style={{
                    left: `${Math.min(100 - (185 / W) * 100, (sx(hoverPoint.x) / W) * 100 + 2)}%`,
                    top: `${(PAD / H) * 100}%`,
                  }}
                >
                  <div className="text-xs font-bold text-neutral-800 dark:text-slate-200 mb-1.5 font-mono">
                    x = {hoverPoint.x.toFixed(2)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                    <span className="text-blue-600 dark:text-blue-400">P(x):</span>
                    <span className="text-blue-700 dark:text-blue-300 text-right font-mono">{hoverPoint.p.toFixed(4)}</span>
                    <span className="text-orange-600 dark:text-orange-400">Q(x):</span>
                    <span className="text-orange-700 dark:text-orange-300 text-right font-mono">{hoverPoint.q.toFixed(4)}</span>
                    <span className="col-span-2 border-t border-neutral-200 dark:border-slate-700/50 my-0.5"></span>
                    <span className={mode === "P_Q" ? "text-red-600 dark:text-red-400" : "text-purple-600 dark:text-purple-400"}>Penalty:</span>
                    <span className={`text-right font-mono ${mode === "P_Q" ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300"}`}>
                      {(mode === "P_Q" ? hoverPoint.localPQ : hoverPoint.localQP).toFixed(4)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-3 mt-4 text-xs">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
              <span className="w-4 h-0.5 bg-blue-500 inline-block border-dashed" />
              P Target / True
            </div>
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-semibold">
              <span className="w-4 h-0.5 bg-orange-500 inline-block" />
              Q Model / Approx
            </div>
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
              <span className="w-3 h-3 rounded-sm bg-red-500/60 inline-block" />
              Surprise Heat
            </div>
          </div>
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold">
            <Info className="w-4 h-4 text-cyan-500" />
            Live Interpretation
          </div>

          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-200 dark:border-cyan-800/40 p-4 text-sm text-cyan-800 dark:text-cyan-200 leading-relaxed shadow-sm transition-colors duration-300">
            {getStatusMessage()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 hover:border-cyan-300 dark:hover:border-cyan-800/80 transition-colors duration-300">
              <div className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold">Current Direction</div>
              <div className="mt-1 font-mono text-lg font-bold text-neutral-900 dark:text-white">
                {mode === "P_Q" ? "KL(P || Q)" : "KL(Q || P)"}
              </div>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                {mode === "P_Q" ? "Punishes Q for missing P." : "Punishes Q for placing mass outside P."}
              </p>
            </div>

            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 hover:border-indigo-300 dark:hover:border-indigo-800/80 transition-colors duration-300">
              <div className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold">AI Meaning</div>
              <div className="mt-1 font-semibold text-neutral-900 dark:text-white">Model mismatch</div>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                In ML, Q is the model&apos;s belief. Lower KL means Q is closer to the real pattern.
              </p>
            </div>

            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 hover:border-purple-300 dark:hover:border-purple-800/80 transition-colors duration-300">
              <div className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold">Cross Entropy</div>
              <div className="mt-1 font-semibold text-neutral-900 dark:text-white">H + KL</div>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                Training with cross-entropy is secretly pushing KL divergence down.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel className="space-y-6">
          <div className="flex gap-2">
            <Btn primary onClick={() => setPreset("Perfect")} className="flex-1 flex items-center justify-center gap-1.5 shadow-sm">
              <Target className="w-4 h-4" />
              Match
            </Btn>

            <Btn onClick={reset} className="flex items-center justify-center gap-1.5 shadow-sm">
              <RotateCcw className="w-4 h-4" />
              Reset
            </Btn>
          </div>

          <div className="rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30 p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Test Scenarios
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPreset("MeanShift")}
                className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:border-purple-300 dark:hover:border-purple-700 transition-all shadow-sm"
              >
                Mean Shift
              </button>
              <button
                onClick={() => setPreset("TooWide")}
                className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:border-purple-300 dark:hover:border-purple-700 transition-all shadow-sm"
              >
                Too Wide
              </button>
              <button
                onClick={() => setPreset("TooNarrow")}
                className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:border-purple-300 dark:hover:border-purple-700 transition-all shadow-sm"
              >
                Too Narrow
              </button>
              <button
                onClick={() => setPreset("Collapse")}
                className="rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-900/40 hover:border-red-300 dark:hover:border-red-700 transition-all shadow-sm text-red-600 dark:text-red-400"
              >
                Mode Collapse
              </button>
            </div>
          </div>

          <Field label="KL Direction" value={mode === "P_Q" ? "P || Q" : "Q || P"}>
            <div className="grid grid-cols-2 gap-2 relative">
              <button
                onClick={() => setMode("P_Q")}
                className={`relative z-10 rounded-lg border px-2 py-2 text-xs font-bold transition-colors duration-300 ${mode === "P_Q"
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  }`}
              >
                KL(P || Q)
              </button>
              <button
                onClick={() => setMode("Q_P")}
                className={`relative z-10 rounded-lg border px-2 py-2 text-xs font-bold transition-colors duration-300 ${mode === "Q_P"
                  ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  }`}
              >
                KL(Q || P)
              </button>
            </div>
          </Field>

          <Field label={`Q Mean μ: ${qMean.toFixed(1)}`} value="">
            <input
              type="range"
              min={-4}
              max={4}
              step={0.1}
              value={qMean}
              onChange={(e) => setQMean(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </Field>

          <Field label={`Q Std Dev σ: ${qStd.toFixed(2)}`} value="">
            <input
              type="range"
              min={0.25}
              max={3.2}
              step={0.05}
              value={qStd}
              onChange={(e) => setQStd(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </Field>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 text-xs cursor-pointer hover:border-red-300 dark:hover:border-red-800 transition-colors">
            <span>
              <span className="font-bold text-neutral-800 dark:text-neutral-200">Surprise Heat</span>
              <span className="block text-neutral-500 dark:text-neutral-400 mt-0.5">Shows where KL is coming from.</span>
            </span>
            <input
              type="checkbox"
              checked={showSurprise}
              onChange={(e) => setShowSurprise(e.target.checked)}
              className="accent-red-500 w-4 h-4 rounded"
            />
          </label>

          <div className="space-y-4">
            <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold border-b border-neutral-100 dark:border-neutral-800 pb-2">
              Information Metrics
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {mode === "P_Q" ? "KL(P||Q)" : "KL(Q||P)"}
                  </span>
                  <motion.span 
                    key={metrics.activeKL}
                    initial={{ opacity: 0.5, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-mono bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 rounded"
                  >
                    {metrics.activeKL.toFixed(4)}
                  </motion.span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    initial={false}
                    animate={{ width: `${Math.min(100, (metrics.activeKL / 3) * 100)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 15 }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Cross Entropy</span>
                  <motion.span 
                    key={metrics.crossEnt}
                    initial={{ opacity: 0.5, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-mono bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 rounded"
                  >
                    {metrics.crossEnt.toFixed(4)}
                  </motion.span>
                </div>
                <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 dark:from-indigo-500 dark:to-indigo-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                    initial={false}
                    animate={{ width: `${Math.min(100, (metrics.crossEnt / 4) * 100)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 15 }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-xs pt-2 border-t border-neutral-100 dark:border-neutral-800 text-neutral-500">
                <span className="font-bold flex items-center gap-1.5">
                  Base Entropy
                </span>
                <span className="font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 rounded">
                  {metrics.entropyBase.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed shadow-sm">
            <div className="font-bold text-neutral-700 dark:text-neutral-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-cyan-500" />
              Plain English
            </div>
            <p>
              <strong>KL divergence</strong> measures extra surprise. If Q perfectly matches P,
              the value becomes exactly 0.
            </p>
            <p>
              It is not symmetric. <strong>KL(P||Q)</strong> and <strong>KL(Q||P)</strong> can tell
              two different stories depending on which distribution is the true one.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
