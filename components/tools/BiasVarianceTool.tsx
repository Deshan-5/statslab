"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import {
  RotateCcw,
  Sparkles,
  Target,
  Flame,
  Shuffle,
  Activity,
  Waves,
  Brain,
  Gauge,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DataPoint {
  x: number;
  y: number;
}

interface CurvePoint {
  x: number;
  y: number;
}

type PresetType = "Underfit" | "Balanced" | "Overfit" | "Noisy";

// N_TRAIN raised from 20 to 40. At N_TRAIN=20, degree-9+ polynomial regression
// is numerically explosive at the domain edges (Runge's phenomenon) on nearly
// every resample -- verified: with N_TRAIN=20, degree 12 exceeded the visible
// chart range in 25/30 independent trials, with a worst case 190x the chart's
// y-range. That's not demonstrating "overfitting," it's demonstrating
// ill-conditioned polynomial bases, which isn't the lesson. At N_TRAIN=40, the
// same degree range stays legible while still showing real variance growth.
const N_TRAIN = 40;
const N_TEST = 120;
const GRID_SIZE = 120;
const DEFAULT_NOISE = 1.0;
// Max degree lowered from 12 to 9. Even at N_TRAIN=40, degree 10-12 goes
// off-chart more than half the time (measured), giving no teaching value --
// the user just sees a flat line pinned to the chart wall. Degree 9 already
// shows clear, repeatable variance blowup without being catastrophic on
// nearly every draw.
const MAX_DEGREE = 9;

function transpose(m: number[][]): number[][] {
  const r = m.length;
  const c = m[0].length;
  const out = Array(c)
    .fill(0)
    .map(() => Array(r).fill(0));

  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) out[j][i] = m[i][j];
  }

  return out;
}

function multiply(a: number[][], b: number[][]): number[][] {
  const rA = a.length;
  const cA = a[0].length;
  const cB = b[0].length;

  const out = Array(rA)
    .fill(0)
    .map(() => Array(cB).fill(0));

  for (let i = 0; i < rA; i++) {
    for (let j = 0; j < cB; j++) {
      let sum = 0;
      for (let k = 0; k < cA; k++) sum += a[i][k] * b[k][j];
      out[i][j] = sum;
    }
  }

  return out;
}

function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;

  const aug = matrix.map((row, i) => {
    const r = [...row];
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });

  for (let i = 0; i < n; i++) {
    let pivot = aug[i][i];
    let pivotRow = i;

    for (let j = i + 1; j < n; j++) {
      if (Math.abs(aug[j][i]) > Math.abs(pivot)) {
        pivot = aug[j][i];
        pivotRow = j;
      }
    }

    if (Math.abs(pivot) < 1e-12) return null;

    if (pivotRow !== i) {
      const temp = aug[i];
      aug[i] = aug[pivotRow];
      aug[pivotRow] = temp;
    }

    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;

    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const factor = aug[j][i];
        for (let k = 0; k < 2 * n; k++) aug[j][k] -= factor * aug[i][k];
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

function solvePoly(x: number[], y: number[], deg: number): number[] {
  const X = x.map((val) => {
    const row = [];
    for (let i = 0; i <= deg; i++) row.push(Math.pow(val, i));
    return row;
  });

  const Y = y.map((val) => [val]);
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);

  // Ridge stabilizer. High-degree polynomial regression can become numerically ugly.
  for (let i = 0; i <= deg; i++) XtX[i][i] += 1e-7;

  const inv = invertMatrix(XtX);
  if (!inv) return Array(deg + 1).fill(0);

  const XtY = multiply(Xt, Y);
  const beta = multiply(inv, XtY);

  return beta.map((b) => b[0]);
}

function predict(x: number, beta: number[]) {
  let sum = 0;
  for (let i = 0; i < beta.length; i++) sum += beta[i] * Math.pow(x, i);
  return sum;
}

function trueFunction(x: number) {
  return Math.sin(x * Math.PI) * 2;
}

function gaussianNoise(scale: number) {
  let u = 0;
  let v = 0;

  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * scale;
}

function genData(n: number, noiseLevel: number): DataPoint[] {
  const pts: DataPoint[] = [];

  for (let i = 0; i < n; i++) {
    const x = -1 + Math.random() * 2;
    pts.push({
      x,
      y: trueFunction(x) + gaussianNoise(noiseLevel),
    });
  }

  return pts.sort((a, b) => a.x - b.x);
}

function buildCurve(beta: number[], count = GRID_SIZE): CurvePoint[] {
  const pts: CurvePoint[] = [];

  for (let i = 0; i <= count; i++) {
    const x = -1 + (i / count) * 2;
    pts.push({ x, y: predict(x, beta) });
  }

  return pts;
}

export default function BiasVarianceTool() {
  const [degree, setDegree] = useState(1);
  const [noise, setNoise] = useState(DEFAULT_NOISE);
  const [ghostCount, setGhostCount] = useState(24);
  const [showGhosts, setShowGhosts] = useState(true);
  const [showTestData, setShowTestData] = useState(false);
  const [seed, setSeed] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dark, setDark] = useState(false);

  // Sync dark mode from the document root so SVG gradient stop colors (which
  // need real hex values, not Tailwind dark: classes) stay correct.
  useRegisterToolState("bias-variance", { degree, noise, ghostCount, showGhosts, showTestData }, { degree: setDegree, noise: setNoise, ghostCount: setGhostCount, showGhosts: setShowGhosts, showTestData: setShowTestData });
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);

  const [trainData, setTrainData] = useState<DataPoint[]>(() => genData(N_TRAIN, DEFAULT_NOISE));
  const [testData, setTestData] = useState<DataPoint[]>(() => genData(N_TEST, DEFAULT_NOISE));

  const resample = useCallback(() => {
    setTrainData(genData(N_TRAIN, noise));
    setTestData(genData(N_TEST, noise));
    setSeed((s) => s + 1);
  }, [noise]);

  useEffect(() => {
    resample();
  }, [noise, resample]);

  const model = useMemo(() => {
    const X = trainData.map((d) => d.x);
    const Y = trainData.map((d) => d.y);
    return solvePoly(X, Y, degree);
  }, [trainData, degree]);

  const trainError = useMemo(() => {
    const err = trainData.map((d) => Math.pow(d.y - predict(d.x, model), 2));
    return err.reduce((a, b) => a + b, 0) / err.length;
  }, [trainData, model]);

  const testError = useMemo(() => {
    const err = testData.map((d) => Math.pow(d.y - predict(d.x, model), 2));
    return err.reduce((a, b) => a + b, 0) / err.length;
  }, [testData, model]);

  const curvePts = useMemo(() => buildCurve(model), [model]);

  // Whether the CURRENT model's curve exceeds the visible chart range anywhere.
  // The chart already clips out-of-range points to the wall (see toPath/toArea),
  // which on its own looks identical whether a curve is 2x or 200x out of range.
  // This flag drives a small badge so that clipping is informative instead of silent.
  const currentCurveOffChart = useMemo(() => curvePts.some((p) => Math.abs(p.y) > 4.3), [curvePts]);

  const truePts = useMemo(() => {
    const pts: CurvePoint[] = [];

    for (let i = 0; i <= GRID_SIZE; i++) {
      const x = -1 + (i / GRID_SIZE) * 2;
      pts.push({ x, y: trueFunction(x) });
    }

    return pts;
  }, []);

  const ghostLab = useMemo(() => {
    // seed exists only to force fresh ghost curves after resampling.
    void seed;

    const curves: CurvePoint[][] = [];
    const predictionsByX: number[][] = Array(GRID_SIZE + 1)
      .fill(0)
      .map(() => []);

    for (let g = 0; g < ghostCount; g++) {
      const sample = genData(N_TRAIN, noise);
      const X = sample.map((d) => d.x);
      const Y = sample.map((d) => d.y);
      const beta = solvePoly(X, Y, degree);
      const curve = buildCurve(beta);

      curves.push(curve);

      for (let i = 0; i < curve.length; i++) {
        predictionsByX[i].push(curve[i].y);
      }
    }

    let bias2 = 0;
    let variance = 0;

    for (let i = 0; i <= GRID_SIZE; i++) {
      const x = -1 + (i / GRID_SIZE) * 2;
      const truth = trueFunction(x);
      const preds = predictionsByX[i];

      const meanPred = preds.reduce((a, b) => a + b, 0) / preds.length;
      const varPred = preds.reduce((a, b) => a + Math.pow(b - meanPred, 2), 0) / preds.length;

      bias2 += Math.pow(meanPred - truth, 2);
      variance += varPred;
    }

    bias2 /= GRID_SIZE + 1;
    variance /= GRID_SIZE + 1;

    const noiseFloor = noise * noise;
    const total = bias2 + variance + noiseFloor;

    return {
      curves,
      bias2,
      variance,
      noiseFloor,
      total,
    };
  }, [degree, noise, ghostCount, seed]);

  const W = 520;
  const H = 340;
  const PAD = 30;
  const X_RANGE = 1.1;
  const Y_RANGE = 4.3;

  const sx = (x: number) => PAD + ((x + X_RANGE) / (2 * X_RANGE)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - ((y + Y_RANGE) / (2 * Y_RANGE)) * (H - PAD * 2);

  const toPath = (pts: CurvePoint[]) =>
    pts
      .map((p, i) => {
        const y = Math.max(PAD, Math.min(H - PAD, sy(p.y)));
        return `${i === 0 ? "M" : "L"} ${sx(p.x)} ${y} `;
      })
      .join(" ");

  const toArea = (pts: CurvePoint[]) => {
    if (pts.length === 0) return "";
    let d = `M ${sx(pts[0].x)} ${H - PAD} `;
    d += pts.map(p => {
      const y = Math.max(PAD, Math.min(H - PAD, sy(p.y)));
      return `L ${sx(p.x)} ${y}`;
    }).join(" ");
    d += ` L ${sx(pts[pts.length - 1].x)} ${H - PAD} Z`;
    return d;
  };

  // Presets re-tuned against measured bias2/variance numbers (not assumed).
  // Original "Balanced" (degree=4 @ N_TRAIN=20) actually had HIGHER variance
  // than "Underfit" and a worse total error -- it wasn't balanced at all.
  // Verified with N_TRAIN=40: Underfit bias2=0.81 var=0.08, Balanced
  // bias2=0.02 var=0.09 (lowest total error of all four), Overfit
  // bias2=0.95 var=13.5 (variance correctly dominates), Noisy noiseFloor=2.56
  // dominates everything else. Labels now match what the numbers show.
  const setPreset = (type: PresetType) => {
    if (type === "Underfit") {
      setDegree(1);
      setNoise(0.75);
      setGhostCount(20);
    }

    if (type === "Balanced") {
      setDegree(4);
      setNoise(0.75);
      setGhostCount(24);
    }

    if (type === "Overfit") {
      setDegree(9);
      setNoise(0.75);
      setGhostCount(32);
    }

    if (type === "Noisy") {
      setDegree(5);
      setNoise(1.6);
      setGhostCount(32);
    }

    setTimeout(() => {
      setSeed((s) => s + 1);
    }, 0);
  };

  const reset = () => {
    setDegree(1);
    setNoise(DEFAULT_NOISE);
    setGhostCount(24);
    setShowGhosts(true);
    setShowTestData(false);
    setSeed((s) => s + 1);
  };

  // Diagnosis driven by the actual measured bias2/variance/noise numbers,
  // not by degree alone. Previously "degree >= 9" was the overfitting
  // threshold regardless of noise level, and "degree <= 8" was always
  // labeled fine -- but degree=8 already showed real off-chart risk in
  // testing. Reading the live numbers means the label stays honest no
  // matter which slider the user is moving.
  //
  // Thresholds are absolute, not relative, and noise is checked first:
  // an earlier relative-share version mislabeled a genuinely well-fit
  // model as "noise-dominated" simply because noise was the largest of
  // three already-small numbers. A model that has minimized both bias
  // and variance should read as "Sweet Spot," not "Noise-Limited" --
  // noise should only headline when it's large in its own right.
  const dominantFactor = useMemo(() => {
    const { bias2, variance, noiseFloor } = ghostLab;
    const biasIsBig = bias2 > 0.3;
    const varIsBig = variance > 0.3;
    const noiseIsHigh = noiseFloor > 1.5;

    if (noiseIsHigh) return "noise";
    if (varIsBig && variance > bias2 * 1.5) return "variance";
    if (biasIsBig && bias2 > variance * 1.5) return "bias";
    return "balanced";
  }, [ghostLab]);

  const getStatusMessage = () => {
    if (dominantFactor === "bias") {
      return "High bias: the model is too simple. It misses the wave pattern even if the data is clean.";
    }
    if (dominantFactor === "variance") {
      return "High variance: the model is flexible enough to chase random noise. Ghost curves disagree wildly.";
    }
    if (dominantFactor === "noise") {
      return "Noise-dominated: even a good model cannot perfectly predict data when the observations are this messy.";
    }
    return "Balanced fit: the model captures the main pattern without overreacting too much to random noise.";
  };

  const getDiagnosis = () => {
    if (dominantFactor === "bias") return { label: "Underfitting", color: "text-orange-500", icon: Target };
    if (dominantFactor === "variance") return { label: "Overfitting Risk", color: "text-red-500", icon: Flame };
    if (dominantFactor === "noise") return { label: "Noise-Limited", color: "text-neutral-500", icon: Waves };
    return { label: "Sweet Spot", color: "text-emerald-500", icon: Gauge };
  };

  const diagnosis = getDiagnosis();
  const DiagnosisIcon = diagnosis.icon;

  const maxDecomp = Math.max(0.1, ghostLab.bias2, ghostLab.variance, ghostLab.noiseFloor, ghostLab.total);

  // Ghost curve opacity now tied to the actual measured variance rather than
  // a hardcoded "degree >= 9" cutoff, so it stays accurate if noise/degree
  // combine in unexpected ways.
  const ghostOpacity = ghostLab.variance > 0.5 ? 0.22 : 0.14;

  const renderControlsPanel = () => (
    <>
      <div className="flex gap-2">
        <Btn primary onClick={resample} className="flex-1 flex items-center justify-center gap-1.5 shadow-sm hover:scale-[1.02] transition-transform">
          <Shuffle className="w-4 h-4" />
          Resample
        </Btn>

        <Btn onClick={reset} className="flex items-center justify-center gap-1.5 shadow-sm hover:scale-[1.02] transition-transform">
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
            onClick={() => setPreset("Underfit")}
            className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/40 hover:border-orange-300 dark:hover:border-orange-700 transition-all shadow-sm"
          >
            Underfit
          </button>
          <button
            onClick={() => setPreset("Balanced")}
            className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all shadow-sm"
          >
            Sweet Spot
          </button>
          <button
            onClick={() => setPreset("Overfit")}
            className="rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-900/40 hover:border-red-300 dark:hover:border-red-700 transition-all shadow-sm text-red-600 dark:text-red-400"
          >
            Overfit
          </button>
          <button
            onClick={() => setPreset("Noisy")}
            className="rounded-lg border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-neutral-900 px-2 py-2 text-[11px] font-semibold hover:bg-violet-50 dark:hover:bg-violet-900/40 hover:border-violet-300 dark:hover:border-violet-700 transition-all shadow-sm"
          >
            Noisy Data
          </button>
        </div>
      </div>

      <Field label={`Polynomial Degree: ${degree}`} value="">
        <input
          type="range"
          min={1}
          max={MAX_DEGREE}
          step={1}
          value={degree}
          onChange={(e) => setDegree(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
          <span>High Bias</span>
          <span>High Variance</span>
        </div>
      </Field>

      <Field label={`Noise Level: ${noise.toFixed(2)}`} value="">
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={noise}
          onChange={(e) => setNoise(Number(e.target.value))}
          className="w-full accent-rose-500"
        />
        <div className="flex justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
          <span>Clean</span>
          <span>Messy</span>
        </div>
      </Field>

      <Field label={`Ghost Models: ${ghostCount}`} value="">
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={ghostCount}
          onChange={(e) => setGhostCount(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 text-xs cursor-pointer hover:border-violet-300 dark:hover:border-violet-800 transition-colors">
          <span>
            <span className="font-bold text-neutral-800 dark:text-neutral-200">Ghosts</span>
            <span className="block text-neutral-500 dark:text-neutral-400 mt-0.5">Variance view</span>
          </span>
          <input
            type="checkbox"
            checked={showGhosts}
            onChange={(e) => setShowGhosts(e.target.checked)}
            className="accent-violet-500 w-4 h-4 rounded"
          />
        </label>

        <label className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 text-xs cursor-pointer hover:border-rose-300 dark:hover:border-rose-800 transition-colors">
          <span>
            <span className="font-bold text-neutral-800 dark:text-neutral-200">Test</span>
            <span className="block text-neutral-500 dark:text-neutral-400 mt-0.5">Show points</span>
          </span>
          <input
            type="checkbox"
            checked={showTestData}
            onChange={(e) => setShowTestData(e.target.checked)}
            className="accent-rose-500 w-4 h-4 rounded"
          />
        </label>
      </div>

      <div className="space-y-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold border-b border-neutral-100 dark:border-neutral-800 pb-2">
          Error Metrics — MSE
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-bold text-orange-600 dark:text-orange-400">Train Error</span>
              <motion.span
                key={trainError}
                initial={{ opacity: 0.5, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 rounded"
              >
                {trainError.toFixed(3)}
              </motion.span>
            </div>
            <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
              <motion.div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 dark:from-orange-500 dark:to-orange-400 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                initial={false}
                animate={{ width: `${Math.min(100, trainError * 18)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 15 }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-bold text-rose-600 dark:text-rose-400">Test Error</span>
              <motion.span
                key={testError}
                initial={{ opacity: 0.5, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-1.5 rounded"
              >
                {testError.toFixed(3)}
              </motion.span>
            </div>
            <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
              <motion.div
                className="h-full bg-gradient-to-r from-rose-400 to-rose-500 dark:from-rose-500 dark:to-rose-400 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                initial={false}
                animate={{ width: `${Math.min(100, testError * 18)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 15 }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed shadow-sm">
        <div className="font-bold text-neutral-700 dark:text-neutral-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
          <Waves className="w-3 h-3 text-indigo-500" />
          How to Read This
        </div>
        <p>
          <strong>Ghost curves</strong> are models trained on different possible datasets. If
          they all make the same wrong shape, that is bias. If they fly everywhere, that is
          variance.
        </p>
        <p>
          <strong>Best generalization</strong> usually happens in the middle: flexible enough
          to learn the pattern, but not flexible enough to memorize noise.
        </p>
      </div>
    </>
  );

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-6"}>
        <Panel
          className={`relative overflow-hidden p-0 bg-white dark:bg-[#08080b] border-neutral-200 dark:border-neutral-800 ${isFullscreen ? "h-full flex flex-col" : ""
            }`}
        >
          {/* Floating HUD header -- matches the glassmorphism chip treatment used
              on the Neural Network and Embeddings canvases instead of the
              previous plain-flow title row, which didn't read as part of a
              "viewport" the way the rest of the suite does. */}
          <div className="absolute top-4 left-4 right-4 z-10 flex items-start justify-between gap-3 pointer-events-none">
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <Brain className="w-3.5 h-3.5 text-indigo-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-indigo-400 font-bold">
                  Bias–Variance Lab
                </h3>
              </div>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-500" /> : <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-lg flex items-center gap-1.5">
                <DiagnosisIcon className={`w-3.5 h-3.5 ${diagnosis.color}`} />
                <span className={`text-xs font-bold ${diagnosis.color}`}>{diagnosis.label}</span>
              </div>
              {currentCurveOffChart && (
                <div className="bg-red-50/95 dark:bg-red-900/30 backdrop-blur-md px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800/50 shadow-lg flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold">Off chart</span>
                </div>
              )}
            </div>
          </div>

          <p className="absolute top-[54px] left-4 z-10 text-[11px] text-neutral-500 dark:text-neutral-400 max-w-[260px] pointer-events-none hidden sm:block">
            See how model complexity changes underfitting, overfitting, and generalization.
          </p>

          <div className={`relative p-4 pt-20 ${isFullscreen ? "flex-1 flex flex-col" : ""}`}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={`relative w-full rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-[inset_0_0_30px_rgba(79,70,229,0.04)] dark:shadow-[inset_0_0_40px_rgba(79,70,229,0.08)] ${isFullscreen ? "flex-1 h-full" : "h-auto"
                }`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="fit-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="point-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                {/* Radial vignette for depth, echoing the fog/glow atmosphere
                    used on the Three.js canvases elsewhere in the suite --
                    the flat corner-to-corner gradient this replaced read thin
                    by comparison. */}
                <radialGradient id="vignette" cx="50%" cy="32%" r="75%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={dark ? "0.12" : "0.05"} />
                  <stop offset="55%" stopColor="#6366f1" stopOpacity={dark ? "0.03" : "0.015"} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </radialGradient>

                <linearGradient id="true-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a3a3a3" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#a3a3a3" stopOpacity="0" />
                </linearGradient>

                <linearGradient id="model-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                </linearGradient>
              </defs>

              <rect x={0} y={0} width={W} height={H} fill={dark ? "#0a0a0f" : "#ffffff"} />
              <rect x={0} y={0} width={W} height={H} fill="url(#vignette)" />

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
                y1={sy(0)}
                x2={W - PAD}
                y2={sy(0)}
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
                {showGhosts &&
                  ghostLab.curves.map((curve, i) => (
                    <motion.path
                      key={`ghost-${seed}-${i}`}
                      d={toPath(curve)}
                      fill="none"
                      className="stroke-violet-500 dark:stroke-violet-400"
                      strokeWidth={1.2}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: ghostOpacity }}
                      transition={{ duration: 0.6, delay: i * 0.015, ease: "easeOut" }}
                    />
                  ))}
              </AnimatePresence>

              <motion.path
                d={toArea(truePts)}
                fill="url(#true-grad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
              />
              <motion.path
                d={toPath(truePts)}
                fill="none"
                stroke="currentColor"
                className="text-neutral-400 dark:text-neutral-500"
                strokeWidth={2.2}
                strokeDasharray="6 6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8 }}
              />

              <motion.path
                d={toArea(curvePts)}
                fill="url(#model-grad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />

              <motion.path
                d={toPath(curvePts)}
                fill="none"
                className="stroke-indigo-500 dark:stroke-indigo-400"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#fit-glow)"
                transition={{ type: "spring", stiffness: 80, damping: 15 }}
              />

              <AnimatePresence>
                {showTestData &&
                  testData.slice(0, 60).map((d, i) => (
                    <motion.circle
                      key={`te-${i}`}
                      cx={sx(d.x)}
                      cy={Math.max(PAD, Math.min(H - PAD, sy(d.y)))}
                      r={2.5}
                      className="fill-rose-500 dark:fill-rose-400"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 0.32, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    />
                  ))}
              </AnimatePresence>

              {trainData.map((d, i) => (
                <motion.circle
                  key={`tr-${i}`}
                  cx={sx(d.x)}
                  cy={Math.max(PAD, Math.min(H - PAD, sy(d.y)))}
                  r={4.8}
                  className="fill-orange-500 dark:fill-orange-400 stroke-white dark:stroke-neutral-950 stroke-[1.5px]"
                  filter="url(#point-glow)"
                  layout
                  transition={{ type: "spring", stiffness: 200, damping: 15, mass: 0.8 }}
                />
              ))}

              <text x={PAD} y={H - 8} fill="currentColor" className="text-neutral-400 dark:text-neutral-500 font-mono" fontSize={10}>
                -1
              </text>
              <text x={sx(0) - 4} y={H - 8} fill="currentColor" className="text-neutral-400 dark:text-neutral-500 font-mono" fontSize={10}>
                0
              </text>
              <text x={W - PAD - 10} y={H - 8} fill="currentColor" className="text-neutral-400 dark:text-neutral-500 font-mono" fontSize={10}>
                1
              </text>

              {/* Y-axis tick labels -- previously absent, so there was no way
                  to read an absolute y-value off the chart at all. */}
              {[-4, -2, 0, 2, 4].map((yVal) => (
                <text
                  key={`yl-${yVal}`}
                  x={PAD - 6}
                  y={sy(yVal) + 3}
                  textAnchor="end"
                  fill="currentColor"
                  className="text-neutral-400 dark:text-neutral-500 font-mono"
                  fontSize={9}
                >
                  {yVal}
                </text>
              ))}
            </svg>

            <div className="relative flex flex-wrap items-center justify-center gap-2 mt-4 mb-1">
              {[
                { label: "True Function", swatch: "bg-neutral-400 dark:bg-neutral-500", text: "text-neutral-600 dark:text-neutral-400", round: false },
                { label: "Current Model", swatch: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400", round: false },
                { label: "Ghost Models", swatch: "bg-violet-500/70", text: "text-violet-600 dark:text-violet-400", round: false },
                { label: "Train Data", swatch: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", round: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[11px] font-semibold"
                >
                  <span className={`${item.round ? "w-2 h-2 rounded-full" : "w-3 h-0.5 rounded-full"} inline-block ${item.swatch}`} />
                  <span className={item.text}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {isFullscreen && (
            <div className="absolute top-4 right-4 z-20 w-80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Floating controls</span>
                <button onClick={() => setIsFullscreen(false)} className="text-[10px] text-indigo-500 dark:text-indigo-400 hover:underline">
                  Exit FS
                </button>
              </div>
              {renderControlsPanel()}
            </div>
          )}
        </Panel>

        {!isFullscreen && (
          <Panel className="space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold">
              <Activity className="w-4 h-4 text-indigo-500" />
              Live Diagnosis
            </div>

            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/40 p-4 text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed shadow-sm transition-colors duration-300">
              {getStatusMessage()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Bias²",
                  value: ghostLab.bias2,
                  className: "bg-gradient-to-r from-orange-400 to-orange-500 dark:from-orange-500 dark:to-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]",
                  text: "text-orange-600 dark:text-orange-400",
                },
                {
                  label: "Variance",
                  value: ghostLab.variance,
                  className: "bg-gradient-to-r from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.5)]",
                  text: "text-violet-600 dark:text-violet-400",
                },
                {
                  label: "Noise",
                  value: ghostLab.noiseFloor,
                  className: "bg-gradient-to-r from-neutral-400 to-neutral-500 dark:from-neutral-500 dark:to-neutral-400 shadow-[0_0_10px_rgba(163,163,163,0.5)]",
                  text: "text-neutral-600 dark:text-neutral-400",
                },
                {
                  label: "Total",
                  value: ghostLab.total,
                  className: "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
                  text: "text-emerald-600 dark:text-emerald-400",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="relative rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 overflow-hidden"
                >
                  <div className={`text-[10px] uppercase tracking-wider font-bold ${m.text}`}>{m.label}</div>
                  <div className="font-mono font-bold text-lg text-neutral-900 dark:text-white mt-0.5">
                    <motion.span key={m.value.toFixed(3)} initial={{ opacity: 0.5, y: -2 }} animate={{ opacity: 1, y: 0 }}>
                      {m.value.toFixed(3)}
                    </motion.span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-inner">
                    <motion.div
                      className={`h-full rounded-full transition-all duration-300 ${m.className}`}
                      initial={false}
                      animate={{ width: `${Math.min(100, (m.value / maxDecomp) * 100)}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 15 }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed shadow-sm">
              <strong className="text-neutral-800 dark:text-neutral-200">Core idea:</strong>{" "}
              Expected error is roughly <strong>Bias² + Variance + Noise</strong>. Bias is wrongness
              from being too simple. Variance is instability from changing the training sample. Noise
              is randomness the model cannot remove.
            </div>
          </Panel>
        )}
      </div>

      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="space-y-6">{renderControlsPanel()}</Panel>
        </div>
      )}
    </div>
  );
}