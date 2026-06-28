"use client";

import { Fragment } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

// ─── Inline preview components ────────────────────────────────────────────────

// Transformer: attention weight heatmap
function AttentionPreview() {
  const tokens = ["The", "cat", "sat", "on", "mat"];
  const weights = [
    [0.65, 0.12, 0.10, 0.08, 0.05],
    [0.22, 0.55, 0.12, 0.07, 0.04],
    [0.10, 0.25, 0.50, 0.10, 0.05],
    [0.08, 0.12, 0.25, 0.45, 0.10],
    [0.05, 0.08, 0.15, 0.30, 0.42],
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 select-none">
      <p className="text-[9px] font-mono uppercase tracking-widest text-indigo-400/70 mb-4">
        Self-attention weights · Layer 2 · Head 4
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `36px repeat(${tokens.length}, 1fr)`,
          gap: "3px",
          width: "100%",
          maxWidth: 260,
        }}
      >
        <div />
        {tokens.map((t) => (
          <div key={t} className="text-center text-[9px] font-mono text-neutral-500 dark:text-neutral-500 truncate pb-1">
            {t}
          </div>
        ))}
        {tokens.map((rowTok, r) => (
          <Fragment key={r}>
            <div className="flex items-center justify-end pr-1 text-[9px] font-mono text-neutral-500 dark:text-neutral-500">
              {rowTok}
            </div>
            {weights[r].map((w, c) => (
              <div
                key={`${r}-${c}`}
                className="rounded-sm"
                style={{
                  aspectRatio: "1",
                  background: `rgba(99,102,241,${0.07 + w * 0.88})`,
                  boxShadow: w > 0.45 ? `0 0 6px rgba(99,102,241,${w * 0.5})` : undefined,
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-4 flex gap-1.5">
        {["Head 1", "Head 2", "Head 3", "Head 4"].map((h, i) => (
          <span
            key={h}
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-medium ${
              i === 3
                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                : "bg-neutral-100 dark:bg-neutral-800/60 text-neutral-400"
            }`}
          >
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

// Semantic Space: word cluster visualization
function SemanticPreview() {
  // Pre-placed clusters and word dots — no Math.random()
  const clusters = [
    { label: "Royalty", cx: 68, cy: 54, r: 20, color: "#d97706" },
    { label: "Animals", cx: 195, cy: 68, r: 17, color: "#10b981" },
    { label: "Geography", cx: 130, cy: 138, r: 22, color: "#3b82f6" },
  ];
  const dots = [
    { x: 62, y: 48, c: "#d97706" }, { x: 74, y: 58, c: "#d97706" }, { x: 60, y: 64, c: "#d97706" },
    { x: 78, y: 44, c: "#d97706" }, { x: 56, y: 56, c: "#d97706" },
    { x: 190, y: 62, c: "#10b981" }, { x: 200, y: 72, c: "#10b981" }, { x: 186, y: 76, c: "#10b981" },
    { x: 205, y: 60, c: "#10b981" },
    { x: 124, y: 130, c: "#3b82f6" }, { x: 136, y: 122, c: "#3b82f6" }, { x: 142, y: 142, c: "#3b82f6" },
    { x: 120, y: 146, c: "#3b82f6" }, { x: 138, y: 132, c: "#3b82f6" },
  ];
  // Vector arrow: King → Queen direction
  const arrowFrom = { x: 60, y: 64 };
  const arrowTo = { x: 78, y: 44 };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 select-none">
      <p className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/70 mb-3">
        Embedding space (3D projected · 68 words)
      </p>
      <svg viewBox="0 0 265 185" className="w-full max-w-xs h-auto">
        {/* Grid */}
        {[53, 106, 159, 212].map((x) => (
          <line key={`v${x}`} x1={x} y1={8} x2={x} y2={178} stroke="currentColor"
            className="text-neutral-200 dark:text-neutral-800" strokeWidth={0.5} />
        ))}
        {[37, 74, 111, 148].map((y) => (
          <line key={`h${y}`} x1={8} y1={y} x2={258} y2={y} stroke="currentColor"
            className="text-neutral-200 dark:text-neutral-800" strokeWidth={0.5} />
        ))}

        {/* Cluster halos */}
        {clusters.map((c) => (
          <circle key={c.label} cx={c.cx} cy={c.cy} r={c.r + 7}
            fill={c.color} fillOpacity={0.07}
            stroke={c.color} strokeOpacity={0.22} strokeWidth={1} strokeDasharray="3 2" />
        ))}

        {/* Word dots */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={3.2} fill={d.c} fillOpacity={0.85} />
        ))}

        {/* "King − Man + Woman = Queen" arrow */}
        <defs>
          <marker id="aw" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <polygon points="0 0, 5 2.5, 0 5" fill="#d97706" />
          </marker>
        </defs>
        <line x1={arrowFrom.x} y1={arrowFrom.y} x2={arrowTo.x} y2={arrowTo.y}
          stroke="#d97706" strokeWidth={1.5} strokeDasharray="3 2" markerEnd="url(#aw)" />

        {/* Cluster labels */}
        {clusters.map((c) => (
          <text key={c.label} x={c.cx} y={c.cy + c.r + 14} textAnchor="middle"
            fontSize="8" fill={c.color} fontWeight="700" fontFamily="monospace" fillOpacity={0.9}>
            {c.label}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-[9px] font-mono text-neutral-400 dark:text-neutral-600">
        King − Man + Woman{" "}
        <span className="text-emerald-500">→ Queen</span>
      </p>
    </div>
  );
}

// Neural Network: 3D layer warp diagram
function NeuralPreview() {
  const layers: { x: number; ys: number[] }[] = [
    { x: 48, ys: [42, 92, 142] },
    { x: 133, ys: [22, 62, 102, 142] },
    { x: 218, ys: [62, 122] },
  ];
  const layerColors = ["#6366f1", "#8b5cf6", "#a78bfa"];
  // Pre-computed connection opacity values (input→hidden, hidden→output)
  const opI2H = [
    [0.28, 0.14, 0.08, 0.22],
    [0.18, 0.32, 0.20, 0.10],
    [0.08, 0.16, 0.35, 0.26],
  ];
  const opH2O = [
    [0.30, 0.12],
    [0.18, 0.25],
    [0.24, 0.18],
    [0.12, 0.32],
  ];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 select-none">
      <p className="text-[9px] font-mono uppercase tracking-widest text-violet-400/70 mb-3">
        Hidden layer · 3D geometry warp
      </p>
      <svg viewBox="0 0 265 175" className="w-full max-w-xs h-auto">
        {/* Input → Hidden connections */}
        {layers[0].ys.map((y1, i) =>
          layers[1].ys.map((y2, j) => (
            <line key={`ih-${i}-${j}`} x1={layers[0].x} y1={y1} x2={layers[1].x} y2={y2}
              stroke={layerColors[0]} strokeWidth={0.9} strokeOpacity={opI2H[i][j]} />
          ))
        )}
        {/* Hidden → Output connections */}
        {layers[1].ys.map((y1, i) =>
          layers[2].ys.map((y2, j) => (
            <line key={`ho-${i}-${j}`} x1={layers[1].x} y1={y1} x2={layers[2].x} y2={y2}
              stroke={layerColors[1]} strokeWidth={0.9} strokeOpacity={opH2O[i][j]} />
          ))
        )}
        {/* Nodes */}
        {layers.map((layer, li) =>
          layer.ys.map((y, ni) => (
            <circle key={`n-${li}-${ni}`} cx={layer.x} cy={y} r={10}
              fill={layerColors[li]} fillOpacity={0.88} />
          ))
        )}
        {/* Labels */}
        {[{ x: 48, label: "Input" }, { x: 133, label: "Hidden (3D)" }, { x: 218, label: "Output" }].map((l) => (
          <text key={l.label} x={l.x} y={168} textAnchor="middle" fontSize="8"
            fill="currentColor" className="text-neutral-400 dark:text-neutral-600" fontFamily="monospace">
            {l.label}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-[9px] font-mono text-neutral-400 dark:text-neutral-600">
        XOR problem → <span className="text-violet-400">linearly separable in 3D</span>
      </p>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SHOWCASE = [
  {
    tool: "transformer-engine",
    title: "Transformer Engine",
    badge: "Live GPT-2",
    desc: "Type a sentence and watch a real GPT-2 architecture process it locally — token by token. Hover any token to see exact self-attention weights across every head and layer.",
    gradient: "from-indigo-500/12 via-violet-500/6 dark:from-indigo-500/10",
    badgeStyle: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25",
    Preview: AttentionPreview,
  },
  {
    tool: "semantic-space",
    title: "Semantic Space",
    badge: "3D WebGL",
    desc: "Words are coordinates in 3D space. Drag through real embedding geometry. Perform vector math live — King − Man + Woman = Queen — proved with actual 3D arrows and a cosine similarity score.",
    gradient: "from-cyan-500/10 via-blue-500/5 dark:from-cyan-500/8",
    badgeStyle: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25",
    Preview: SemanticPreview,
  },
  {
    tool: "neural-network",
    title: "Neural Network 3D",
    badge: "3D WebGL",
    desc: "Watch a hidden layer warp 2D input space into 3D geometry so a flat decision plane can slice apart non-linear data. Training updates play out in real time.",
    gradient: "from-violet-500/10 via-purple-500/5 dark:from-violet-500/8",
    badgeStyle: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25",
    Preview: NeuralPreview,
  },
];

const SECONDARY = [
  { tool: "gradient-descent",  title: "Gradient Descent",       desc: "SGD vs Momentum vs Adam on a live loss surface" },
  { tool: "bias-variance",     title: "Bias–Variance",          desc: "Slide polynomial degree — watch overfitting happen" },
  { tool: "kl-divergence",     title: "KL Divergence",          desc: "The information-theoretic math behind LLM training" },
  { tool: "image-convolution", title: "Image Convolution",      desc: "Drag kernel matrices over images to see how CNNs see" },
  { tool: "svm-kernel",        title: "SVM Kernel Trick",       desc: "Map 2D circles into 3D to make them linearly separable" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AiMlSection() {
  return (
    <section id="aiml" className="w-full px-6 md:px-12 py-16 md:py-24 scroll-mt-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="mb-12"
      >
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-3">
          AI &amp; Machine Learning
        </p>
        <h2 className="font-medium tracking-tightest text-4xl md:text-5xl leading-tight text-neutral-900 dark:text-neutral-100 max-w-3xl">
          Real-time 3D environments that make{" "}
          <span className="sl-ai-gradient">modern AI tangible.</span>
        </h2>
        <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Not diagrams in a textbook — interactive WebGL canvases where you control the inputs and the math responds instantly.
        </p>
      </motion.div>

      {/* Three flagship cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {SHOWCASE.map(({ tool, title, badge, desc, gradient, badgeStyle, Preview }, i) => (
          <motion.div
            key={tool}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, ease: "easeOut", delay: i * 0.08 }}
          >
            <Link
              href={`/app?tool=${tool}`}
              aria-label={`Open ${title} in Stats Lab`}
              className="group flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden hover:shadow-lg hover:border-neutral-300 dark:hover:border-neutral-700 hover:-translate-y-0.5 transition-all h-full"
            >
              {/* Visual preview area */}
              <div className={`relative bg-gradient-to-br ${gradient} to-transparent border-b border-neutral-100 dark:border-neutral-800/60`} style={{ minHeight: 220 }}>
                <span className={`absolute top-3 right-3 z-10 text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-full ${badgeStyle}`}>
                  {badge}
                </span>
                <div className="w-full h-full" style={{ minHeight: 220 }}>
                  <Preview />
                </div>
              </div>

              {/* Text */}
              <div className="p-5 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Secondary AI/ML tools row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.2 }}
        className="mt-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {SECONDARY.map(({ tool, title, desc }) => (
            <Link
              key={tool}
              href={`/app?tool=${tool}`}
              className="group rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
              </div>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-500 leading-snug">{desc}</p>
            </Link>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
