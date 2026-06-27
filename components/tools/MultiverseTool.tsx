"use client";

import { useMemo, useState } from "react";
import {
  parsePairs, mean, quantile
} from "./shared/stats";
import {
  Tabs, Stat, DataTextArea, SampleDataButton, Panel, Btn, Interpretation, useRegisterToolState
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";
import { useWorker } from "@/hooks/useWorker";

const SAMPLE = `1, 1.6\n1.7, 2.0\n2.4, 2.7\n3.1, 2.9\n3.8, 3.6\n4.5, 3.4\n5.2, 4.5\n5.9, 4.7\n6.6, 5.6\n7.3, 5.3`;

type PathResult = { path: string; pValue: number; slope: number };

export default function MultiverseTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Your Data");
  const [raw, setRaw] = useState(SAMPLE);
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  
  const { run, loading, result } = useWorker<{ xs: number[]; ys: number[]; B: number }, PathResult[]>();

  useRegisterToolState("multiverse-analysis", { tab, raw, xCol, yCol }, {
    tab: setTab, raw: setRaw, xCol: setXCol, yCol: setYCol,
  });

  const parsed = useMemo(() => parsePairs(raw), [raw]);
  const wsData = useMemo(() => {
    if (!dataset || !xCol || !yCol) return null;
    const xs = dataset.columns.find((c) => c.name === xCol);
    const ys = dataset.columns.find((c) => c.name === yCol);
    if (!xs || !ys) return null;
    return { xs: xs.numeric, ys: ys.numeric };
  }, [dataset, xCol, yCol]);

  const data = tab === "Workspace" && wsData 
    ? wsData 
    : { xs: (parsed ?? []).map(p => p.x), ys: (parsed ?? []).map(p => p.y) };

  function runMultiverse() {
    if (data.xs.length < 3) return;
    setHoveredIdx(null);
    run("RUN_MULTIVERSE", { xs: data.xs, ys: data.ys, B: 50 }); 
  }

  // ── Calculate specification curve data ────────────────────────────────
  const specs = useMemo(() => {
    if (!result) return null;
    const pathData: Record<string, { slopes: number[]; pValues: number[] }> = {};
    for (const r of result) {
      if (!pathData[r.path]) pathData[r.path] = { slopes: [], pValues: [] };
      pathData[r.path].slopes.push(r.slope);
      pathData[r.path].pValues.push(r.pValue);
    }

    const list = Object.entries(pathData).map(([path, d]) => {
      const sortedSlopes = [...d.slopes].sort((a, b) => a - b);
      
      const q = (sorted: number[], qVal: number) => {
        const i = (sorted.length - 1) * qVal;
        const lo = Math.floor(i), hi = Math.ceil(i);
        if (lo === hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
      };

      const meanSlope = sortedSlopes.reduce((s, x) => s + x, 0) / sortedSlopes.length;
      const ciLo = q(sortedSlopes, 0.025);
      const ciHi = q(sortedSlopes, 0.975);
      
      const sigCount = d.pValues.filter(p => p < 0.05).length;
      const sigPercent = (sigCount / d.pValues.length) * 100;

      // Decode decisions from path string
      const parts = path.split("_");
      const dropX = parts[0] === "DropOutX";
      const dropY = parts[1] === "DropOutY";
      const logX = parts[2] === "LogX";
      const logY = parts[3] === "LogY";

      return {
        path,
        meanSlope,
        ciLo,
        ciHi,
        sigPercent,
        dropX,
        dropY,
        logX,
        logY,
      };
    });

    // Sort by mean slope ascending
    return list.sort((a, b) => a.meanSlope - b.meanSlope);
  }, [result]);

  const interpretation = result && specs
    ? `Analyzed ${specs.length} different analytical paths (combining outlier handling and log-transformations) with 50 bootstrap resamples each (${result.length} regressions). Hover over specifications to trace how subjective decisions impact the estimated effect.`
    : null;

  // ── SVG Constants ──
  const W = 620, H = 360;
  const PAD_L = 100, PAD_R = 20;

  // X scaling helper
  const getPlotX = (idx: number) => PAD_L + idx * ((W - PAD_L - PAD_R) / 15);

  // Y scaling helper for top chart
  const yBounds = useMemo(() => {
    if (!specs) return { min: -1, max: 1 };
    const los = specs.map(s => s.ciLo);
    const his = specs.map(s => s.ciHi);
    const minVal = Math.min(...los);
    const maxVal = Math.max(...his);
    const margin = (maxVal - minVal || 1) * 0.1;
    return { min: minVal - margin, max: maxVal + margin };
  }, [specs]);

  const getPlotY = (val: number) => 155 - ((val - yBounds.min) / (yBounds.max - yBounds.min || 1)) * 125;
  const getRowY = (rowIdx: number) => 195 + rowIdx * 19;

  const decisionLanes = [
    { label: "Outliers X: Keep", test: (s: any) => !s.dropX },
    { label: "Outliers X: Drop", test: (s: any) => s.dropX },
    { label: "Outliers Y: Keep", test: (s: any) => !s.dropY },
    { label: "Outliers Y: Drop", test: (s: any) => s.dropY },
    { label: "Transform X: Lin", test: (s: any) => !s.logX },
    { label: "Transform X: Log", test: (s: any) => s.logX },
    { label: "Transform Y: Lin", test: (s: any) => !s.logY },
    { label: "Transform Y: Log", test: (s: any) => s.logY },
  ];

  const hoveredSpec = specs && hoveredIdx !== null ? specs[hoveredIdx] : null;

  return (
    <div className="space-y-6">
      <Tabs tabs={dataset ? ["Workspace", "Your Data"] : ["Your Data"]} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            {!specs ? (
              <div className="flex flex-col items-center justify-center min-h-[360px] text-neutral-400 p-12 text-center">
                <div className="mb-4 text-3xl">🌿</div>
                <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">Garden of Forking Paths</h3>
                <p className="text-sm max-w-md">Run a multiverse analysis to explore the robustness of your findings against decisions like outlier screening and functional transformation.</p>
              </div>
            ) : (
              <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                  {/* Top Chart Grid Line (y=0 indicator) */}
                  {yBounds.min < 0 && yBounds.max > 0 && (
                    <line x1={PAD_L} y1={getPlotY(0)} x2={W - PAD_R} y2={getPlotY(0)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  )}

                  {/* Horizontal dividers for lanes */}
                  {decisionLanes.map((_, rIdx) => (
                    <line key={rIdx} x1={PAD_L} y1={getRowY(rIdx)} x2={W - PAD_R} y2={getRowY(rIdx)} stroke="var(--chart-grid)" strokeOpacity={0.4} />
                  ))}

                  {/* Vertical Hover Highlight Line */}
                  {hoveredIdx !== null && (
                    <line x1={getPlotX(hoveredIdx)} y1={20} x2={getPlotX(hoveredIdx)} y2={H - 20} stroke="#fb923c" strokeWidth={1.5} strokeDasharray="2 2" strokeOpacity={0.65} />
                  )}

                  {/* Specification Curve Rendering */}
                  {specs.map((s, i) => {
                    const cx = getPlotX(i);
                    const cy = getPlotY(s.meanSlope);
                    const yLo = getPlotY(s.ciLo);
                    const yHi = getPlotY(s.ciHi);

                    const color = s.sigPercent > 80 ? "#22c55e" : s.sigPercent > 0 ? "#f97316" : "#a3a3a3";

                    return (
                      <g key={s.path} 
                         className="cursor-pointer"
                         onMouseEnter={() => setHoveredIdx(i)}
                         onMouseLeave={() => setHoveredIdx(null)}>
                        {/* 95% Bootstrap CI Error Bar */}
                        <line x1={cx} y1={yLo} x2={cx} y2={yHi} stroke={color} strokeWidth={1} strokeOpacity={0.6} />

                        {/* Mean Slope Point */}
                        <circle cx={cx} cy={cy} r={3.5} fill={color} />

                        {/* Faint vertical connector to decision dots */}
                        <line x1={cx} y1={160} x2={cx} y2={188} stroke="var(--chart-grid)" strokeWidth={0.5} strokeOpacity={0.3} />

                        {/* Decision matrix dots */}
                        {decisionLanes.map((lane, rIdx) => {
                          const active = lane.test(s);
                          if (!active) return null;
                          return (
                            <circle key={rIdx} cx={cx} cy={getRowY(rIdx)} r={2.5} fill={color} />
                          );
                        })}

                        {/* Overlay transparent rect for easier hover targeting */}
                        <rect x={cx - 10} y={15} width={20} height={H - 30} fill="transparent" />
                      </g>
                    );
                  })}

                  {/* Decision Lane Labels */}
                  {decisionLanes.map((lane, rIdx) => (
                    <text key={rIdx} x={PAD_L - 8} y={getRowY(rIdx) + 3} textAnchor="end" fontSize="9" fill="var(--chart-muted)" fontWeight={500}>
                      {lane.label}
                    </text>
                  ))}

                  {/* Axis indicators */}
                  <text x={PAD_L - 8} y={30} textAnchor="end" fontSize="9" fill="var(--chart-muted)" fontStyle="italic">β (slope)</text>
                  <line x1={PAD_L} y1={20} x2={PAD_L} y2={165} stroke="var(--chart-axis)" />
                  <line x1={PAD_L} y1={185} x2={PAD_L} y2={340} stroke="var(--chart-axis)" />
                </svg>
              </div>
            )}
          </Panel>
          <Interpretation text={interpretation} />
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset ? (
            <>
              <ColumnPicker label="X (Independent)" value={xCol} onChange={setXCol} kind="numeric" />
              <ColumnPicker label="Y (Dependent)" value={yCol} onChange={setYCol} kind="numeric" />
            </>
          ) : (
            <>
              <DataTextArea label="Data (X, Y)" value={raw} onChange={setRaw} rows={8} />
              <SampleDataButton onClick={() => setRaw(SAMPLE)} />
            </>
          )}
          
          <Btn primary onClick={runMultiverse} disabled={loading}>
            {loading ? "Simulating Multiverse..." : "Run Analysis"}
          </Btn>

          {/* Hover Statistics Display */}
          {specs && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-4 space-y-4">
              {hoveredSpec ? (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Hovered Path</div>
                    <div className="font-mono text-xs font-semibold break-all leading-tight text-orange-600 dark:text-orange-400">
                      {hoveredSpec.path.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Mean slope" value={hoveredSpec.meanSlope.toFixed(4)} />
                    <Stat label="Robustness" value={`${hoveredSpec.sigPercent.toFixed(0)}%`} sub="trials p < 0.05" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">95% Bootstrap CI</div>
                    <div className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                      [{hoveredSpec.ciLo.toFixed(4)}, {hoveredSpec.ciHi.toFixed(4)}]
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-2">Multiverse Summary</div>
                  {(() => {
                    const total = specs.length;
                    const robust = specs.filter(s => s.sigPercent > 80).length;
                    const fragile = specs.filter(s => s.sigPercent > 0 && s.sigPercent <= 80).length;
                    const nonSig = specs.filter(s => s.sigPercent === 0).length;
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-500">Robust Paths (&gt;80% sig)</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">{robust} / {total}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-500">Fragile Paths (&lt;80% sig)</span>
                          <span className="font-semibold text-orange-500 dark:text-orange-400">{fragile} / {total}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-500">Non-Significant Paths</span>
                          <span className="font-semibold text-neutral-600 dark:text-neutral-400">{nonSig} / {total}</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
          
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
            <p><strong>Simulated Decisions:</strong></p>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>Outliers X (Keep All vs. Drop top/bottom 2.5%)</li>
              <li>Outliers Y (Keep All vs. Drop top/bottom 2.5%)</li>
              <li>Functional Form X (Linear vs. Log-scale)</li>
              <li>Functional Form Y (Linear vs. Log-scale)</li>
            </ul>
            <p className="pt-2 text-[10px] uppercase tracking-wide opacity-60">800 total bootstrap regressions</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
