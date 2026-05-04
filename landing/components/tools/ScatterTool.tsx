"use client";

import { useMemo, useRef, useState } from "react";
import {
  parsePairs, pearsonR, spearmanRho, ols, tCDF, rngFor, gauss,
} from "./shared/stats";
import {
  Tabs, Stat, Field, DataTextArea, SampleDataButton, Panel, Btn,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 480, H = 480, PAD = 40;

const SAMPLE = `1, 1.6
1.7, 2.0
2.4, 2.7
3.1, 2.9
3.8, 3.6
4.5, 3.4
5.2, 4.5
5.9, 4.7
6.6, 5.6
7.3, 5.3`;

type Pt = { x: number; y: number; row?: number };

export default function ScatterTool() {
  const { dataset, setSelection, isSelected } = useWorkspace();

  const initialTab = dataset ? "Workspace" : "Your Data";
  const [tab, setTab] = useState(initialTab);
  const [raw, setRaw] = useState(SAMPLE);
  const [rho, setRho] = useState(0.6);
  const [n, setN] = useState(150);
  const [seed, setSeed] = useState(1);
  const [showLine, setShowLine] = useState(true);
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [interactive, setInteractive] = useState<Pt[]>([]);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const brushStart = useRef<{ x: number; y: number } | null>(null);

  const parsed = useMemo(() => parsePairs(raw), [raw]);

  const sim = useMemo(() => {
    const rng = rngFor(seed);
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const u = gauss(rng), v = gauss(rng);
      pts.push({ x: u, y: rho * u + Math.sqrt(Math.max(0, 1 - rho * rho)) * v });
    }
    return pts;
  }, [n, rho, seed]);

  const wsPts: Pt[] = useMemo(() => {
    if (!dataset || !xCol || !yCol) return [];
    const xs = dataset.columns.find((c) => c.name === xCol);
    const ys = dataset.columns.find((c) => c.name === yCol);
    if (!xs || !ys) return [];
    const out: Pt[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = xs.values[i], yv = ys.values[i];
      const xn = typeof xv === "number" ? xv : Number(xv);
      const yn = typeof yv === "number" ? yv : Number(yv);
      if (!isNaN(xn) && !isNaN(yn) && xv !== null && yv !== null) {
        out.push({ x: xn, y: yn, row: i });
      }
    }
    return out;
  }, [dataset, xCol, yCol]);

  const dataPts: Pt[] =
    tab === "Workspace"  ? wsPts :
    tab === "Simulation" ? sim :
    tab === "Interactive" ? interactive :
    parsed?.map((p) => ({ x: p.x, y: p.y })) ?? [];

  const xs = dataPts.map((p) => p.x), ys = dataPts.map((p) => p.y);
  const xMin = xs.length ? Math.min(...xs) - 0.5 : -3;
  const xMax = xs.length ? Math.max(...xs) + 0.5 : 3;
  const yMin = ys.length ? Math.min(...ys) - 0.5 : -3;
  const yMax = ys.length ? Math.max(...ys) + 0.5 : 3;
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);
  const invX = (px: number) => xMin + ((px - PAD) / (W - 2 * PAD)) * (xMax - xMin);
  const invY = (py: number) => yMin + (1 - (py - PAD) / (H - 2 * PAD)) * (yMax - yMin);

  const r = dataPts.length >= 3 ? pearsonR(xs, ys) : 0;
  const rho_s = dataPts.length >= 3 ? spearmanRho(xs, ys) : 0;
  const reg = dataPts.length >= 2 ? ols(xs, ys) : null;

  let pR = 1;
  if (dataPts.length > 2 && Math.abs(r) < 1) {
    const t = r * Math.sqrt((dataPts.length - 2) / (1 - r * r));
    pR = 2 * (1 - tCDF(Math.abs(t), dataPts.length - 2));
  }

  // Pointer events: brush in Workspace tab, click-to-add in Interactive tab.
  const ptToSvg = (e: React.PointerEvent) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    return { px, py };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tab !== "Workspace") return;
    const c = ptToSvg(e); if (!c) return;
    brushStart.current = { x: c.px, y: c.py };
    setBrush({ x0: c.px, y0: c.py, x1: c.px, y1: c.py });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (tab !== "Workspace" || !brushStart.current) return;
    const c = ptToSvg(e); if (!c) return;
    setBrush({ x0: brushStart.current.x, y0: brushStart.current.y, x1: c.px, y1: c.py });
  };
  const onPointerUp = () => {
    if (tab !== "Workspace" || !brush) return;
    const x0 = invX(Math.min(brush.x0, brush.x1));
    const x1 = invX(Math.max(brush.x0, brush.x1));
    const y0 = invY(Math.max(brush.y0, brush.y1));
    const y1 = invY(Math.min(brush.y0, brush.y1));
    const sel = new Set<number>();
    const tooSmall = Math.abs(brush.x1 - brush.x0) < 4 && Math.abs(brush.y1 - brush.y0) < 4;
    if (!tooSmall) {
      for (const p of dataPts) {
        if (p.row === undefined) continue;
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) sel.add(p.row);
      }
      setSelection(sel.size ? sel : null);
    } else {
      // tap outside any point clears selection
      setSelection(null);
    }
    brushStart.current = null;
    setBrush(null);
  };

  const onSvgClick = (e: React.MouseEvent) => {
    if (tab !== "Interactive") return;
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const x = invX(px); const y = invY(py);
    setInteractive([...interactive, { x, y }]);
  };

  const tabs = dataset
    ? ["Workspace", "Your Data", "Simulation", "Interactive"]
    : ["Your Data", "Simulation", "Interactive"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
                 className={`w-full h-auto ${tab === "Interactive" ? "cursor-crosshair" : tab === "Workspace" ? "cursor-crosshair" : ""}`}
                 onClick={onSvgClick}
                 onPointerDown={onPointerDown}
                 onPointerMove={onPointerMove}
                 onPointerUp={onPointerUp}
                 style={{ touchAction: "none" }}>
              <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-grid)" />
              <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="var(--chart-grid)" />
              {showLine && reg && (
                <line x1={sx(xMin)} y1={sy(reg.intercept + reg.slope * xMin)}
                      x2={sx(xMax)} y2={sy(reg.intercept + reg.slope * xMax)}
                      stroke="var(--chart-ink)" strokeWidth={2} />
              )}
              {dataPts.map((p, i) => {
                const sel = p.row !== undefined && isSelected(p.row);
                return (
                  <circle key={i} cx={sx(p.x)} cy={sy(p.y)}
                    r={sel ? 4 : 2.8}
                    fill={sel ? "#fb923c"
                          : tab === "Interactive" && i === interactive.length - 1 ? "#fb923c"
                          : "#171717"}
                    fillOpacity={sel ? 0.95 : 0.7} />
                );
              })}
              {brush && (
                <rect
                  x={Math.min(brush.x0, brush.x1)}
                  y={Math.min(brush.y0, brush.y1)}
                  width={Math.abs(brush.x1 - brush.x0)}
                  height={Math.abs(brush.y1 - brush.y0)}
                  fill="#fb923c" fillOpacity={0.12}
                  stroke="#fb923c" strokeDasharray="3 3"
                />
              )}
              {tab === "Interactive" && dataPts.length === 0 && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  Click to add points
                </text>
              )}
              {tab === "Workspace" && dataPts.length === 0 && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  Pick X and Y columns →
                </text>
              )}
            </svg>
          </Panel>
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <>
              <ColumnPicker label="X column" value={xCol} onChange={setXCol} />
              <ColumnPicker label="Y column" value={yCol} onChange={setYCol} />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Drag a rectangle to select rows — they&apos;ll highlight in every other tool.
              </p>
            </>
          )}
          {tab === "Your Data" && (
            <>
              <DataTextArea label="X, Y pairs" value={raw} onChange={setRaw} rows={6} placeholder="1.0, 1.6" />
              <SampleDataButton onClick={() => setRaw(SAMPLE)} />
            </>
          )}
          {tab === "Simulation" && (
            <>
              <Field label="ρ (target)" value={rho.toFixed(2)}>
                <input type="range" min={-1} max={1} step={0.05} value={rho} onChange={(e) => setRho(Number(e.target.value))} className="w-full" />
              </Field>
              <Field label="n" value={String(n)}>
                <input type="range" min={20} max={1000} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
              </Field>
              <Btn onClick={() => setSeed((s) => s + 1)}>New sample</Btn>
            </>
          )}
          {tab === "Interactive" && (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Click anywhere on the chart to add a point.</p>
              <Btn onClick={() => setInteractive([])}>Clear points</Btn>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={showLine} onChange={(e) => setShowLine(e.target.checked)} />
            Show OLS line
          </label>
          <Stat label="Pearson r"  value={r.toFixed(4)} sub={`r² = ${(r * r).toFixed(4)}`} />
          <Stat label="Spearman ρ" value={rho_s.toFixed(4)} />
          <Stat label="p-value (r)" value={pR.toFixed(4)} />
          {reg && <Stat label="OLS line" value={`y = ${reg.slope.toFixed(3)}x + ${reg.intercept.toFixed(3)}`} />}
          <Stat label="n" value={String(dataPts.length)} />
        </Panel>
      </div>
    </div>
  );
}
