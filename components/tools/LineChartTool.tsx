"use client";

import { useMemo, useState } from "react";
import { parseNumbers, mean, sd } from "./shared/stats";
import {
  Tabs, DataTextArea, SampleDataButton, Panel, Btn, Field, Interpretation,
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 36;
const COLORS = ["#6366f1", "#fb923c", "#0ea5e9", "#16a34a"];

type Series = { name: string; raw: string };

const SAMPLE: Series[] = [
  { name: "Control",   raw: "4.1, 4.3, 4.0, 4.2, 4.5, 4.7, 4.6, 4.8, 4.9, 5.0, 5.1, 5.0, 4.9, 4.8, 5.0, 5.1, 5.2, 5.3, 5.2, 5.4" },
  { name: "Treatment", raw: "4.0, 4.4, 4.6, 4.8, 5.1, 5.4, 5.6, 5.8, 5.9, 6.0, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.6, 6.7, 6.8, 6.9" },
];

function movingAverage(arr: number[], k: number) {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const lo = Math.max(0, i - Math.floor(k / 2));
    const hi = Math.min(arr.length, i + Math.ceil(k / 2));
    const slice = arr.slice(lo, hi);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

export default function LineChartTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Your Data");
  const [series, setSeries] = useState<Series[]>(SAMPLE);
  const [showMA, setShowMA] = useState(false);
  const [maWindow, setMaWindow] = useState(5);
  const [wsCols, setWsCols] = useState<(string | null)[]>([null, null]);

  useRegisterToolState("line-chart", { tab, showMA, maWindow }, { tab: setTab, showMA: setShowMA, maWindow: setMaWindow });
  const wsValid = useMemo(() => {
    if (!dataset) return [];
    const out: { name: string; vals: number[] }[] = [];
    for (const colName of wsCols) {
      if (!colName) continue;
      const c = dataset.columns.find((c) => c.name === colName);
      if (!c) continue;
      const vals: number[] = [];
      for (const v of c.values) {
        const n = typeof v === "number" ? v : Number(v);
        if (v !== null && !isNaN(n)) vals.push(n);
      }
      if (vals.length > 1) out.push({ name: colName, vals });
    }
    return out;
  }, [dataset, wsCols]);

  const manualValid = useMemo(() =>
    series.map((s) => ({ name: s.name, vals: parseNumbers(s.raw) ?? [] }))
          .filter((s) => s.vals.length > 1),
    [series],
  );

  const valid = tab === "Workspace" ? wsValid : manualValid;

  const interpretation = useMemo(() => {
    if (valid.length === 0) return null;
    const parts = valid.map((s) => {
      const k = Math.max(1, Math.floor(s.vals.length / 4));
      const head = s.vals.slice(0, k);
      const tail = s.vals.slice(-k);
      const headMean = mean(head);
      const tailMean = mean(tail);
      const range = Math.max(...s.vals) - Math.min(...s.vals);
      const delta = tailMean - headMean;
      const flatThresh = Math.max(0.05 * (range || 1), 1e-9);
      let dir: string;
      if (Math.abs(delta) <= flatThresh) dir = "is flat";
      else if (delta > 0) dir = `trends upward (${headMean.toFixed(2)} → ${tailMean.toFixed(2)})`;
      else dir = `trends downward (${headMean.toFixed(2)} → ${tailMean.toFixed(2)})`;
      return `${s.name} ${dir}`;
    });
    return `Series ${parts.join("; ")}.`;
  }, [valid]);

  const all = valid.flatMap((s) => s.vals);
  if (!all.length) all.push(0, 1);
  const yMin = Math.min(...all) - 0.5, yMax = Math.max(...all) + 0.5;
  const xMax = Math.max(2, ...valid.map((s) => s.vals.length));
  const sx = (i: number) => PAD + (i / (xMax - 1)) * (W - 2 * PAD);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - 2 * PAD);
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(2)},${sy(v).toFixed(2)}`).join(" ");

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!valid.length) return;
    const svg = e.currentTarget;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse() || new DOMMatrix());
    const x = svgPoint.x;
    const y = svgPoint.y;

    if (x >= PAD && x <= W - PAD) {
      const pct = (x - PAD) / (W - 2 * PAD);
      const idx = Math.min(xMax - 1, Math.max(0, Math.round(pct * (xMax - 1))));
      setHoverIdx(idx);
      setHoverPos({ x, y });
    } else {
      setHoverIdx(null);
      setHoverPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    setHoverPos(null);
  };

  function setS(i: number, patch: Partial<Series>) {
    setSeries(series.map((s, k) => k === i ? { ...s, ...patch } : s));
  }

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto cursor-crosshair select-none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {valid.map((s, i) => (
                <g key={i}>
                  <path d={path(s.vals)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  {showMA && s.vals.length >= maWindow && (
                    <path d={path(movingAverage(s.vals, maWindow))} fill="none" stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2.5} strokeDasharray="6 3" opacity={0.65} />
                  )}
                </g>
              ))}
              <g transform={`translate(${PAD + 10}, ${PAD + 10})`}>
                {valid.map((s, i) => (
                  <g key={i} transform={`translate(0, ${i * 18})`}>
                    <line x1={0} y1={6} x2={20} y2={6} stroke={COLORS[i % COLORS.length]} strokeWidth={2.2} />
                    <text x={26} y={10} fontSize="11" fill="var(--chart-ink)">{s.name}</text>
                  </g>
                ))}
              </g>

              {/* Crosshair & Tooltip Overlay */}
              {hoverIdx !== null && (
                <g>
                  <line
                    x1={sx(hoverIdx)}
                    y1={PAD}
                    x2={sx(hoverIdx)}
                    y2={H - PAD}
                    stroke="var(--chart-axis)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {valid.map((s, i) => {
                    const val = s.vals[hoverIdx];
                    if (val === undefined) return null;
                    return (
                      <circle
                        key={i}
                        cx={sx(hoverIdx)}
                        cy={sy(val)}
                        r={4.5}
                        fill={COLORS[i % COLORS.length]}
                        stroke="white"
                        strokeWidth={1.5}
                        className="shadow-sm"
                      />
                    );
                  })}
                  {(() => {
                    const tooltipW = 140;
                    const tooltipH = 20 + valid.length * 16;
                    const tooltipX = sx(hoverIdx) + tooltipW + 10 > W - PAD ? sx(hoverIdx) - tooltipW - 10 : sx(hoverIdx) + 10;
                    const tooltipY = Math.max(PAD, Math.min(H - PAD - tooltipH, (hoverPos?.y ?? PAD) - tooltipH / 2));
                    
                    return (
                      <g transform={`translate(${tooltipX}, ${tooltipY})`} className="pointer-events-none">
                        <rect
                          width={tooltipW}
                          height={tooltipH}
                          rx={6}
                          fill="#1f2937"
                          fillOpacity={0.92}
                          stroke="#374151"
                          strokeWidth={1}
                        />
                        <text x={8} y={14} fontSize="9" fontWeight="bold" fill="#f3f4f6">
                          Index: {hoverIdx}
                        </text>
                        {valid.map((s, i) => {
                          const val = s.vals[hoverIdx];
                          if (val === undefined) return null;
                          return (
                            <text key={i} x={8} y={30 + i * 16} fontSize="10" fill={COLORS[i % COLORS.length]}>
                              {s.name.slice(0, 10)}: <tspan fontWeight="bold" fill="#ffffff">{val.toFixed(2)}</tspan>
                            </text>
                          );
                        })}
                      </g>
                    );
                  })()}
                </g>
              )}

              {!valid.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  {tab === "Workspace" ? "Pick a numeric column →" : "Add a series →"}
                </text>
              )}
            </svg>
          </Panel>
          <Interpretation text={interpretation} />
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <>
              {wsCols.map((c, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <ColumnPicker label={`Series ${i + 1}`} value={c}
                      onChange={(v) => setWsCols(wsCols.map((x, k) => k === i ? v : x))}
                      kind="numeric"
                      autoPick={i === 0} />
                  </div>
                  {wsCols.length > 1 && (
                    <button onClick={() => setWsCols(wsCols.filter((_, k) => k !== i))}
                      className="pb-2 text-neutral-400 hover:text-red-600">×</button>
                  )}
                </div>
              ))}
              {wsCols.length < 4 && (
                <Btn onClick={() => setWsCols([...wsCols, null])}>+ Add series</Btn>
              )}
            </>
          )}
          {tab === "Your Data" && series.map((s, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <div className="flex items-center justify-between">
                <input value={s.name} onChange={(e) => setS(i, { name: e.target.value })}
                       className="text-sm font-medium bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-neutral-500 focus:outline-none px-1 py-0.5" />
                {series.length > 1 && (
                  <button onClick={() => setSeries(series.filter((_, k) => k !== i))} className="text-xs text-neutral-400 hover:text-red-600">×</button>
                )}
              </div>
              <DataTextArea label="" value={s.raw} onChange={(v) => setS(i, { raw: v })} rows={3} />
            </div>
          ))}
          {tab === "Your Data" && (
            <div className="flex gap-2">
              {series.length < 4 && <Btn onClick={() => setSeries([...series, { name: `Series ${series.length + 1}`, raw: "" }])}>+ Add series</Btn>}
              <SampleDataButton onClick={() => setSeries(SAMPLE)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} />
            Moving average overlay
          </label>
          {showMA && (
            <Field label="MA window" value={String(maWindow)}>
              <input type="range" min={2} max={20} value={maWindow} onChange={(e) => setMaWindow(Number(e.target.value))} className="w-full" />
            </Field>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Per-series stats</div>
            <table className="w-full text-xs font-mono">
              <thead><tr className="text-neutral-400"><th className="text-left">Series</th><th>n</th><th>μ</th><th>SD</th></tr></thead>
              <tbody>
                {valid.map((s, i) => (
                  <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1">{s.name}</td>
                    <td className="text-center">{s.vals.length}</td>
                    <td className="text-center">{mean(s.vals).toFixed(2)}</td>
                    <td className="text-center">{sd(s.vals).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
