"use client";

import { useMemo, useState } from "react";
import { rngFor, gauss, mean, sd, acf, pacf, parseNumbers } from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Interpretation, useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 380, PAD = 28;
const N = 200;
const LAGS = 20;

type Model = "AR1" | "AR2" | "MA1" | "ARMA";

function simulate(model: Model, params: { phi: number; phi2: number; theta: number }, seed: number) {
  const rng = rngFor(seed);
  const eps = Array.from({ length: N }, () => gauss(rng));
  const xs = new Array<number>(N);
  for (let t = 0; t < N; t++) {
    const e = eps[t];
    if (model === "AR1") xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + e;
    else if (model === "AR2") xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + (t > 1 ? params.phi2 * xs[t - 2] : 0) + e;
    else if (model === "MA1") xs[t] = e + (t > 0 ? params.theta * eps[t - 1] : 0);
    else xs[t] = (t > 0 ? params.phi * xs[t - 1] : 0) + e + (t > 0 ? params.theta * eps[t - 1] : 0);
  }
  return xs;
}

export default function TimeSeriesTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Simulation");
  const [model, setModel] = useState<Model>("AR1");
  const [phi, setPhi] = useState(0.7);
  const [phi2, setPhi2] = useState(-0.2);
  const [theta, setTheta] = useState(0.5);
  const [seed, setSeed] = useState(1);
  const [raw, setRaw] = useState("");
  const [valueCol, setValueCol] = useState<string | null>(null);

  // Forecasting Parameters
  const [forecastHorizon, setForecastHorizon] = useState(30);
  const [alpha, setAlpha] = useState(0.4); // Holt level smoothing
  const [beta, setBeta] = useState(0.2);  // Holt trend smoothing

  useRegisterToolState("time-series", { tab, model, phi, phi2, theta, seed, raw, valueCol, forecastHorizon, alpha, beta }, {
    tab: setTab,
    model: setModel,
    phi: setPhi,
    phi2: setPhi2,
    theta: setTheta,
    seed: setSeed,
    raw: setRaw,
    valueCol: setValueCol,
    forecastHorizon: setForecastHorizon,
    alpha: setAlpha,
    beta: setBeta,
  });

  const wsSeries = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);

  const userSeries = useMemo(() => parseNumbers(raw), [raw]);
  const series = useMemo(() => {
    const s = tab === "Workspace" && wsSeries && wsSeries.length >= 4 ? wsSeries :
              tab === "Your Data" && userSeries && userSeries.length >= 4 ? userSeries :
              simulate(model, { phi, phi2, theta }, seed);
    return s;
  }, [tab, wsSeries, userSeries, model, phi, phi2, theta, seed]);

  const ac = useMemo(() => acf(series, Math.min(LAGS, Math.max(2, series.length - 1))), [series]);
  const pac = useMemo(() => pacf(series, Math.min(LAGS, Math.max(2, series.length - 1))), [series]);

  // Holt's linear trend forecasting solver
  const fitHolt = useMemo(() => {
    const nPts = series.length;
    const forecasts = Array(nPts).fill(0);
    if (nPts < 3) return { level: 0, trend: 0, fitted: forecasts, forecastSteps: [], s: 0.1 };

    let L = series[0];
    let T = series[1] - series[0];
    forecasts[0] = L;
    forecasts[1] = L + T;

    const residuals: number[] = [];
    for (let t = 2; t < nPts; t++) {
      const prevL = L;
      const prevT = T;
      L = alpha * series[t] + (1 - alpha) * (prevL + prevT);
      T = beta * (L - prevL) + (1 - beta) * prevT;
      forecasts[t] = L + T;
      residuals.push(series[t] - (prevL + prevT));
    }

    const sResidual = sd(residuals) || 0.1;

    const fSteps: { y: number; ci80: number; ci95: number }[] = [];
    for (let h = 1; h <= forecastHorizon; h++) {
      const yHat = L + h * T;
      const stepVar = sResidual * Math.sqrt(1 + (h - 1) * alpha * alpha);
      fSteps.push({
        y: yHat,
        ci80: 1.28 * stepVar,
        ci95: 1.96 * stepVar
      });
    }

    return { level: L, trend: T, fitted: forecasts, forecastSteps: fSteps, s: sResidual };
  }, [series, alpha, beta, forecastHorizon]);

  const m = mean(series), s = sd(series);
  const r1 = ac[1] ?? 0;
  const stationary = Math.abs(r1) < 0.95;

  // Chart Bounds including forecast confidence bands
  const forecastYVals = fitHolt.forecastSteps.flatMap((f) => [f.y - f.ci95, f.y + f.ci95]);
  const allYVals = [...series, ...forecastYVals];
  const sMin = allYVals.length ? Math.min(...allYVals) - 0.5 : -3;
  const sMax = allYVals.length ? Math.max(...allYVals) + 0.5 : 3;

  const totalLength = series.length + forecastHorizon;
  const tx = (i: number) => PAD + (i / (totalLength - 1)) * (W - 2 * PAD);
  const ty = (v: number) => H * 0.52 - PAD * 0.5 - ((v - sMin) / (sMax - sMin || 1)) * (H * 0.52 - 1.5 * PAD);

  // Traced historical line path
  const seriesPath = series.map((v, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(2)},${ty(v).toFixed(2)}`).join(" ");

  // Traced forecast dashed line path
  const forecastPath = fitHolt.forecastSteps.length > 0
    ? [
        `M${tx(series.length - 1).toFixed(1)},${ty(series[series.length - 1]).toFixed(1)}`,
        ...fitHolt.forecastSteps.map((f, h) => `L${tx(series.length + h).toFixed(1)},${ty(f.y).toFixed(1)}`)
      ].join(" ")
    : "";

  // Helper for rendering forecast shaded polygon confidence bands
  const getBandPath = (ciAttr: "ci80" | "ci95") => {
    const nObs = series.length;
    if (fitHolt.forecastSteps.length === 0) return "";
    
    const lastIdx = nObs - 1;
    const lastX = tx(lastIdx);
    const lastY = ty(series[lastIdx]);
    
    const topPts = fitHolt.forecastSteps.map((f, h) => {
      const idx = lastIdx + h + 1;
      return `${tx(idx).toFixed(1)},${ty(f.y + f[ciAttr]).toFixed(1)}`;
    });
    
    const botPts = [...fitHolt.forecastSteps].reverse().map((f, h) => {
      const revH = fitHolt.forecastSteps.length - h;
      const idx = lastIdx + revH;
      return `${tx(idx).toFixed(1)},${ty(f.y - f[ciAttr]).toFixed(1)}`;
    });
    
    return [
      `${lastX.toFixed(1)},${lastY.toFixed(1)}`,
      ...topPts,
      ...botPts
    ].join(" ");
  };

  // ACF and PACF layout mapping
  const ay = (v: number) => H - PAD - ((v + 1) / 2) * (H * 0.38 - PAD);
  const axACF = (k: number) => PAD + (k / (ac.length - 1)) * (W / 2 - PAD - 15);
  const axPACF = (k: number) => W / 2 + 15 + (k / (pac.length - 1)) * (W / 2 - PAD - 15);
  const ci = 1.96 / Math.sqrt(series.length);

  const interpretation = (() => {
    if (series.length < 8) return null;
    const q = Math.max(2, Math.floor(series.length / 4));
    const firstSlice = series.slice(0, q);
    const lastSlice = series.slice(-q);
    const firstMean = mean(firstSlice);
    const lastMean = mean(lastSlice);
    const drift = lastMean - firstMean;
    const trendLabel =
      Math.abs(drift) < 0.5 * s ? "no clear trend" :
      drift > 0 ? "an upward trend" : "a downward trend";
    let r1Label: string;
    if (Math.abs(r1) < 0.2) r1Label = "weak";
    else if (Math.abs(r1) < 0.5) r1Label = r1 > 0 ? "moderate positive" : "moderate negative";
    else r1Label = r1 > 0 ? "strong positive" : "strong negative";
    
    const fVal = fitHolt.forecastSteps[fitHolt.forecastSteps.length - 1]?.y ?? 0;
    return `Lag-1 ACF r₁=${r1.toFixed(3)} (${r1Label}). Series mean drifted by Δ=${drift.toFixed(2)} (${trendLabel}). Series is ${stationary ? "likely" : "likely not"} stationary (|r₁| ${stationary ? "<" : "≥"} 0.95). Holt's forecast projects a final value of ${fVal.toFixed(2)} at horizon h=${forecastHorizon}.`;
  })();

  return (
    <div className="space-y-6">
      <Tabs tabs={dataset ? ["Workspace", "Simulation", "Your Data"] : ["Simulation", "Your Data"]}
            active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {/* Zero line */}
              <line x1={PAD} y1={ty(0)} x2={W - PAD} y2={ty(0)} stroke="var(--chart-grid)" />
              
              {/* Shaded Forecast confidence bands */}
              {forecastHorizon > 0 && fitHolt.forecastSteps.length > 0 && (
                <>
                  <polygon points={getBandPath("ci95")} fill="var(--chart-accent)" fillOpacity={0.07} />
                  <polygon points={getBandPath("ci80")} fill="var(--chart-accent)" fillOpacity={0.14} />
                </>
              )}

              {/* Observed line */}
              <path d={seriesPath} fill="none" stroke="var(--chart-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Forecast line */}
              {forecastHorizon > 0 && fitHolt.forecastSteps.length > 0 && (
                <path d={forecastPath} fill="none" stroke="#fb923c" strokeWidth={1.8} strokeDasharray="3 3" />
              )}

              <text x={PAD} y={20} fontSize="11" fill="var(--chart-muted)" className="font-semibold">
                {tab === "Simulation" ? `${model} Simulated · n = ${series.length}` : `Observed Series · n = ${series.length}`}
              </text>

              {/* ACF Sub-Chart */}
              <g>
                <line x1={PAD} y1={ay(0)} x2={W / 2 - 15} y2={ay(0)} stroke="var(--chart-axis)" />
                <line x1={PAD} y1={ay(ci)}  x2={W / 2 - 15} y2={ay(ci)}  stroke="#fb923c" strokeDasharray="3 3" strokeWidth={0.8} />
                <line x1={PAD} y1={ay(-ci)} x2={W / 2 - 15} y2={ay(-ci)} stroke="#fb923c" strokeDasharray="3 3" strokeWidth={0.8} />
                {ac.map((v, k) => (
                  <line key={`acf-${k}`} x1={axACF(k)} y1={ay(0)} x2={axACF(k)} y2={ay(v)}
                        stroke={Math.abs(v) > ci ? "#6366f1" : "var(--chart-grid)"} strokeWidth={2.5} strokeLinecap="round" />
                ))}
                <text x={PAD} y={H - 5} fontSize="10" fill="var(--chart-muted)" className="font-semibold">Sample ACF</text>
              </g>

              {/* PACF Sub-Chart */}
              <g>
                <line x1={W / 2 + 15} y1={ay(0)} x2={W - PAD} y2={ay(0)} stroke="var(--chart-axis)" />
                <line x1={W / 2 + 15} y1={ay(ci)}  x2={W - PAD} y2={ay(ci)}  stroke="#fb923c" strokeDasharray="3 3" strokeWidth={0.8} />
                <line x1={W / 2 + 15} y1={ay(-ci)} x2={W - PAD} y2={ay(-ci)} stroke="#fb923c" strokeDasharray="3 3" strokeWidth={0.8} />
                {pac.map((v, k) => (
                  <line key={`pacf-${k}`} x1={axPACF(k)} y1={ay(0)} x2={axPACF(k)} y2={ay(v)}
                        stroke={Math.abs(v) > ci ? "#6366f1" : "var(--chart-grid)"} strokeWidth={2.5} strokeLinecap="round" />
                ))}
                <text x={W / 2 + 15} y={H - 5} fontSize="10" fill="var(--chart-muted)" className="font-semibold">Sample PACF</text>
              </g>
            </svg>
          </Panel>
          <Interpretation text={interpretation} />
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <ColumnPicker label="Series column" value={valueCol} onChange={setValueCol} kind="numeric" />
          )}
          {tab === "Simulation" ? (
            <>
              <Select label="Model" value={model} onChange={(v) => setModel(v as Model)}
                options={[
                  { value: "AR1", label: "AR(1)" },
                  { value: "AR2", label: "AR(2)" },
                  { value: "MA1", label: "MA(1)" },
                  { value: "ARMA", label: "ARMA(1,1)" },
                ]} />
              {(model === "AR1" || model === "AR2" || model === "ARMA") && (
                <Field label="φ (AR parameter)" value={phi.toFixed(2)}>
                  <input type="range" min={-0.95} max={0.95} step={0.01} value={phi} onChange={(e) => setPhi(Number(e.target.value))} className="w-full" />
                </Field>
              )}
              {model === "AR2" && (
                <Field label="φ₂ (Lag-2 AR)" value={phi2.toFixed(2)}>
                  <input type="range" min={-0.95} max={0.95} step={0.01} value={phi2} onChange={(e) => setPhi2(Number(e.target.value))} className="w-full" />
                </Field>
              )}
              {(model === "MA1" || model === "ARMA") && (
                <Field label="θ (MA parameter)" value={theta.toFixed(2)}>
                  <input type="range" min={-0.95} max={0.95} step={0.01} value={theta} onChange={(e) => setTheta(Number(e.target.value))} className="w-full" />
                </Field>
              )}
              <Btn onClick={() => setSeed((s) => s + 1)}>New Simulation Noise</Btn>
            </>
          ) : (
            <>
              <DataTextArea label="Time-series values (in order)" value={raw} onChange={setRaw} rows={5} />
              <SampleDataButton onClick={() => setRaw(simulate("AR1", { phi: 0.75, phi2: 0, theta: 0 }, 1).map((v) => v.toFixed(3)).join(", "))} />
            </>
          )}

          {/* Forecasting Sliders */}
          <div className="border-t pt-3 space-y-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">Forecasting Model (Holt Trend)</div>
            <Field label="Forecast Horizon (h)" value={String(forecastHorizon)}>
              <input type="range" min={0} max={60} step={2} value={forecastHorizon} onChange={(e) => setForecastHorizon(Number(e.target.value))} className="w-full" />
            </Field>
            <Field label="Level smoothing (α)" value={alpha.toFixed(2)}>
              <input type="range" min={0.01} max={0.99} step={0.01} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} className="w-full" />
            </Field>
            <Field label="Trend smoothing (β)" value={beta.toFixed(2)}>
              <input type="range" min={0.01} max={0.99} step={0.01} value={beta} onChange={(e) => setBeta(Number(e.target.value))} className="w-full" />
            </Field>
          </div>

          <Stat label="Mean"     value={m.toFixed(3)} />
          <Stat label="Variance" value={(s * s).toFixed(3)} />
          <Stat label="r(1) ACF" value={r1.toFixed(3)} />
          <Stat label="Stationarity" value={stationary ? "✓ likely" : "✗ unlikely"}
                sub={`|r(1)| ${stationary ? "<" : "≥"} 0.95`} />
          <Stat label="95% CI band" value={`±${ci.toFixed(3)}`} />
        </Panel>
      </div>
    </div>
  );
}
