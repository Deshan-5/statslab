"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rngFor, gauss, mean, sd } from "./shared/stats";
import {
  Tabs, Stat, Field, DataTextArea, SampleDataButton, Panel, Btn, useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 480, H = 260, PAD = 36;

const SAMPLE = `-2.5, 0
-1.8, 0
-1.2, 0
-0.5, 0
-0.2, 1
0.1, 0
0.4, 1
0.9, 1
1.5, 1
2.2, 1`;

type Pt = { x: number; y: number };

// Helper to fit univariate logistic regression via gradient descent
// We standardize x during optimization for numerical stability, then map beta back to original scale
function fitLogistic(pts: Pt[]) {
  const N = pts.length;
  if (N < 4) return { beta0: 0, beta1: 0, converged: false };

  const xs = pts.map(p => p.x);
  const mx = mean(xs);
  const sx = sd(xs) || 1;

  // Standardized inputs
  const zPoints = pts.map(p => ({ x: (p.x - mx) / sx, y: p.y }));

  let b0 = 0;
  let b1 = 0;
  const lr = 0.2;
  const maxIters = 800;

  for (let iter = 0; iter < maxIters; iter++) {
    let grad0 = 0;
    let grad1 = 0;

    for (let i = 0; i < N; i++) {
      const p = zPoints[i];
      const dot = b0 + b1 * p.x;
      const pred = 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, dot))));
      const diff = pred - p.y;
      grad0 += diff;
      grad1 += diff * p.x;
    }

    b0 -= (lr / N) * grad0;
    b1 -= (lr / N) * grad1;

    // Check convergence
    if (Math.abs(grad0) < 1e-4 && Math.abs(grad1) < 1e-4) break;
  }

  // Map back to raw scale: b0 + b1 * (x - mx)/sx = (b0 - b1 * mx / sx) + (b1 / sx) * x
  const beta1 = b1 / sx;
  const beta0 = b0 - (b1 * mx) / sx;

  return { beta0, beta1, converged: true };
}

export default function LogisticRegressionTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Simulation");
  const [raw, setRaw] = useState(SAMPLE);
  const [n, setN] = useState(150);
  const [seed, setSeed] = useState(1);
  const [threshold, setThreshold] = useState(0.5);

  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);

  useRegisterToolState("logistic-regression", { tab, raw, n, seed, threshold, xCol, yCol }, {
    tab: setTab,
    raw: setRaw,
    n: setN,
    seed: setSeed,
    threshold: setThreshold,
    xCol: setXCol,
    yCol: setYCol,
  });

  // Numeric columns selection
  const columns = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns;
  }, [dataset]);

  const numericCols = useMemo(() => {
    return columns.filter(c => c.type === "numeric").map(c => c.name);
  }, [columns]);

  // Set default columns
  useEffect(() => {
    if (numericCols.length >= 2) {
      if (!xCol) setXCol(numericCols[0]);
      if (!yCol) setYCol(numericCols[1]);
    }
  }, [numericCols, xCol, yCol]);

  // Simulation generator
  const sim = useMemo(() => {
    const rng = rngFor(seed);
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const x = gauss(rng, 0, 1.6);
      const z = -0.5 + 1.8 * x;
      const prob = 1 / (1 + Math.exp(-z));
      const y = rng() < prob ? 1 : 0;
      pts.push({ x, y });
    }
    return pts;
  }, [n, seed]);

  // Parse custom raw data
  const parsed = useMemo(() => {
    const lines = raw.split("\n");
    const pts: Pt[] = [];
    for (const line of lines) {
      const parts = line.split(",").map(s => Number(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        // Force Y to binary 0 or 1
        const yVal = parts[1] >= 0.5 ? 1 : 0;
        pts.push({ x: parts[0], y: yVal });
      }
    }
    return pts.length > 0 ? pts : null;
  }, [raw]);

  // Pick dataset pairs in workspace mode
  const wsPts = useMemo(() => {
    if (!dataset || !xCol || !yCol) return [];
    const xs = dataset.columns.find(c => c.name === xCol);
    const ys = dataset.columns.find(c => c.name === yCol);
    if (!xs || !ys) return [];

    const out: Pt[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = xs.values[i];
      const yv = ys.values[i];
      const xnum = typeof xv === "number" ? xv : Number(xv);
      const ynum = typeof yv === "number" ? yv : Number(yv);

      if (!isNaN(xnum) && !isNaN(ynum) && xv !== null && yv !== null) {
        // Classify Y outcome (e.g. outcome >= median/0.5, or exactly 1 vs 0)
        const ybin = ynum >= 0.5 ? 1 : 0;
        out.push({ x: xnum, y: ybin });
      }
    }
    return out;
  }, [dataset, xCol, yCol]);

  const pts = useMemo(() => {
    if (tab === "Workspace") return wsPts;
    if (tab === "Simulation") return sim;
    return parsed || [];
  }, [tab, wsPts, sim, parsed]);

  const fit = useMemo(() => fitLogistic(pts), [pts]);

  // Compute stats on the dataset
  const xValues = pts.map(p => p.x);
  const xMin = xValues.length ? Math.min(...xValues) - 0.4 : -3;
  const xMax = xValues.length ? Math.max(...xValues) + 0.4 : 3;

  // Predict prob for X
  const getProb = (x: number) => {
    const z = fit.beta0 + fit.beta1 * x;
    return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, z))));
  };

  // Grid coordinates mapping
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - y * (H - 2 * PAD);

  // Compute confusion matrix elements based on threshold
  const confusion = useMemo(() => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    pts.forEach(p => {
      const prob = getProb(p.x);
      const pred = prob >= threshold ? 1 : 0;
      if (p.y === 1 && pred === 1) tp++;
      else if (p.y === 0 && pred === 1) fp++;
      else if (p.y === 1 && pred === 0) fn++;
      else tn++;
    });
    const total = pts.length || 1;
    const sens = tp / (tp + fn || 1);
    const spec = tn / (tn + fp || 1);
    const prec = tp / (tp + fp || 1);
    const acc = (tp + tn) / total;
    const f1 = (2 * prec * sens) / (prec + sens || 1);
    return { tp, fp, fn, tn, sens, spec, prec, acc, f1 };
  }, [pts, fit, threshold]);

  // Generate ROC Curve points
  const rocCurve = useMemo(() => {
    const points: { x: number; y: number; t: number }[] = [];
    // Evaluate thresholds from 0 to 1
    for (let tStep = 0; tStep <= 100; tStep++) {
      const t = tStep / 100;
      let tp = 0, fp = 0, fn = 0, tn = 0;
      pts.forEach(p => {
        const prob = getProb(p.x);
        const pred = prob >= t ? 1 : 0;
        if (p.y === 1 && pred === 1) tp++;
        else if (p.y === 0 && pred === 1) fp++;
        else if (p.y === 1 && pred === 0) fn++;
        else tn++;
      });
      const sens = tp / (tp + fn || 1);
      const spec = tn / (tn + fp || 1);
      points.push({ x: 1 - spec, y: sens, t });
    }
    // Sort points by X (1-Specificity) ascending for AUC integration
    points.sort((a, b) => a.x - b.x);

    // Compute AUC via Trapezoidal Rule
    let auc = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const avgY = (points[i].y + points[i - 1].y) / 2;
      auc += dx * avgY;
    }

    return { points, auc };
  }, [pts, fit]);

  // Construct Sigmoid fit path
  const sigmoidPath = useMemo(() => {
    const steps = 100;
    const path: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = getProb(x);
      path.push(`${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
    }
    return path.join(" ");
  }, [xMin, xMax, fit]);

  const tabs = dataset
    ? ["Workspace", "Simulation", "Your Data"]
    : ["Simulation", "Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Card 1: Sigmoid Fit curve */}
          <Panel>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold"> Sigmoid Model Fit </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={sy(0.5)} x2={W - PAD} y2={sy(0.5)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-axis)" />
              <line x1={PAD} y1={sy(1)} x2={W - PAD} y2={sy(1)} stroke="var(--chart-axis)" />
              
              {/* Threshold line */}
              <line x1={PAD} y1={sy(threshold)} x2={W - PAD} y2={sy(threshold)} stroke="#6366f1" strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1.5} />
              <text x={W - PAD - 6} y={sy(threshold) - 5} textAnchor="end" fontSize="9" fill="#6366f1" className="font-semibold">Threshold ({threshold.toFixed(2)})</text>

              {/* Curve path */}
              {pts.length >= 4 && (
                <path d={sigmoidPath} fill="none" stroke="var(--chart-ink)" strokeWidth={2.5} />
              )}

              {/* Data points */}
              {pts.map((p, i) => {
                const prob = getProb(p.x);
                const pred = prob >= threshold ? 1 : 0;
                // Color orange if predicted positive, dark grey/black if negative
                const fill = pred === 1 ? "#fb923c" : "#737373";
                return (
                  <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3.2} fill={fill} fillOpacity={0.8} />
                );
              })}
            </svg>
          </Panel>

          {/* Card 2: ROC Curve */}
          <Panel>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold"> ROC Classifier Curve (AUC = {rocCurve.auc.toFixed(4)}) </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-axis)" />
              <line x1={PAD} y1={sy(1)} x2={PAD} y2={sy(0)} stroke="var(--chart-axis)" />
              
              {/* Diagonal baseline */}
              <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(1)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
              
              {/* ROC line */}
              {pts.length >= 4 && (
                <path
                  d={rocCurve.points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth={2.5}
                />
              )}

              {/* Operating point */}
              {pts.length >= 4 && (
                <circle
                  cx={sx(1 - confusion.spec)}
                  cy={sy(confusion.sens)}
                  r={6}
                  fill="#6366f1"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )}
              <text x={PAD + 10} y={sy(0.9)} fontSize="10" fill="var(--chart-muted)">Y-axis: Sensitivity (TPR)</text>
              <text x={W - PAD - 10} y={sy(0.1)} textAnchor="end" fontSize="10" fill="var(--chart-muted)">X-axis: 1 - Specificity (FPR)</text>
            </svg>
          </Panel>
        </div>

        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <>
              <ColumnPicker label="Predictor (X)" value={xCol} onChange={setXCol} kind="numeric" />
              <ColumnPicker label="Binary Outcome (Y)" value={yCol} onChange={setYCol} kind="numeric" />
            </>
          )}

          {tab === "Simulation" && (
            <>
              <Field label="Sample size n" value={String(n)}>
                <input type="range" min={30} max={600} step={10} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
              </Field>
              <Btn onClick={() => setSeed(s => s + 1)}>Re-simulate Noise</Btn>
            </>
          )}

          {tab === "Your Data" && (
            <>
              <DataTextArea label="X, Y pairs (Y outcome must be 0 or 1)" value={raw} onChange={setRaw} rows={5} />
              <SampleDataButton onClick={() => setRaw(SAMPLE)} />
            </>
          )}

          <Field label="Classification Threshold" value={threshold.toFixed(2)}>
            <input type="range" min={0.0} max={1.0} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full" />
          </Field>

          {/* Glassmorphic Confusion Matrix */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2 font-bold">Confusion Matrix</div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg">
                <div className="text-neutral-400 text-[10px]">TRUE POSITIVE (TP)</div>
                <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">{confusion.tp}</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg">
                <div className="text-neutral-400 text-[10px]">FALSE POSITIVE (FP)</div>
                <div className="text-lg font-bold text-red-500">{confusion.fp}</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg">
                <div className="text-neutral-400 text-[10px]">FALSE NEGATIVE (FN)</div>
                <div className="text-lg font-bold text-red-500">{confusion.fn}</div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg">
                <div className="text-neutral-400 text-[10px]">TRUE NEGATIVE (TN)</div>
                <div className="text-lg font-bold text-neutral-800 dark:text-neutral-200">{confusion.tn}</div>
              </div>
            </div>
          </div>

          <Stat label="Model fit formula" value={fit.beta1 !== 0 ? `p = 1 / (1 + e^-(${fit.beta0.toFixed(2)} + ${fit.beta1.toFixed(2)}x))` : "Calculating..."} />
          <Stat label="Accuracy" value={(confusion.acc * 100).toFixed(1) + "%"} />
          <Stat label="Sensitivity (Recall)" value={(confusion.sens * 100).toFixed(1) + "%"} />
          <Stat label="Specificity" value={(confusion.spec * 100).toFixed(1) + "%"} />
          <Stat label="Precision" value={(confusion.prec * 100).toFixed(1) + "%"} />
          <Stat label="F1 Score" value={confusion.f1.toFixed(3)} />
        </Panel>
      </div>
    </div>
  );
}
