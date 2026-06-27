"use client";

import { useMemo, useState } from "react";
import { pearsonR, tCDF } from "./shared/stats";
import {
  Tabs, Stat, DataTextArea, SampleDataButton, Panel, Select, Interpretation,
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const W = 480, H = 480, PAD = 80;

const SAMPLE_CSV = `Age,Income,Hours,Score,Mood,Sleep
22,40,38,72,6,7
25,45,42,75,7,7
28,55,45,80,7,8
31,60,40,82,8,7
34,70,38,85,8,8
26,42,45,73,5,6
29,52,40,78,6,7
33,68,42,84,7,8
40,82,38,88,8,8
24,38,46,70,5,6
27,48,44,76,6,7
30,58,40,80,7,7
35,72,42,85,8,8`;

function parseCSV(text: string): { names: string[]; rows: number[][] } | null {
  const lines = text.trim().split(/\n/).filter((l) => l.trim());
  if (lines.length < 3) return null;
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const names = lines[0].split(sep).map((s) => s.trim());
  const rows: number[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map((s) => Number(s.trim()));
    if (parts.some(isNaN)) return null;
    rows.push(parts);
  }
  if (!rows.length || rows[0].length !== names.length) return null;
  return { names, rows };
}

function corrPVal(r: number, n: number) {
  if (n < 3 || Math.abs(r) >= 1) return 0;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  return 2 * (1 - tCDF(Math.abs(t), n - 2));
}

export default function HeatmapTool() {
  const { dataset, numericColumns } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Your Data");
  const [raw, setRaw] = useState(SAMPLE_CSV);
  const [scale, setScale] = useState<"diverging" | "sequential">("diverging");
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  useRegisterToolState("heatmap", { tab, scale }, { tab: setTab, scale: setScale });
  const wsMatrix = useMemo(() => {
    if (!dataset || numericColumns.length < 2) return null;
    // Use only rows where all numeric columns have a value
    const k = numericColumns.length;
    const rowMask: boolean[] = Array(dataset.rows.length).fill(true);
    for (const col of numericColumns) {
      for (let i = 0; i < col.values.length; i++) {
        const v = col.values[i];
        const num = typeof v === "number" ? v : Number(v);
        if (v === null || isNaN(num)) rowMask[i] = false;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < rowMask.length; i++) if (rowMask[i]) idx.push(i);
    if (idx.length < 3) return null;
    const cols = numericColumns.map((c) => idx.map((i) => Number(c.values[i])));
    const m: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) m[i][j] = pearsonR(cols[i], cols[j]);
    return { matrix: m, names: numericColumns.map((c) => c.name), n: idx.length };
  }, [dataset, numericColumns]);

  const parsedManual = useMemo(() => parseCSV(raw), [raw]);
  const manualMatrix = useMemo(() => {
    if (!parsedManual) return null;
    const k = parsedManual.names.length;
    const cols = parsedManual.names.map((_, j) => parsedManual.rows.map((r) => r[j]));
    const m: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) m[i][j] = pearsonR(cols[i], cols[j]);
    return { matrix: m, names: parsedManual.names, n: parsedManual.rows.length };
  }, [parsedManual]);

  const matrix = tab === "Workspace" ? wsMatrix : manualMatrix;
  const cellSize = matrix ? (W - 2 * PAD) / matrix.names.length : 40;

  const interpretation = useMemo(() => {
    if (!matrix || matrix.names.length < 2) return null;
    let maxAbs = -1, minAbs = Infinity;
    let maxPair: [string, string, number] | null = null;
    let minPair: [string, string, number] | null = null;
    for (let i = 0; i < matrix.names.length; i++) {
      for (let j = i + 1; j < matrix.names.length; j++) {
        const r = matrix.matrix[i][j];
        const a = Math.abs(r);
        if (a > maxAbs) { maxAbs = a; maxPair = [matrix.names[i], matrix.names[j], r]; }
        if (a < minAbs) { minAbs = a; minPair = [matrix.names[i], matrix.names[j], r]; }
      }
    }
    if (!maxPair || !minPair) return null;
    const sign = (r: number) => (r >= 0 ? "" : "−");
    const fmt = (r: number) => `${sign(r)}${Math.abs(r).toFixed(2)}`;
    return `Strongest correlation: ${maxPair[0]} ↔ ${maxPair[1]} (r=${fmt(maxPair[2])}). Weakest: ${minPair[0]} ↔ ${minPair[1]} (r=${fmt(minPair[2])}). Across n=${matrix.n} observations.`;
  }, [matrix]);

  function color(v: number) {
    if (scale === "sequential") {
      const t = (v + 1) / 2;
      return `rgba(30,58,95,${(0.05 + 0.85 * t).toFixed(3)})`;
    }
    if (v >= 0) return `rgba(30,58,95,${(0.05 + 0.85 * v).toFixed(3)})`;
    return `rgba(139,30,63,${(0.05 + 0.85 * Math.abs(v)).toFixed(3)})`;
  }
  function stars(p: number) { return p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : ""; }

  const hoverPair = matrix && hover ? {
    a: matrix.names[hover.i],
    b: matrix.names[hover.j],
    r: matrix.matrix[hover.i][hover.j],
    p: corrPVal(matrix.matrix[hover.i][hover.j], matrix.n),
  } : null;

  const tabs = dataset ? ["Workspace", "Your Data"] : ["Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            {!matrix ? (
              <div className="text-sm text-neutral-500 text-center py-12">
                {tab === "Workspace" ? "Need at least 2 numeric columns." : "Paste a CSV with header row."}
              </div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                {(() => {
                  const isRotated = matrix.names.length > 5 || matrix.names.some(name => name.length > 8);
                  return matrix.names.map((n, j) => {
                    const x = PAD + (j + 0.5) * cellSize;
                    const y = PAD - 12;
                    const displayVal = n.length > 14 ? n.slice(0, 12) + "..." : n;
                    return (
                      <text
                        key={`x${j}`}
                        x={x}
                        y={y}
                        textAnchor={isRotated ? "start" : "middle"}
                        fontSize="10"
                        fill="var(--chart-muted)"
                        transform={isRotated ? `rotate(-35, ${x}, ${y})` : undefined}
                      >
                        {displayVal}
                      </text>
                    );
                  });
                })()}
                {matrix.names.map((n, i) => (
                  <text key={`y${i}`} x={PAD - 10} y={PAD + (i + 0.5) * cellSize + 4} textAnchor="end" fontSize="10" fill="var(--chart-muted)">
                    {n.length > 14 ? n.slice(0, 12) + "..." : n}
                  </text>
                ))}
                {matrix.matrix.map((row, i) =>
                  row.map((v, j) => {
                    const p = corrPVal(v, matrix.n);
                    return (
                      <g key={`${i}-${j}`}
                         onMouseEnter={() => setHover({ i, j })}
                         onMouseLeave={() => setHover(null)}>
                        <rect x={PAD + j * cellSize} y={PAD + i * cellSize} width={cellSize} height={cellSize}
                              fill={color(v)} stroke="#fff" strokeWidth={1} rx={2} />
                        {cellSize >= 32 && (
                          <text x={PAD + (j + 0.5) * cellSize} y={PAD + (i + 0.5) * cellSize + 4}
                                textAnchor="middle" fontSize="9"
                                fill={Math.abs(v) > 0.5 ? "#fff" : "#171717"}>
                            {v.toFixed(2)}{stars(p)}
                          </text>
                        )}
                      </g>
                    );
                  }),
                )}
              </svg>
            )}
          </Panel>
          <Interpretation text={interpretation} />
        </div>
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Pearson correlation across all {numericColumns.length} numeric columns
              of <span className="font-mono">{dataset.name}</span>.
            </p>
          )}
          {tab === "Your Data" && (
            <>
              <DataTextArea label="CSV / TSV (with header)" value={raw} onChange={setRaw} rows={8} />
              <SampleDataButton onClick={() => setRaw(SAMPLE_CSV)} />
            </>
          )}
          <Select label="Color scale" value={scale} onChange={(v) => setScale(v as typeof scale)}
            options={[{ value: "diverging", label: "Diverging" }, { value: "sequential", label: "Sequential" }]} />
          {matrix && <Stat label="n observations" value={String(matrix.n)} />}
          {matrix && <Stat label="Variables" value={String(matrix.names.length)} />}
          {hoverPair && (
            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Hovered</div>
              <div className="font-mono">{hoverPair.a} ↔ {hoverPair.b}</div>
              <div className="font-mono text-base">r = {hoverPair.r.toFixed(3)}</div>
              <div className="text-xs text-neutral-500 mt-1">p = {hoverPair.p.toFixed(4)}</div>
            </div>
          )}
          <p className="text-[10px] text-neutral-500">
            * p&lt;0.05  ** p&lt;0.01  *** p&lt;0.001
          </p>
        </Panel>
      </div>
    </div>
  );
}
