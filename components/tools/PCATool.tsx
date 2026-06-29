"use client";

import { useMemo, useRef, useState } from "react";
import { mean, sd } from "./shared/stats";
import { Tabs, Stat, Panel , useRegisterToolState } from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { Minimize2, Maximize2 } from "lucide-react";

const W = 560, H = 560, PAD = 50;

/** Center each column to zero mean and (optionally) unit variance. */
function standardize(cols: number[][], scale: boolean) {
  return cols.map((c) => {
    const m = mean(c);
    const s = scale ? Math.max(sd(c), 1e-9) : 1;
    return c.map((v) => (v - m) / s);
  });
}

/** Sample covariance matrix from column-major standardized data. */
function covariance(cols: number[][]) {
  const k = cols.length;
  const n = cols[0]?.length ?? 0;
  const cov: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += cols[i][r] * cols[j][r];
      cov[i][j] = s / Math.max(1, n - 1);
    }
  }
  return cov;
}

function matVec(M: number[][], v: number[]) {
  const k = M.length;
  const out = Array(k).fill(0);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out[i] += M[i][j] * v[j];
  return out;
}
function norm(v: number[]) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }
function scaleMat(v: number[], a: number) { return v.map((x) => x * a); }

/** Power iteration for the top eigenvector of a symmetric matrix. */
function topEigen(M: number[][], iters = 200): { value: number; vector: number[] } {
  const k = M.length;
  let v = Array.from({ length: k }, () => Math.random() - 0.5);
  v = scaleMat(v, 1 / norm(v));
  let lambda = 0;
  for (let i = 0; i < iters; i++) {
    const Mv = matVec(M, v);
    const n = norm(Mv);
    if (n < 1e-12) break;
    v = scaleMat(Mv, 1 / n);
    lambda = v.reduce((s, x, j) => s + x * Mv[j], 0);
  }
  return { value: lambda, vector: v };
}

/** Deflate so we can find the next eigenpair. */
function deflate(M: number[][], lambda: number, v: number[]): number[][] {
  const k = M.length;
  const out: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out[i][j] = M[i][j] - lambda * v[i] * v[j];
  return out;
}

interface Regression3DResult {
  scores: { x: number; y: number; z: number; row: number }[];
  loadings: { name: string; x: number; y: number; z: number }[];
  var1: number;
  var2: number;
  var3: number;
  totalVar: number;
  n: number;
  k: number;
}

type RenderItem =
  | { type: "line"; x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; stroke: string; strokeWidth: number; dashArray?: string; opacity?: number }
  | { type: "point"; x: number; y: number; z: number; r: number; color: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { type: "text"; x: number; y: number; z: number; text: string; color: string; fontSize: number; textAnchor: "start" | "middle" | "end" | "inherit" };

function getProjected(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number
) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const xRotY = x * cosYaw - z * sinYaw;
  const zRotY = x * sinYaw + z * cosYaw;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const yRotX = y * cosPitch - zRotY * sinPitch;
  const zRotX = y * sinPitch + zRotY * cosPitch;

  const d = 0.2;
  const denom = 1 - d * zRotX;
  const scale = 170; // fits in 560x560
  const cx = W / 2;
  const cy = H / 2;

  const px = cx + (xRotY * scale) / denom;
  const py = cy - (yRotX * scale) / denom;

  return { px, py, depth: zRotX };
}

export default function PCATool() {
  const { dataset, numericColumns, isSelected } = useWorkspace();
  const [tab, setTab] = useState("Biplot");
  const [scaleVars, setScaleVars] = useState(true);

  // 3D states
  const [is3D, setIs3D] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.3);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const result = useMemo<Regression3DResult | null>(() => {
    if (!dataset || numericColumns.length < 2) return null;
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
    const std = standardize(cols, scaleVars);
    const cov = covariance(std);
    
    // Top 3 eigenvectors
    const e1 = topEigen(cov);
    const cov2 = deflate(cov, e1.value, e1.vector);
    const e2 = topEigen(cov2);
    const cov3 = deflate(cov2, e2.value, e2.vector);
    const e3 = topEigen(cov3);

    // Project each row onto PC1/PC2/PC3
    const n = idx.length;
    const scores: { x: number; y: number; z: number; row: number }[] = [];
    for (let r = 0; r < n; r++) {
      let pc1 = 0, pc2 = 0, pc3 = 0;
      for (let j = 0; j < k; j++) {
        pc1 += std[j][r] * e1.vector[j];
        pc2 += std[j][r] * e2.vector[j];
        pc3 += std[j][r] * e3.vector[j];
      }
      scores.push({ x: pc1, y: pc2, z: pc3, row: idx[r] });
    }
    const totalVar = cov.reduce((s, row, i) => s + row[i], 0);
    return {
      scores,
      loadings: numericColumns.map((c, j) => ({
        name: c.name,
        x: e1.vector[j],
        y: e2.vector[j],
        z: e3.vector[j],
      })),
      var1: e1.value,
      var2: e2.value,
      var3: e3.value,
      totalVar,
      n,
      k,
    };
  }, [dataset, numericColumns, scaleVars]);

  // 2D Projection constants
  const xs = result?.scores.map((s) => s.x) ?? [];
  const ys = result?.scores.map((s) => s.y) ?? [];
  const sxAbs = Math.max(0.5, ...xs.map(Math.abs));
  const syAbs = Math.max(0.5, ...ys.map(Math.abs));
  const px = (x: number) => W / 2 + (x / sxAbs) * (W / 2 - PAD);
  const py = (y: number) => H / 2 - (y / syAbs) * (H / 2 - PAD);
  const lScale = 0.9;

  // 3D Projection & Dragging handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!is3D) return;
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!is3D || !isDragging3D || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const sensitivity = 0.007;
    setYaw((prev) => prev + dx * sensitivity);
    setPitch((prev) => {
      const next = prev - dy * sensitivity;
      return Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, next));
    });
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    if (!is3D) return;
    setIsDragging3D(false);
    dragStart.current = null;
  };

  // Build 3D render items list
  useRegisterToolState("pca", { tab, scaleVars, is3D }, { tab: setTab, scaleVars: setScaleVars, is3D: setIs3D });
  const renderItems3D = useMemo(() => {
    if (!is3D || !result) return [];

    const items: RenderItem[] = [];
    const getProj = (x: number, y: number, z: number) => getProjected(x, y, z, yaw, pitch);

    // 1. Floor grid lines
    const gridValues = [-1, -0.5, 0, 0.5, 1];
    gridValues.forEach((val) => {
      items.push({
        type: "line",
        x1: -1, y1: -1, z1: val,
        x2: 1, y2: -1, z2: val,
        stroke: "var(--chart-grid)",
        strokeWidth: 1,
        opacity: 0.4
      });
      items.push({
        type: "line",
        x1: val, y1: -1, z1: -1,
        x2: val, y2: -1, z2: 1,
        stroke: "var(--chart-grid)",
        strokeWidth: 1,
        opacity: 0.4
      });
    });

    // 2. Bounding Box Outline (12 edges)
    // Floor
    items.push({ type: "line", x1: -1, y1: -1, z1: -1, x2: 1, y2: -1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.5 });
    items.push({ type: "line", x1: 1, y1: -1, z1: -1, x2: 1, y2: -1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.5 });
    items.push({ type: "line", x1: 1, y1: -1, z1: 1, x2: -1, y2: -1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.5 });
    items.push({ type: "line", x1: -1, y1: -1, z1: 1, x2: -1, y2: -1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.5 });

    // Ceiling
    items.push({ type: "line", x1: -1, y1: 1, z1: -1, x2: 1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: 1, y1: 1, z1: -1, x2: 1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: 1, y1: 1, z1: 1, x2: -1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: -1, y1: 1, z1: 1, x2: -1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });

    // Vertical pillars
    items.push({ type: "line", x1: -1, y1: -1, z1: -1, x2: -1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: 1, y1: -1, z1: -1, x2: 1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: 1, y1: -1, z1: 1, x2: 1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1, opacity: 0.3 });
    items.push({ type: "line", x1: -1, y1: -1, z1: 1, x2: -1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.5 });

    // 3. Axis labels
    items.push({
      type: "text",
      x: 1.15, y: -1, z: -1,
      text: "PC1",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "start"
    });
    items.push({
      type: "text",
      x: -1, y: 1.15, z: -1,
      text: "PC2",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });
    items.push({
      type: "text",
      x: -1, y: -1, z: 1.15,
      text: "PC3",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    // 4. Data Points
    const maxAbs = Math.max(0.1, ...result.scores.map((s) => Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z))));
    result.scores.forEach((p) => {
      const nx = p.x / maxAbs;
      const ny = p.y / maxAbs;
      const nz = p.z / maxAbs;
      const sel = isSelected(p.row);
      const color = sel ? "#fb923c" : "var(--chart-ink)";

      // Vertical drop line to floor (y = -1)
      items.push({
        type: "line",
        x1: nx, y1: ny, z1: nz,
        x2: nx, y2: -1, z2: nz,
        stroke: "var(--chart-grid)",
        strokeWidth: 0.6,
        dashArray: "2 2",
        opacity: sel ? 0.55 : 0.22
      });

      items.push({
        type: "point",
        x: nx, y: ny, z: nz,
        r: sel ? 5 : 3.5,
        color,
        opacity: sel ? 0.95 : 0.65
      });
    });

    // 5. Loadings
    const lScaleVec = 0.85;
    result.loadings.forEach((l) => {
      const lx = l.x * lScaleVec;
      const ly = l.y * lScaleVec;
      const lz = l.z * lScaleVec;

      items.push({
        type: "line",
        x1: 0, y1: 0, z1: 0,
        x2: lx, y2: ly, z2: lz,
        stroke: "#fb923c",
        strokeWidth: 2,
        opacity: 0.85
      });

      items.push({
        type: "text",
        x: lx * 1.05, y: ly * 1.05, z: lz * 1.05,
        text: l.name.length > 12 ? l.name.slice(0, 10) + "..." : l.name,
        color: "#c2410c",
        fontSize: 10,
        textAnchor: "start"
      });
    });

    // 6. Depth Sort
    const rotated = items.map((item) => {
      let depth = 0;
      if (item.type === "line") {
        const p1 = getProj(item.x1, item.y1, item.z1);
        const p2 = getProj(item.x2, item.y2, item.z2);
        depth = (p1.depth + p2.depth) / 2;
      } else {
        depth = getProj(item.x, item.y, item.z).depth;
      }
      return { item, depth };
    });

    rotated.sort((a, b) => a.depth - b.depth);
    return rotated;
  }, [is3D, result, yaw, pitch, isSelected]);

  const renderItem = (item: RenderItem, index: number) => {
    const getProj = (x: number, y: number, z: number) => getProjected(x, y, z, yaw, pitch);

    if (item.type === "line") {
      const p1 = getProj(item.x1, item.y1, item.z1);
      const p2 = getProj(item.x2, item.y2, item.z2);
      return (
        <line
          key={`l-${index}`}
          x1={p1.px}
          y1={p1.py}
          x2={p2.px}
          y2={p2.py}
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          strokeDasharray={item.dashArray}
          opacity={item.opacity}
        />
      );
    }

    if (item.type === "point") {
      const p = getProj(item.x, item.y, item.z);
      const d = 0.2;
      const rScale = item.r / (1 - d * p.depth);
      return (
        <circle
          key={`p-${index}`}
          cx={p.px}
          cy={p.py}
          r={rScale}
          fill={item.color}
          opacity={item.opacity ?? 0.9}
          stroke="#ffffff"
          strokeWidth={0.5}
        />
      );
    }

    if (item.type === "text") {
      const p = getProj(item.x, item.y, item.z);
      return (
        <text
          key={`t-${index}`}
          x={p.px}
          y={p.py}
          fill={item.color}
          fontSize={item.fontSize}
          textAnchor={item.textAnchor}
          alignmentBaseline="middle"
        >
          {item.text}
        </text>
      );
    }

    return null;
  };

  const renderControls = () => {
    return (
      <div className="space-y-5">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer font-medium border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <input
            type="checkbox" checked={is3D}
            onChange={(e) => setIs3D(e.target.checked)}
            className="rounded text-indigo-600"
          />
          3D Biplot (PC1 / PC2 / PC3)
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input type="checkbox" checked={scaleVars} onChange={(e) => setScaleVars(e.target.checked)} />
          Standardize variables (z-score)
        </label>
        {result ? (
          <>
            <Stat label="Observations" value={String(result.n)} />
            <Stat label="Variables"    value={String(result.k)} />
            <Stat label="PC1 variance" value={`${((result.var1 / result.totalVar) * 100).toFixed(1)}%`}
              sub={`λ₁ = ${result.var1.toFixed(3)}`} />
            <Stat label="PC2 variance" value={`${((result.var2 / result.totalVar) * 100).toFixed(1)}%`}
              sub={`λ₂ = ${result.var2.toFixed(3)}`} />
            {is3D && (
              <Stat label="PC3 variance" value={`${((result.var3 / result.totalVar) * 100).toFixed(1)}%`}
                sub={`λ₃ = ${result.var3.toFixed(3)}`} />
            )}
            <Stat label="Cumulative" value={`${(((result.var1 + result.var2 + (is3D ? result.var3 : 0)) / result.totalVar) * 100).toFixed(1)}%`} />
            
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Loadings</div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-neutral-400">
                      <th className="text-left">Variable</th>
                      <th>PC1</th>
                      <th>PC2</th>
                      {is3D && <th>PC3</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.loadings.map((l) => (
                      <tr key={l.name} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="py-1">{l.name}</td>
                        <td className="text-center">{l.x.toFixed(3)}</td>
                        <td className="text-center">{l.y.toFixed(3)}</td>
                        {is3D && <td className="text-center">{l.z.toFixed(3)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed font-sans">
              Drag a rectangle in the Scatter tool — those rows highlight here too.
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-sans">
            Drop a CSV or load an example with at least 2 numeric columns. PCA explains which
            combinations of variables capture the most variation.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs tabs={["Biplot"]} active={tab} onChange={setTab} />

      <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
        <div className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2"}>
          <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}>
            {is3D && (
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-500" /> : <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />}
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              </div>
            )}
            
            {isFullscreen && (
              <div className="absolute top-4 right-4 z-20 w-80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
                <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                  <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Floating controls</span>
                  <button 
                    onClick={() => setIsFullscreen(false)} 
                    className="text-[10px] text-indigo-405 hover:underline"
                  >
                    Exit FS
                  </button>
                </div>
                {renderControls()}
              </div>
            )}

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={`w-full h-auto select-none ${is3D ? "cursor-move" : ""} ${isFullscreen ? "flex-1" : ""}`}
              style={{ touchAction: "none", height: isFullscreen ? "100%" : "auto" }}
              onPointerDown={is3D ? handlePointerDown : undefined}
              onPointerMove={is3D ? handlePointerMove : undefined}
              onPointerUp={is3D ? handlePointerUp : undefined}
              onPointerLeave={is3D ? handlePointerUp : undefined}
            >
              {!is3D ? (
                <>
                  <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="var(--chart-grid)" />
                  <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="var(--chart-grid)" />
                  {!result && (
                    <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--chart-muted)">
                      Load a dataset with at least 2 numeric columns.
                    </text>
                  )}
                  {result?.scores.map((p, i) => {
                    const sel = isSelected(p.row);
                    return (
                      <circle key={i} cx={px(p.x)} cy={py(p.y)}
                        r={sel ? 4 : 2.5}
                        fill={sel ? "#fb923c" : "var(--chart-ink)"} fillOpacity={sel ? 0.95 : 0.55} />
                    );
                  })}
                  {result?.loadings.map((l, i) => {
                    const ex = px(l.x * sxAbs * lScale);
                    const ey = py(l.y * syAbs * lScale);
                    const isTopLoading = result.loadings.length <= 8 || 
                      [...result.loadings]
                        .sort((a, b) => (b.x * b.x + b.y * b.y) - (a.x * a.x + a.y * a.y))
                        .slice(0, 8)
                        .some(top => top.name === l.name);

                    return (
                      <g key={i}>
                        <line x1={W / 2} y1={H / 2} x2={ex} y2={ey} stroke="#fb923c" strokeWidth={1.5} strokeOpacity={isTopLoading ? 1.0 : 0.35} />
                        <circle cx={ex} cy={ey} r={3} fill="#fb923c" fillOpacity={isTopLoading ? 1.0 : 0.35} />
                        {isTopLoading && (
                          <text x={ex + 6} y={ey - 4} fontSize="11" fill="#c2410c" fontWeight={500}>
                            {l.name.length > 14 ? l.name.slice(0, 12) + "..." : l.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x={W - PAD} y={H / 2 - 6} textAnchor="end" fontSize="11" fill="var(--chart-muted)">PC1</text>
                  <text x={W / 2 + 6} y={PAD + 4} fontSize="11" fill="var(--chart-muted)">PC2</text>
                </>
              ) : (
                <>
                  {/* 3D items rendering */}
                  {renderItems3D.map(({ item }, index) => renderItem(item, index))}

                  <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                    Drag to rotate view (Yaw/Pitch)
                  </text>

                  <g 
                    className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setYaw(0.6);
                      setPitch(0.3);
                    }}
                    transform={`translate(${W - 80}, ${H - 28})`}
                  >
                    <rect width="70" height="16" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                    <text x="35" y="11" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
                  </g>
                </>
              )}
            </svg>
          </Panel>
        </div>

        {!isFullscreen && (
          <Panel className="space-y-5">
            {renderControls()}
          </Panel>
        )}
      </div>
    </div>
  );
}
