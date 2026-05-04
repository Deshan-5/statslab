"use client";

import { useMemo, useRef, useState } from "react";
import {
  ols,
  parsePairs,
  mean,
  normalInv,
} from "./shared/stats";
import {
  Tabs,
  Stat,
  DataTextArea,
  NumberInput,
  Panel,
  Btn,
  SampleDataButton,
  StepByStep,
  Formula,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const VIEW_W = 560,
  VIEW_H = 380,
  PAD_L = 56,
  PAD_R = 24,
  PAD_T = 24,
  PAD_B = 48;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

const RES_H = 160;

const SAMPLE_DATA = `1.0, 1.6
1.7, 2.0
2.4, 2.7
3.1, 2.9
3.8, 3.6
4.5, 3.4
5.2, 4.5
5.9, 4.7
6.6, 5.6
7.3, 5.3
8.0, 6.4
8.7, 6.9`;

export default function LinearRegressionTool() {
  const { dataset, isSelected } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Interactive");
  const [rawData, setRawData] = useState("");
  const [points, setPoints] = useState<{ x: number; y: number }[]>([
    { x: 1.0, y: 1.6 }, { x: 1.7, y: 2.0 }, { x: 2.4, y: 2.7 },
    { x: 3.1, y: 2.9 }, { x: 3.8, y: 3.6 }, { x: 4.5, y: 3.4 },
    { x: 5.2, y: 4.5 }, { x: 5.9, y: 4.7 }, { x: 6.6, y: 5.6 },
    { x: 7.3, y: 5.3 }, { x: 8.0, y: 6.4 }, { x: 8.7, y: 6.9 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [predictX, setPredictX] = useState<string>("");
  const [showResiduals, setShowResiduals] = useState(false);
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const parsedPairs = useMemo(() => parsePairs(rawData), [rawData]);

  const wsPoints: { x: number; y: number; row?: number }[] = useMemo(() => {
    if (!dataset || !xCol || !yCol) return [];
    const xC = dataset.columns.find((c) => c.name === xCol);
    const yC = dataset.columns.find((c) => c.name === yCol);
    if (!xC || !yC) return [];
    const out: { x: number; y: number; row: number }[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = xC.values[i], yv = yC.values[i];
      const xn = typeof xv === "number" ? xv : Number(xv);
      const yn = typeof yv === "number" ? yv : Number(yv);
      if (!isNaN(xn) && !isNaN(yn) && xv !== null && yv !== null) {
        out.push({ x: xn, y: yn, row: i });
      }
    }
    return out;
  }, [dataset, xCol, yCol]);

  const activePoints: { x: number; y: number; row?: number }[] =
    tab === "Workspace" ? wsPoints :
    tab === "Data Input" && parsedPairs ? parsedPairs.map((p) => ({ x: p.x, y: p.y })) :
    points;

  // Domain
  const xs = activePoints.map((p) => p.x);
  const ys = activePoints.map((p) => p.y);
  const xMin = xs.length ? Math.min(...xs) - 1 : 0;
  const xMax = xs.length ? Math.max(...xs) + 1 : 10;
  const yMin = ys.length ? Math.min(...ys) - 1 : 0;
  const yMax = ys.length ? Math.max(...ys) + 1 : 8;

  const sx = (x: number) => PAD_L + ((x - xMin) / (xMax - xMin)) * PLOT_W;
  const sy = (y: number) => PAD_T + (1 - (y - yMin) / (yMax - yMin)) * PLOT_H;
  const invX = (px: number) => xMin + ((px - PAD_L) / PLOT_W) * (xMax - xMin);
  const invY = (py: number) => yMin + (1 - (py - PAD_T) / PLOT_H) * (yMax - yMin);

  // Regression
  const reg = useMemo(() => {
    if (activePoints.length < 2) return null;
    return ols(activePoints.map((p) => p.x), activePoints.map((p) => p.y));
  }, [activePoints]);

  // Prediction
  const predXNum = Number(predictX);
  const prediction = reg && !isNaN(predXNum) && predictX.trim() !== ""
    ? {
        yhat: reg.intercept + reg.slope * predXNum,
        se: Math.sqrt(
          (reg.residuals.reduce((s, r) => s + r * r, 0) /
            (activePoints.length - 2)) *
            (1 +
              1 / activePoints.length +
              (predXNum - mean(xs)) ** 2 /
                xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0))
        ),
      }
    : null;

  const toSvg = (clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * VIEW_W;
    const py = ((clientY - r.top) / r.height) * VIEW_H;
    return { x: invX(px), y: invY(py) };
  };

  const addPoint = () => {
    const x = Number(newX), y = Number(newY);
    if (!isNaN(x) && !isNaN(y) && newX.trim() && newY.trim()) {
      setPoints([...points, { x, y }]);
      setNewX(""); setNewY("");
    }
  };

  const removePoint = (idx: number) => {
    setPoints(points.filter((_, i) => i !== idx));
  };

  // Residual plot scale
  const resYMax = reg ? Math.max(1, ...reg.residuals.map((r) => Math.abs(r))) * 1.2 : 1;
  const resSy = (r: number) => PAD_T + (1 - (r + resYMax) / (2 * resYMax)) * (RES_H - PAD_T - 24);

  // X ticks
  const xTicks = [];
  const xStep = Math.max(1, Math.ceil((xMax - xMin) / 8));
  for (let t = Math.ceil(xMin); t <= Math.floor(xMax); t += xStep) xTicks.push(t);
  const yTicks = [];
  const yStep = Math.max(1, Math.ceil((yMax - yMin) / 6));
  for (let t = Math.ceil(yMin); t <= Math.floor(yMax); t += yStep) yTicks.push(t);

  return (
    <div className="space-y-6">
      <Tabs
        tabs={dataset ? ["Workspace", "Interactive", "Data Input"] : ["Interactive", "Data Input"]}
        active={tab} onChange={setTab}
      />

      {/* Main scatter plot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-auto select-none"
              style={{ touchAction: "none" }}
              onPointerMove={(e) => {
                if (dragging === null || tab !== "Interactive") return;
                const c = toSvg(e.clientX, e.clientY);
                if (c) {
                  const next = [...points];
                  next[dragging] = c;
                  setPoints(next);
                }
              }}
              onPointerUp={() => setDragging(null)}
              onPointerLeave={() => setDragging(null)}
              onClick={(e) => {
                if (tab !== "Interactive" || dragging !== null) return;
                const c = toSvg(e.clientX, e.clientY);
                if (c && c.x >= xMin && c.x <= xMax && c.y >= yMin && c.y <= yMax) {
                  setPoints([...points, c]);
                }
              }}
            >
              {/* Grid */}
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VIEW_H - PAD_B} stroke="var(--chart-axis)" />
              <line x1={PAD_L} y1={VIEW_H - PAD_B} x2={VIEW_W - PAD_R} y2={VIEW_H - PAD_B} stroke="var(--chart-axis)" />
              {yTicks.map((y) => (
                <g key={`gy-${y}`}>
                  <line x1={PAD_L} y1={sy(y)} x2={VIEW_W - PAD_R} y2={sy(y)} stroke="var(--chart-grid)" />
                  <text x={PAD_L - 8} y={sy(y) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{y}</text>
                </g>
              ))}
              {xTicks.map((x) => (
                <g key={`gx-${x}`}>
                  <line x1={sx(x)} y1={PAD_T} x2={sx(x)} y2={VIEW_H - PAD_B} stroke="var(--chart-grid)" />
                  <text x={sx(x)} y={VIEW_H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">{x}</text>
                </g>
              ))}

              {/* Regression line */}
              {reg && (
                <line
                  x1={sx(xMin)} y1={sy(reg.intercept + reg.slope * xMin)}
                  x2={sx(xMax)} y2={sy(reg.intercept + reg.slope * xMax)}
                  stroke="var(--chart-ink)" strokeWidth={2} strokeLinecap="round"
                />
              )}

              {/* Residual lines */}
              {reg && showResiduals && activePoints.map((p, i) => (
                <line
                  key={`res-${i}`}
                  x1={sx(p.x)} y1={sy(p.y)}
                  x2={sx(p.x)} y2={sy(reg.fitted[i])}
                  stroke="#dc2626" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
                />
              ))}

              {/* Prediction point */}
              {prediction && (
                <>
                  <line x1={sx(predXNum)} y1={PAD_T} x2={sx(predXNum)} y2={VIEW_H - PAD_B}
                    stroke="#2563eb" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
                  <circle cx={sx(predXNum)} cy={sy(prediction.yhat)} r={6}
                    fill="#2563eb" stroke="#fff" strokeWidth={2} />
                </>
              )}

              {/* Points */}
              {activePoints.map((p, i) => {
                const sel = p.row !== undefined && isSelected(p.row);
                return (
                  <circle
                    key={i}
                    cx={sx(p.x)} cy={sy(p.y)}
                    r={dragging === i ? 8 : sel ? 6.5 : tab === "Workspace" ? 3.5 : 5.5}
                    fill={sel ? "#fb923c" : i === 0 && tab === "Interactive" ? "#fb923c" : "#171717"}
                    fillOpacity={0.85}
                    stroke="#fff" strokeWidth={1.5}
                    style={{ cursor: tab === "Interactive" ? (dragging === i ? "grabbing" : "grab") : "default" }}
                    onPointerDown={(e) => {
                      if (tab !== "Interactive") return;
                      e.preventDefault(); e.stopPropagation();
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                      setDragging(i);
                    }}
                    onContextMenu={(e) => {
                      if (tab !== "Interactive") return;
                      e.preventDefault();
                      removePoint(i);
                    }}
                  />
                );
              })}

              {/* Readout */}
              {reg && (
                <g>
                  <rect x={VIEW_W - PAD_R - 190} y={PAD_T + 6} width={182} height={48} rx={10}
                    fill="var(--chart-bg)" stroke="var(--chart-axis)" />
                  <text x={VIEW_W - PAD_R - 178} y={PAD_T + 24} fontSize="11" fill="var(--chart-muted)">
                    ŷ = {reg.slope.toFixed(4)}·x + {reg.intercept.toFixed(4)}
                  </text>
                  <text x={VIEW_W - PAD_R - 178} y={PAD_T + 42} fontSize="11" fill="var(--chart-muted)">
                    R² = {reg.r2.toFixed(4)} · n = {activePoints.length}
                  </text>
                </g>
              )}

              {/* Click hint */}
              {tab === "Interactive" && (
                <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                  Click to add points · Drag to move · Right-click to remove
                </text>
              )}
            </svg>
          </Panel>

          {/* Residual plot */}
          {reg && showResiduals && (
            <Panel>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Residuals vs Fitted</div>
              <svg viewBox={`0 0 ${VIEW_W} ${RES_H}`} className="w-full h-auto">
                <line x1={PAD_L} y1={resSy(0)} x2={VIEW_W - PAD_R} y2={resSy(0)}
                  stroke="var(--chart-axis)" strokeDasharray="4 4" />
                {activePoints.map((p, i) => (
                  <circle key={i} cx={sx(reg.fitted[i])} cy={resSy(reg.residuals[i])}
                    r={4} fill="#dc2626" fillOpacity={0.6} stroke="#fff" strokeWidth={1} />
                ))}
              </svg>
            </Panel>
          )}

          {/* Diagnostics: Q-Q plot + Cook's distance + summary */}
          {reg && showResiduals && activePoints.length >= 4 && (() => {
            const DIAG_W = 480;
            const DIAG_H = 200;
            const D_PAD_L = 48;
            const D_PAD_R = 16;
            const D_PAD_T = 18;
            const D_PAD_B = 32;
            const D_PLOT_W = DIAG_W - D_PAD_L - D_PAD_R;
            const D_PLOT_H = DIAG_H - D_PAD_T - D_PAD_B;

            const n = activePoints.length;
            const residuals = reg.residuals;
            const rMean = mean(residuals);
            const rVar = residuals.reduce((s, r) => s + (r - rMean) ** 2, 0) / Math.max(1, n - 1);
            const rSD = Math.sqrt(rVar) || 1;

            // Q-Q: standardized residuals sorted, paired with theoretical quantiles
            const stdResid = residuals.map((r) => (r - rMean) / rSD);
            const sortedStd = [...stdResid].sort((a, b) => a - b);
            const theo: number[] = [];
            for (let i = 0; i < n; i++) {
              const pProb = (i + 0.5) / n;
              theo.push(normalInv(pProb));
            }

            const qAbs = Math.max(
              Math.abs(sortedStd[0] ?? 0),
              Math.abs(sortedStd[n - 1] ?? 0),
              Math.abs(theo[0] ?? 0),
              Math.abs(theo[n - 1] ?? 0),
              1,
            ) * 1.1;

            const qSx = (v: number) => D_PAD_L + ((v + qAbs) / (2 * qAbs)) * D_PLOT_W;
            const qSy = (v: number) => D_PAD_T + (1 - (v + qAbs) / (2 * qAbs)) * D_PLOT_H;

            // Q-Q correlation (Filliben-style normality indicator)
            const tMean = mean(theo);
            const sMean = mean(sortedStd);
            let num = 0, dT = 0, dS = 0;
            for (let i = 0; i < n; i++) {
              num += (theo[i] - tMean) * (sortedStd[i] - sMean);
              dT += (theo[i] - tMean) ** 2;
              dS += (sortedStd[i] - sMean) ** 2;
            }
            const qqR = dT > 0 && dS > 0 ? num / Math.sqrt(dT * dS) : 0;
            const looksNormal = qqR > 0.97;

            // Cook's distance
            const xBar = mean(xs);
            const sxx = xs.reduce((s, x) => s + (x - xBar) ** 2, 0) || 1;
            const ssRes = residuals.reduce((s, r) => s + r * r, 0);
            const p = 2;
            const mse = ssRes / Math.max(1, n - p);
            const leverages = activePoints.map((pt) => 1 / n + ((pt.x - xBar) ** 2) / sxx);
            const cooks = activePoints.map((_, i) => {
              const h = leverages[i];
              const denom = (1 - h) * (1 - h);
              if (denom <= 0 || mse <= 0) return 0;
              return ((residuals[i] * residuals[i]) / (p * mse)) * (h / denom);
            });
            const cookThresh = 4 / n;
            const cookMax = Math.max(cookThresh * 1.2, ...cooks, 1e-9);
            const highCount = cooks.filter((d) => d > cookThresh).length;
            const maxCook = cooks.reduce((m, d) => Math.max(m, d), 0);

            const cSx = (i: number) => D_PAD_L + ((i + 0.5) / n) * D_PLOT_W;
            const cBarW = Math.max(2, (D_PLOT_W / n) * 0.7);
            const cSy = (v: number) => D_PAD_T + (1 - v / cookMax) * D_PLOT_H;

            // Reference line endpoints for Q-Q (y = x clipped to plot range)
            const refLo = -qAbs;
            const refHi = qAbs;

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Panel>
                  <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Q-Q Plot (Residuals)</div>
                  <svg viewBox={`0 0 ${DIAG_W} ${DIAG_H}`} className="w-full h-auto">
                    <line x1={D_PAD_L} y1={D_PAD_T} x2={D_PAD_L} y2={DIAG_H - D_PAD_B} stroke="var(--chart-axis)" />
                    <line x1={D_PAD_L} y1={DIAG_H - D_PAD_B} x2={DIAG_W - D_PAD_R} y2={DIAG_H - D_PAD_B} stroke="var(--chart-axis)" />
                    {/* y = x reference */}
                    <line
                      x1={qSx(refLo)} y1={qSy(refLo)}
                      x2={qSx(refHi)} y2={qSy(refHi)}
                      stroke="var(--chart-ink)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7}
                    />
                    {sortedStd.map((s, i) => (
                      <circle key={i} cx={qSx(theo[i])} cy={qSy(s)}
                        r={3.5} fill="#2563eb" fillOpacity={0.7} stroke="#fff" strokeWidth={1} />
                    ))}
                    <text x={DIAG_W / 2} y={DIAG_H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                      Theoretical quantiles
                    </text>
                    <text x={12} y={DIAG_H / 2} textAnchor="middle" fontSize="10" fill="var(--chart-muted)"
                      transform={`rotate(-90 12 ${DIAG_H / 2})`}>
                      Sample quantiles
                    </text>
                  </svg>
                </Panel>

                <Panel>
                  <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Cook&rsquo;s Distance</div>
                  <svg viewBox={`0 0 ${DIAG_W} ${DIAG_H}`} className="w-full h-auto">
                    <line x1={D_PAD_L} y1={D_PAD_T} x2={D_PAD_L} y2={DIAG_H - D_PAD_B} stroke="var(--chart-axis)" />
                    <line x1={D_PAD_L} y1={DIAG_H - D_PAD_B} x2={DIAG_W - D_PAD_R} y2={DIAG_H - D_PAD_B} stroke="var(--chart-axis)" />
                    {/* Threshold line 4/n */}
                    <line
                      x1={D_PAD_L} y1={cSy(cookThresh)}
                      x2={DIAG_W - D_PAD_R} y2={cSy(cookThresh)}
                      stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" opacity={0.7}
                    />
                    <text x={DIAG_W - D_PAD_R - 4} y={cSy(cookThresh) - 4} textAnchor="end"
                      fontSize="9" fill="#dc2626">4/n</text>
                    {cooks.map((d, i) => {
                      const high = d > cookThresh;
                      const yTop = cSy(d);
                      const yBase = cSy(0);
                      return (
                        <rect key={i}
                          x={cSx(i) - cBarW / 2} y={yTop}
                          width={cBarW} height={Math.max(0, yBase - yTop)}
                          fill={high ? "#dc2626" : "#171717"} fillOpacity={high ? 0.85 : 0.7}
                        />
                      );
                    })}
                    <text x={DIAG_W / 2} y={DIAG_H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                      Observation index
                    </text>
                    <text x={12} y={DIAG_H / 2} textAnchor="middle" fontSize="10" fill="var(--chart-muted)"
                      transform={`rotate(-90 12 ${DIAG_H / 2})`}>
                      D
                    </text>
                  </svg>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider">Max D</div>
                      <div className="font-mono text-neutral-900 dark:text-neutral-100">{maxCook.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider">High influence</div>
                      <div className="font-mono text-neutral-900 dark:text-neutral-100">{highCount} / {n}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider">Normality (r)</div>
                      <div className="font-mono">
                        <span className={looksNormal ? "text-emerald-600" : "text-amber-600"}>
                          {qqR.toFixed(3)} {looksNormal ? "normal" : "non-normal"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            );
          })()}
        </div>

        {/* Controls panel */}
        <div>
          <Panel className="space-y-4">
            {tab === "Workspace" && dataset && (
              <>
                <ColumnPicker label="X column" value={xCol} onChange={setXCol} />
                <ColumnPicker label="Y column" value={yCol} onChange={setYCol} />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Selected rows from Scatter highlight here automatically.
                </p>
              </>
            )}
            {tab === "Interactive" && (
              <>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <NumberInput label="X" value={Number(newX) || 0} onChange={(v) => setNewX(String(v))} step={0.1} />
                  </div>
                  <div className="flex-1">
                    <NumberInput label="Y" value={Number(newY) || 0} onChange={(v) => setNewY(String(v))} step={0.1} />
                  </div>
                </div>
                <Btn onClick={addPoint}>Add point</Btn>

                {/* Points table */}
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-neutral-500 uppercase tracking-wider">
                        <th className="text-left py-1">#</th>
                        <th className="text-right py-1">X</th>
                        <th className="text-right py-1">Y</th>
                        <th className="text-right py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((p, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          <td className="py-1 text-neutral-400">{i + 1}</td>
                          <td className="py-1 text-right">{p.x.toFixed(2)}</td>
                          <td className="py-1 text-right">{p.y.toFixed(2)}</td>
                          <td className="py-1 text-right">
                            <button onClick={() => removePoint(i)} className="text-red-400 hover:text-red-600">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Btn onClick={() => setPoints([])}>Clear all</Btn>
              </>
            )}

            {tab === "Data Input" && (
              <>
                <DataTextArea
                  label="X, Y pairs (one per line)"
                  value={rawData}
                  onChange={setRawData}
                  placeholder="1.0, 1.6&#10;2.0, 2.3&#10;3.0, 3.1"
                  rows={5}
                />
                <SampleDataButton onClick={() => setRawData(SAMPLE_DATA)} />
                {rawData && !parsedPairs && (
                  <div className="text-xs text-red-500">Could not parse data. Use &ldquo;x, y&rdquo; per line.</div>
                )}
              </>
            )}

            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
              <input
                type="checkbox" checked={showResiduals}
                onChange={(e) => setShowResiduals(e.target.checked)}
                className="rounded"
              />
              Show residuals
            </label>

            {/* Results */}
            {reg && (
              <>
                <div className="border-t border-neutral-200 pt-4 space-y-3">
                  <Stat label="Slope (β₁)" value={reg.slope.toFixed(6)} sub={`SE = ${reg.slopeStdErr.toFixed(4)}, p = ${reg.pSlope.toFixed(4)}`} />
                  <Stat label="Intercept (β₀)" value={reg.intercept.toFixed(6)} sub={`SE = ${reg.interceptStdErr.toFixed(4)}, p = ${reg.pIntercept.toFixed(4)}`} />
                  <Stat label="R²" value={reg.r2.toFixed(6)} />
                  <Stat label="Adjusted R²" value={reg.adjR2.toFixed(6)} />
                  <Stat label="n" value={String(activePoints.length)} />
                </div>

                <Formula text={`ŷ = ${reg.intercept.toFixed(4)} + ${reg.slope.toFixed(4)} · x`} />

                <StepByStep steps={[
                  { label: "x̄", value: mean(xs).toFixed(4) },
                  { label: "ȳ", value: mean(ys).toFixed(4) },
                  { label: "Σ(xᵢ−x̄)(yᵢ−ȳ)", value: xs.reduce((s, x, i) => s + (x - mean(xs)) * (ys[i] - mean(ys)), 0).toFixed(4) },
                  { label: "Σ(xᵢ−x̄)²", value: xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0).toFixed(4) },
                  { label: "β₁ = Σxy / Σx²", value: reg.slope.toFixed(6) },
                  { label: "β₀ = ȳ − β₁x̄", value: reg.intercept.toFixed(6) },
                  { label: "SS_tot", value: ys.reduce((s, y) => s + (y - mean(ys)) ** 2, 0).toFixed(4) },
                  { label: "SS_res", value: reg.residuals.reduce((s, r) => s + r * r, 0).toFixed(4) },
                  { label: "R² = 1 − SS_res/SS_tot", value: reg.r2.toFixed(6) },
                ]} />
              </>
            )}

            {/* Prediction */}
            {reg && (
              <div className="border-t border-neutral-200 pt-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Prediction</div>
                <NumberInput label="Enter x" value={predXNum || 0} onChange={(v) => setPredictX(String(v))} step={0.1} />
                {prediction && (
                  <>
                    <Stat label="ŷ" value={prediction.yhat.toFixed(4)} />
                    <Stat label="95% PI" value={`[${(prediction.yhat - 1.96 * prediction.se).toFixed(4)}, ${(prediction.yhat + 1.96 * prediction.se).toFixed(4)}]`} />
                  </>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
