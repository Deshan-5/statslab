"use client";

import { useMemo, useState } from "react";
import { mean, sd } from "./shared/stats";
import { Tabs, Stat, Panel } from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

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
function scale(v: number[], a: number) { return v.map((x) => x * a); }

/** Power iteration for the top eigenvector of a symmetric matrix. */
function topEigen(M: number[][], iters = 200): { value: number; vector: number[] } {
  const k = M.length;
  let v = Array.from({ length: k }, () => Math.random() - 0.5);
  v = scale(v, 1 / norm(v));
  let lambda = 0;
  for (let i = 0; i < iters; i++) {
    const Mv = matVec(M, v);
    const n = norm(Mv);
    if (n < 1e-12) break;
    v = scale(Mv, 1 / n);
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

export default function PCATool() {
  const { dataset, numericColumns, isSelected } = useWorkspace();
  const [tab, setTab] = useState("Biplot");
  const [scaleVars, setScaleVars] = useState(true);

  const result = useMemo(() => {
    if (!dataset || numericColumns.length < 2) return null;
    // Use complete-case rows across all numeric columns
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
    const e1 = topEigen(cov);
    const cov2 = deflate(cov, e1.value, e1.vector);
    const e2 = topEigen(cov2);

    // Project each row onto PC1/PC2
    const n = idx.length;
    const scores: { x: number; y: number; row: number }[] = [];
    for (let r = 0; r < n; r++) {
      let pc1 = 0, pc2 = 0;
      for (let j = 0; j < k; j++) {
        pc1 += std[j][r] * e1.vector[j];
        pc2 += std[j][r] * e2.vector[j];
      }
      scores.push({ x: pc1, y: pc2, row: idx[r] });
    }
    const totalVar = cov.reduce((s, row, i) => s + row[i], 0);
    return {
      scores,
      loadings: numericColumns.map((c, j) => ({ name: c.name, x: e1.vector[j], y: e2.vector[j] })),
      var1: e1.value, var2: e2.value, totalVar,
      n, k,
    };
  }, [dataset, numericColumns, scaleVars]);

  const xs = result?.scores.map((s) => s.x) ?? [];
  const ys = result?.scores.map((s) => s.y) ?? [];
  const sxAbs = Math.max(0.5, ...xs.map(Math.abs));
  const syAbs = Math.max(0.5, ...ys.map(Math.abs));
  const px = (x: number) => W / 2 + (x / sxAbs) * (W / 2 - PAD);
  const py = (y: number) => H / 2 - (y / syAbs) * (H / 2 - PAD);
  // loadings are unit vectors (scale * 0.9 to plot bounds)
  const lScale = 0.9;

  return (
    <div className="space-y-6">
      <Tabs tabs={["Biplot"]} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
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
                    fill={sel ? "#fb923c" : "#171717"} fillOpacity={sel ? 0.95 : 0.55} />
                );
              })}
              {result?.loadings.map((l, i) => {
                const ex = px(l.x * sxAbs * lScale);
                const ey = py(l.y * syAbs * lScale);
                return (
                  <g key={i}>
                    <line x1={W / 2} y1={H / 2} x2={ex} y2={ey} stroke="#fb923c" strokeWidth={1.5} />
                    <circle cx={ex} cy={ey} r={3} fill="#fb923c" />
                    <text x={ex + 6} y={ey - 4} fontSize="11" fill="#c2410c" fontWeight={500}>{l.name}</text>
                  </g>
                );
              })}
              <text x={W - PAD} y={H / 2 - 6} textAnchor="end" fontSize="11" fill="var(--chart-muted)">PC1</text>
              <text x={W / 2 + 6} y={PAD + 4} fontSize="11" fill="var(--chart-muted)">PC2</text>
            </svg>
          </Panel>
        </div>

        <Panel className="space-y-5">
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
              <Stat label="Cumulative" value={`${(((result.var1 + result.var2) / result.totalVar) * 100).toFixed(1)}%`} />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Loadings</div>
                <table className="w-full text-xs font-mono">
                  <thead><tr className="text-neutral-400"><th className="text-left">Variable</th><th>PC1</th><th>PC2</th></tr></thead>
                  <tbody>
                    {result.loadings.map((l) => (
                      <tr key={l.name} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="py-1">{l.name}</td>
                        <td className="text-center">{l.x.toFixed(3)}</td>
                        <td className="text-center">{l.y.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Drag a rectangle in the Scatter tool — those rows highlight here too.
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Drop a CSV or load an example with at least 2 numeric columns. PCA explains which
              combinations of variables capture the most variation.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
