"use client";

import { useMemo, useRef, useState } from "react";
import {
  parseNumbers, normalInv, mean, sd,
} from "./shared/stats";
import {
  Tabs, Stat, DataTextArea, SampleDataButton, Panel, Select, Field, Btn,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 520, H = 520, PAD = 50;

const SAMPLE = "62, 65, 68, 70, 71, 72, 72, 73, 74, 75, 76, 77, 78, 80, 82, 84";

type Family = "normal" | "exponential" | "uniform" | "lognormal";

/** Theoretical quantile of a Uniform(0,1) p value under the chosen family. */
function theoreticalQuantile(p: number, fam: Family): number {
  switch (fam) {
    case "normal":     return normalInv(p);                 // standard normal
    case "exponential":return -Math.log(1 - p);             // rate 1
    case "uniform":    return p;                            // U(0,1)
    case "lognormal":  return Math.exp(normalInv(p));       // exp(N(0,1))
  }
}

const FAMILIES: { value: Family; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "exponential", label: "Exponential" },
  { value: "uniform", label: "Uniform" },
  { value: "lognormal", label: "Log-normal" },
];

export default function QQPlotTool() {
  const { dataset, setSelection, isSelected } = useWorkspace();
  const [tab, setTab] = useState<string>(dataset ? "Workspace" : "Your Data");
  const [raw, setRaw] = useState(SAMPLE);
  const [family, setFamily] = useState<Family>("normal");
  const [valueCol, setValueCol] = useState<string | null>(null);
  const [standardize, setStandardize] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const brushStart = useRef<{ x: number; y: number } | null>(null);

  // Sample with row index where applicable, so selection highlights flow through.
  const sample: { v: number; row?: number }[] = useMemo(() => {
    if (tab === "Workspace" && dataset && valueCol) {
      const c = dataset.columns.find((c) => c.name === valueCol);
      if (!c) return [];
      const out: { v: number; row: number }[] = [];
      for (let i = 0; i < c.values.length; i++) {
        const raw = c.values[i];
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!isNaN(n) && raw !== null) out.push({ v: n, row: i });
      }
      return out;
    }
    return (parseNumbers(raw) ?? []).map((v) => ({ v }));
  }, [tab, dataset, valueCol, raw]);

  const sortedAsc = useMemo(
    () => [...sample].sort((a, b) => a.v - b.v),
    [sample]
  );
  const n = sortedAsc.length;

  const transformed = useMemo(() => {
    if (!standardize || n < 2) return sortedAsc;
    const m = mean(sortedAsc.map((p) => p.v));
    const s = sd(sortedAsc.map((p) => p.v));
    if (s === 0) return sortedAsc;
    return sortedAsc.map((p) => ({ v: (p.v - m) / s, row: p.row }));
  }, [sortedAsc, standardize, n]);

  const pts = useMemo(() => {
    if (n < 2) return [];
    return transformed.map((p, i) => {
      const pProb = (i + 0.5) / n;
      return { theo: theoreticalQuantile(pProb, family), samp: p.v, row: p.row };
    });
  }, [transformed, family, n]);

  const xs = pts.map((p) => p.theo);
  const ys = pts.map((p) => p.samp);
  const xMin = xs.length ? Math.min(...xs) : -3;
  const xMax = xs.length ? Math.max(...xs) : 3;
  const yMin = ys.length ? Math.min(...ys) : -3;
  const yMax = ys.length ? Math.max(...ys) : 3;
  // Make axes equal-ish for a fair y=x line
  const lo = Math.min(xMin, yMin);
  const hi = Math.max(xMax, yMax);
  const sx = (x: number) => PAD + ((x - lo) / (hi - lo || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  const invX = (px: number) => lo + ((px - PAD) / (W - 2 * PAD)) * (hi - lo);
  const invY = (py: number) => lo + (1 - (py - PAD) / (H - 2 * PAD)) * (hi - lo);

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
      for (const p of pts) {
        if (p.row === undefined) continue;
        if (p.theo >= x0 && p.theo <= x1 && p.samp >= y0 && p.samp <= y1) sel.add(p.row);
      }
      setSelection(sel.size ? sel : null);
    } else {
      setSelection(null);
    }
    brushStart.current = null;
    setBrush(null);
  };

  // Goodness-of-fit summary: correlation between theoretical and sample quantiles.
  const r = useMemo(() => {
    if (pts.length < 3) return 0;
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < pts.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
  }, [pts, xs, ys]);

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
                 className={`w-full h-auto ${tab === "Workspace" ? "cursor-crosshair" : ""}`}
                 onPointerDown={onPointerDown}
                 onPointerMove={onPointerMove}
                 onPointerUp={onPointerUp}
                 style={{ touchAction: "none" }}>
              {/* Reference y = x line */}
              <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)}
                    stroke="var(--chart-axis)" strokeDasharray="5 4" />
              {/* Axes */}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--chart-axis)" />
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const x = lo + (hi - lo) * t;
                return (
                  <g key={t}>
                    <text x={sx(x)} y={H - PAD + 18} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                      {x.toFixed(2)}
                    </text>
                    <text x={PAD - 8} y={sy(x) + 4} textAnchor="end" fontSize="10" fill="var(--chart-muted)">
                      {x.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">
                Theoretical {FAMILIES.find((f) => f.value === family)?.label} quantile
              </text>
              <text x={14} y={H / 2} fontSize="11" fill="var(--chart-muted)" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">
                Sample quantile{standardize ? " (z)" : ""}
              </text>

              {pts.map((p, i) => {
                const sel = p.row !== undefined && isSelected(p.row);
                return (
                  <circle key={i} cx={sx(p.theo)} cy={sy(p.samp)}
                    r={sel ? 4 : 2.5}
                    fill={sel ? "#fb923c" : "#171717"} fillOpacity={sel ? 0.95 : 0.65} />
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
              {!pts.length && (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--chart-muted)">
                  {tab === "Workspace" ? "Pick a numeric column →" : "Add data →"}
                </text>
              )}
            </svg>
          </Panel>
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <ColumnPicker label="Column" value={valueCol} onChange={setValueCol} kind="numeric" />
          )}
          {tab === "Your Data" && (
            <>
              <DataTextArea label="Data" value={raw} onChange={setRaw} rows={5} placeholder="62, 65, 68, …" />
              <SampleDataButton onClick={() => setRaw(SAMPLE)} />
            </>
          )}

          <Select label="Reference family" value={family}
            onChange={(v) => setFamily(v as Family)}
            options={FAMILIES} />

          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={standardize} onChange={(e) => setStandardize(e.target.checked)} />
            Standardize sample (z-score)
          </label>

          <Stat label="n" value={String(n)} />
          <Stat label="Q-Q correlation" value={r.toFixed(4)}
            sub={r > 0.99 ? "Excellent fit" : r > 0.97 ? "Good fit" : r > 0.93 ? "Moderate fit" : "Poor fit"} />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Points hugging the dashed line ⇒ data matches the family. Tail deviations reveal heavy / light tails;
            S-curves reveal skew.
          </p>
        </Panel>
      </div>
    </div>
  );
}
