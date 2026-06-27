"use client";

import { useMemo, useState, useRef } from "react";
import {
  normalPDF, normalCDF, normalInv,
  parseNumbers, mean, sd, skewness, kurtosis,
} from "./shared/stats";
import {
  Tabs, Field, Stat, NumberInput, DataTextArea, Select, SampleDataButton,
  Panel, Btn, Formula, Interpretation, useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 720, H = 320, PAD = 36;
const VIEW3D_W = 560;
const VIEW3D_H = 420;

function pdfPath(mu: number, sigma: number) {
  const xs = Array.from({ length: 240 }, (_, i) => mu - 5 * sigma + (10 * sigma * i) / 239);
  const ys = xs.map((x) => normalPDF(x, mu, sigma));
  const ymax = Math.max(...ys);
  const px = (x: number) => PAD + ((x - (mu - 5 * sigma)) / (10 * sigma)) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(ys[i]).toFixed(2)}`).join(" ");
  return { xs, ys, ymax, px, py, path };
}

const SAMPLE = "62, 65, 68, 70, 71, 72, 72, 73, 74, 75, 76, 77, 78, 80, 82, 84";

export default function NormalDistributionTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState("Curve");
  const [mu, setMu] = useState(0);
  const [sigma, setSigma] = useState(1);

  // probability calculator
  const [calcMode, setCalcMode] = useState<"lt" | "gt" | "between">("lt");
  const [aVal, setAVal] = useState(1);
  const [bVal, setBVal] = useState(2);

  // z-score calculator
  const [rawX, setRawX] = useState(75);

  // data overlay
  const [rawData, setRawData] = useState("");
  const [valueCol, setValueCol] = useState<string | null>(null);

  // 3D states
  const [is3D, setIs3D] = useState(false);
  const [muY, setMuY] = useState(0);
  const [sigmaY, setSigmaY] = useState(1);
  const [rho, setRho] = useState(0.5);
  const [yaw, setYaw] = useState(-0.6);
  const [pitch, setPitch] = useState(0.6);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useRegisterToolState("normal-distribution", { mu, sigma, calcMode, aVal, bVal, rawX, rawData, valueCol, tab, is3D, muY, sigmaY, rho, yaw, pitch }, {
    mu: setMu,
    sigma: setSigma,
    calcMode: (v) => { if (["lt", "gt", "between"].includes(v)) setCalcMode(v as any); },
    aVal: setAVal,
    bVal: setBVal,
    rawX: setRawX,
    rawData: setRawData,
    valueCol: setValueCol,
    tab: setTab,
    is3D: setIs3D,
    muY: setMuY,
    sigmaY: setSigmaY,
    rho: setRho,
    yaw: setYaw,
    pitch: setPitch,
  });

  const wsData = useMemo(() => {
    if (!dataset || !valueCol) return null;
    const c = dataset.columns.find((c) => c.name === valueCol);
    return c?.numeric ?? null;
  }, [dataset, valueCol]);
  const manualData = useMemo(() => parseNumbers(rawData), [rawData]);
  const dataPts = tab === "Data Overlay" && wsData && wsData.length >= 2 ? wsData : manualData;

  const c = pdfPath(mu, sigma);

  // shaded region path
  const shadeRegion = (() => {
    const inRegion = (x: number) =>
      calcMode === "lt" ? x <= aVal :
      calcMode === "gt" ? x >= aVal :
      x >= aVal && x <= bVal;
    let d = "";
    let started = false;
    for (let i = 0; i < c.xs.length; i++) {
      const x = c.xs[i], y = c.ys[i];
      if (inRegion(x)) {
        if (!started) { d += `M${c.px(x)},${H - PAD} L${c.px(x)},${c.py(y)}`; started = true; }
        else d += ` L${c.px(x)},${c.py(y)}`;
      } else if (started) {
        d += ` L${c.px(c.xs[i - 1])},${H - PAD} Z`;
        started = false;
      }
    }
    if (started) {
      const last = c.xs[c.xs.length - 1];
      d += ` L${c.px(last)},${H - PAD} Z`;
    }
    return d;
  })();

  const probability =
    calcMode === "lt"      ? normalCDF((aVal - mu) / sigma) :
    calcMode === "gt"      ? 1 - normalCDF((aVal - mu) / sigma) :
                             normalCDF((bVal - mu) / sigma) - normalCDF((aVal - mu) / sigma);

  const z = (rawX - mu) / sigma;
  const percentile = normalCDF(z) * 100;

  const overlayInterpretation = (() => {
    if (tab !== "Data Overlay" || !dataPts || dataPts.length < 4) return null;
    const fittedMu = mean(dataPts);
    const fittedSigma = sd(dataPts);
    const sk = skewness(dataPts);
    const ek = kurtosis(dataPts);
    const looksNormal = Math.abs(sk) < 0.5 && Math.abs(ek) < 1;
    return `Fitted μ=${fittedMu.toFixed(3)}, σ=${fittedSigma.toFixed(3)}. Sample skew=${sk.toFixed(3)}, excess kurt=${ek.toFixed(3)} — data ${looksNormal ? "appears" : "does not appear"} approximately Normal (rule of thumb: |skew|<0.5 and |excess kurt|<1).`;
  })();

  // overlay histogram
  const histo = (() => {
    if (!dataPts || dataPts.length < 2) return null;
    const bins = 14;
    const lo = mu - 5 * sigma, hi = mu + 5 * sigma;
    const w = (hi - lo) / bins;
    const counts = Array(bins).fill(0);
    for (const v of dataPts) {
      if (v < lo || v >= hi) continue;
      counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    }
    // density-normalize
    const norm = counts.map((c) => c / dataPts.length / w);
    return { norm, lo, w, max: Math.max(...norm), bins };
  })();

  // 3D dragging handlers
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging3D || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setYaw((y) => y + dx * 0.01);
    setPitch((p) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p - dy * 0.01)));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging3D(false);
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const maxDensity = useMemo(() => {
    const rho2 = rho * rho;
    return 1 / (2 * Math.PI * sigma * sigmaY * Math.sqrt(1 - rho2));
  }, [sigma, sigmaY, rho]);

  const covariance = useMemo(() => {
    return rho * sigma * sigmaY;
  }, [rho, sigma, sigmaY]);

  const correlationInterpretation = useMemo(() => {
    if (!is3D) return null;
    const absRho = Math.abs(rho);
    const direction = rho > 0 ? "positive" : rho < 0 ? "negative" : "no";
    const strength = absRho > 0.8 ? "strong" : absRho > 0.4 ? "moderate" : absRho > 0.1 ? "weak" : "virtually no";
    let desc = `Bivariate Normal PDF fitted with Covariance = ${covariance.toFixed(3)}. The joint distribution shows a ${strength} ${direction} correlation. `;
    if (rho > 0.1) {
      desc += `The bell surface stretches and elongates along the diagonal line X = Y, illustrating that high values of X are associated with high values of Y. The peak density is ${maxDensity.toFixed(4)}.`;
    } else if (rho < -0.1) {
      desc += `The bell surface stretches and elongates along the diagonal line X = -Y, showing that high values of X are associated with low values of Y. The peak density is ${maxDensity.toFixed(4)}.`;
    } else {
      desc += `The bell surface is perfectly symmetrical and circular, indicating X and Y are uncorrelated and independent. The peak density is ${maxDensity.toFixed(4)}.`;
    }
    return desc;
  }, [is3D, rho, sigma, sigmaY, covariance, maxDensity]);

  const renderItems3D = useMemo(() => {
    if (!is3D) return [];

    const getProj = (x: number, y: number, z: number) => {
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
      const scale = 175; // fits inside 560x420
      const cx = VIEW3D_W / 2;
      const cy = VIEW3D_H / 2 - 10;

      const px = cx + (xRotY * scale) / denom;
      const py = cy - (yRotX * scale) / denom;

      return { px, py, depth: zRotX };
    };

    const rho2 = rho * rho;
    const N = 21;
    const minVal = -4;
    const maxVal = 4;
    const rangeVal = maxVal - minVal;

    // Create 2D grid of vertices
    const grid: { px: number; py: number; depth: number; density: number; rx: number; ry: number; rz: number }[][] = [];
    for (let i = 0; i < N; i++) {
      const row: { px: number; py: number; depth: number; density: number; rx: number; ry: number; rz: number }[] = [];
      const xVal = minVal + (rangeVal * i) / (N - 1);
      const nx = -1 + (2 * i) / (N - 1);

      for (let j = 0; j < N; j++) {
        const yVal = minVal + (rangeVal * j) / (N - 1);
        const nz = -1 + (2 * j) / (N - 1);

        // Bivariate Normal PDF Formula
        const dx = (xVal - mu) / sigma;
        const dy = (yVal - muY) / sigmaY;
        const term = dx * dx + dy * dy - 2 * rho * dx * dy;
        const density = Math.exp(-term / (2 * (1 - rho2))) / (2 * Math.PI * sigma * sigmaY * Math.sqrt(1 - rho2));

        // Scale Y height between [-1, 0.8] relative to maxDensity
        const ny = -1 + 1.8 * (density / maxDensity);

        const proj = getProj(nx, ny, nz);
        row.push({
          px: proj.px,
          py: proj.py,
          depth: proj.depth,
          density,
          rx: nx,
          ry: ny,
          rz: nz
        });
      }
      grid.push(row);
    }

    // Grid patches
    interface PatchItem {
      type: "patch";
      points: string;
      depth: number;
      density: number;
      shade: number;
    }
    const patches: PatchItem[] = [];

    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const p00 = grid[i][j];
        const p10 = grid[i + 1][j];
        const p11 = grid[i + 1][j + 1];
        const p01 = grid[i][j + 1];

        const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) / 4;
        const avgDensity = (p00.density + p10.density + p11.density + p01.density) / 4;

        // Lambertian shading normal calculation
        const ux = p10.rx - p00.rx;
        const uy = p10.ry - p00.ry;
        const uz = p10.rz - p00.rz;

        const vx = p01.rx - p00.rx;
        const vy = p01.ry - p00.ry;
        const vz = p01.rz - p00.rz;

        const normX = uy * vz - uz * vy;
        const normY = uz * vx - ux * vz;
        const normZ = ux * vy - uy * vx;

        const len = Math.hypot(normX, normY, normZ) || 1e-9;
        const nnx = normX / len;
        const nny = normY / len;
        const nnz = normZ / len;

        // Light vector: (0.5, 0.8, -0.3) normalized
        const lightLen = Math.hypot(0.5, 0.8, -0.3);
        const lX = 0.5 / lightLen;
        const lY = 0.8 / lightLen;
        const lZ = -0.3 / lightLen;

        const dot = nnx * lX + nny * lY + nnz * lZ;
        const shade = 0.85 + 0.25 * dot;

        const pointsStr = `${p00.px.toFixed(1)},${p00.py.toFixed(1)} ${p10.px.toFixed(1)},${p10.py.toFixed(1)} ${p11.px.toFixed(1)},${p11.py.toFixed(1)} ${p01.px.toFixed(1)},${p01.py.toFixed(1)}`;

        patches.push({
          type: "patch",
          points: pointsStr,
          depth: avgDepth,
          density: avgDensity,
          shade
        });
      }
    }

    // Box outlines
    const boxCorners = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], // Floor
      [-1, 0.8, -1], [1, 0.8, -1], [1, 0.8, 1], [-1, 0.8, 1] // Ceiling
    ];

    interface EdgeItem {
      type: "edge";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      depth: number;
      color: string;
      strokeWidth: number;
      isDash?: boolean;
    }
    const edges: EdgeItem[] = [];

    const getEdgeProj = (c1: number[], c2: number[]) => {
      const p1 = getProj(c1[0], c1[1], c1[2]);
      const p2 = getProj(c2[0], c2[1], c2[2]);
      return {
        x1: p1.px,
        y1: p1.py,
        x2: p2.px,
        y2: p2.py,
        depth: (p1.depth + p2.depth) / 2
      };
    };

    const floorIndices = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const ceilIndices = [[4, 5], [5, 6], [6, 7], [7, 4]];
    const pillarIndices = [[0, 4], [1, 5], [2, 6], [3, 7]];

    for (const [i1, i2] of floorIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }
    for (const [i1, i2] of ceilIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }
    for (const [i1, i2] of pillarIndices) {
      const e = getEdgeProj(boxCorners[i1], boxCorners[i2]);
      edges.push({ type: "edge", ...e, color: "var(--chart-axis)", strokeWidth: 1, isDash: true });
    }

    // Text labels
    interface TextItem {
      type: "text";
      x: number;
      y: number;
      text: string;
      depth: number;
      color: string;
      fontSize: number;
      textAnchor: "start" | "middle" | "end";
    }
    const textItems: TextItem[] = [];

    const xLabelProj = getProj(0, -1.2, 1.25);
    textItems.push({
      type: "text",
      x: xLabelProj.px,
      y: xLabelProj.py,
      text: `X (μx = ${mu.toFixed(1)}, σx = ${sigma.toFixed(1)})`,
      depth: xLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    const yLabelProj = getProj(-1.25, 0, 1.25);
    textItems.push({
      type: "text",
      x: yLabelProj.px,
      y: yLabelProj.py,
      text: `Density f(x,y)`,
      depth: yLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    const zLabelProj = getProj(1.25, -1.25, 0);
    textItems.push({
      type: "text",
      x: zLabelProj.px,
      y: zLabelProj.py,
      text: `Y (μy = ${muY.toFixed(1)}, σy = ${sigmaY.toFixed(1)})`,
      depth: zLabelProj.depth,
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    const c1Proj = getProj(-1.05, -1.05, 1.05);
    textItems.push({
      type: "text", x: c1Proj.px, y: c1Proj.py, text: "(-4, -4)", depth: c1Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "end"
    });
    const c2Proj = getProj(1.05, -1.05, 1.05);
    textItems.push({
      type: "text", x: c2Proj.px, y: c2Proj.py, text: "(4, -4)", depth: c2Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "start"
    });
    const c3Proj = getProj(-1.05, -1.05, -1.05);
    textItems.push({
      type: "text", x: c3Proj.px, y: c3Proj.py, text: "(-4, 4)", depth: c3Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "end"
    });
    const c4Proj = getProj(1.05, -1.05, -1.05);
    textItems.push({
      type: "text", x: c4Proj.px, y: c4Proj.py, text: "(4, 4)", depth: c4Proj.depth,
      color: "var(--chart-muted)", fontSize: 9, textAnchor: "start"
    });

    type Renderable = PatchItem | EdgeItem | TextItem;
    const sorted: Renderable[] = [...patches, ...edges, ...textItems].sort((a, b) => a.depth - b.depth);
    return sorted;
  }, [is3D, mu, muY, sigma, sigmaY, rho, yaw, pitch, maxDensity]);

  return (
    <div className="space-y-6">
      {is3D ? (
        <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-3 rounded-lg">
          <div>
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">3D Bivariate Normal Distribution</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Joint probability density function of two correlated normal variables</p>
          </div>
          <span className="text-xs bg-orange-500/10 text-orange-500 dark:text-orange-400 px-2.5 py-1 rounded-full font-medium border border-orange-500/20">
            Interactive 3D
          </span>
        </div>
      ) : (
        <Tabs tabs={["Curve", "Probability", "Z-Score", "Data Overlay"]} active={tab} onChange={setTab} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            {is3D ? (
              <svg
                viewBox={`0 0 ${VIEW3D_W} ${VIEW3D_H}`}
                className="w-full h-auto select-none cursor-move"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {renderItems3D.map((item, idx) => {
                  if (item.type === "patch") {
                    const ratio = item.density / maxDensity;
                    // Interpolate from deep indigo (ratio = 0) to bright orange (ratio = 1)
                    let r = Math.round(79 + 172 * ratio);
                    let g = Math.round(70 + 76 * ratio);
                    let b = Math.round(229 - 169 * ratio);

                    r = Math.max(0, Math.min(255, Math.round(r * item.shade)));
                    g = Math.max(0, Math.min(255, Math.round(g * item.shade)));
                    b = Math.max(0, Math.min(255, Math.round(b * item.shade)));

                    const fillColor = `rgba(${r}, ${g}, ${b}, ${0.3 + 0.45 * ratio})`;
                    const strokeColor = `rgba(${r}, ${g}, ${b}, ${0.4 + 0.4 * ratio})`;

                    return (
                      <polygon
                        key={`p-${idx}`}
                        points={item.points}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={0.8}
                      />
                    );
                  } else if (item.type === "edge") {
                    return (
                      <line
                        key={`e-${idx}`}
                        x1={item.x1}
                        y1={item.y1}
                        x2={item.x2}
                        y2={item.y2}
                        stroke={item.color}
                        strokeWidth={item.strokeWidth}
                        strokeDasharray={item.isDash ? "3 3" : undefined}
                        strokeOpacity={0.7}
                      />
                    );
                  } else if (item.type === "text") {
                    return (
                      <text
                        key={`t-${idx}`}
                        x={item.x}
                        y={item.y}
                        fill={item.color}
                        fontSize={item.fontSize}
                        textAnchor={item.textAnchor}
                        className="font-medium"
                      >
                        {item.text}
                      </text>
                    );
                  }
                  return null;
                })}

                <text x={VIEW3D_W / 2} y={VIEW3D_H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                  Drag to rotate view · Shift sliders to stretch and morph surface
                </text>

                <g 
                  className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setYaw(-0.6);
                    setPitch(0.6);
                  }}
                  transform={`translate(${VIEW3D_W - 80}, ${VIEW3D_H - 24})`}
                >
                  <rect width="70" height="18" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                  <text x="35" y="12" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
                </g>
              </svg>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-axis)" />
                <line x1={c.px(mu)} y1={PAD} x2={c.px(mu)} y2={H - PAD} stroke="#fb923c" strokeDasharray="4 4" />
                {tab === "Probability" && shadeRegion && (
                  <path d={shadeRegion} fill="#fb923c" fillOpacity={0.18} />
                )}
                {tab === "Z-Score" && (
                  <line x1={c.px(rawX)} y1={PAD} x2={c.px(rawX)} y2={H - PAD} stroke="#2563eb" strokeWidth={2} />
                )}
                {tab === "Data Overlay" && histo && (() => {
                  const ymax = Math.max(c.ymax, histo.max);
                  const py = (y: number) => H - PAD - (y / ymax) * (H - 2 * PAD);
                  const barW = (W - 2 * PAD) / histo.bins;
                  return histo.norm.map((v, i) => (
                    <rect key={i}
                      x={PAD + i * barW + 1}
                      y={py(v)}
                      width={barW - 2}
                      height={H - PAD - py(v)}
                      fill="var(--chart-ink)" fillOpacity={0.18}
                    />
                  ));
                })()}
                <path d={c.path} fill="none" stroke="var(--chart-ink)" strokeWidth={2} />
                {[-3, -2, -1, 0, 1, 2, 3].map((z) => {
                  const x = mu + z * sigma;
                  return <text key={z} x={c.px(x)} y={H - PAD + 16} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">{x.toFixed(1)}</text>;
                })}
              </svg>
            )}
          </Panel>
          <Interpretation text={is3D ? correlationInterpretation : overlayInterpretation} />
        </div>

        <Panel className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">3D Bivariate Surface</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={is3D} onChange={(e) => setIs3D(e.target.checked)} />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 dark:after:bg-neutral-600 after:border-neutral-300 dark:after:border-neutral-800 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {is3D ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800/50 pb-1 mb-2">Variable X Parameters</div>
              <Field label="μX (mean X)" value={mu.toFixed(2)}>
                <input type="range" min={-3} max={3} step={0.1} value={mu} onChange={(e) => setMu(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="μX exact" value={mu} onChange={setMu} step={0.1} />
              
              <Field label="σX (std X)" value={sigma.toFixed(2)}>
                <input type="range" min={0.3} max={2.5} step={0.1} value={sigma} onChange={(e) => setSigma(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="σX exact" value={sigma} onChange={setSigma} step={0.1} min={0.01} />

              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800/50 pb-1 mt-4 mb-2">Variable Y Parameters</div>
              <Field label="μY (mean Y)" value={muY.toFixed(2)}>
                <input type="range" min={-3} max={3} step={0.1} value={muY} onChange={(e) => setMuY(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="μY exact" value={muY} onChange={setMuY} step={0.1} />

              <Field label="σY (std Y)" value={sigmaY.toFixed(2)}>
                <input type="range" min={0.3} max={2.5} step={0.1} value={sigmaY} onChange={(e) => setSigmaY(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="σY exact" value={sigmaY} onChange={setSigmaY} step={0.1} min={0.01} />

              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800/50 pb-1 mt-4 mb-2">Relationship</div>
              <Field label="ρ (correlation)" value={rho.toFixed(2)}>
                <input type="range" min={-0.95} max={0.95} step={0.05} value={rho} onChange={(e) => setRho(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="ρ exact" value={rho} onChange={setRho} step={0.05} min={-0.99} max={0.99} />

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                <Stat label="Covariance σXY" value={covariance.toFixed(4)} />
                <Stat label="Peak Density" value={maxDensity.toFixed(4)} />
              </div>
            </>
          ) : (
            <>
              <Field label="μ (mean)" value={mu.toFixed(2)}>
                <input type="range" min={-5} max={5} step={0.1} value={mu} onChange={(e) => setMu(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="μ exact" value={mu} onChange={setMu} step={0.1} />
              <Field label="σ (std)" value={sigma.toFixed(2)}>
                <input type="range" min={0.2} max={5} step={0.1} value={sigma} onChange={(e) => setSigma(Number(e.target.value))} className="w-full" />
              </Field>
              <NumberInput label="σ exact" value={sigma} onChange={setSigma} step={0.1} min={0.01} />

              {tab === "Curve" && (
                <>
                  <Stat label="Variance σ²" value={(sigma * sigma).toFixed(3)} />
                  <Stat label="68% interval" value={`[${(mu - sigma).toFixed(2)}, ${(mu + sigma).toFixed(2)}]`} />
                  <Stat label="95% interval" value={`[${(mu - 2 * sigma).toFixed(2)}, ${(mu + 2 * sigma).toFixed(2)}]`} />
                  <Stat label="99.7% interval" value={`[${(mu - 3 * sigma).toFixed(2)}, ${(mu + 3 * sigma).toFixed(2)}]`} />
                </>
              )}

              {tab === "Probability" && (
                <>
                  <Select label="Region" value={calcMode}
                    onChange={(v) => setCalcMode(v as "lt" | "gt" | "between")}
                    options={[
                      { value: "lt", label: "P(X ≤ a)" },
                      { value: "gt", label: "P(X ≥ a)" },
                      { value: "between", label: "P(a ≤ X ≤ b)" },
                    ]} />
                  <NumberInput label="a" value={aVal} onChange={setAVal} step={0.1} />
                  {calcMode === "between" && <NumberInput label="b" value={bVal} onChange={setBVal} step={0.1} />}
                  <Stat label="Probability" value={probability.toFixed(4)} sub={`${(probability * 100).toFixed(2)}%`} />
                  <Formula text={
                    calcMode === "lt" ? `Φ((${aVal} − ${mu})/${sigma})` :
                    calcMode === "gt" ? `1 − Φ((${aVal} − ${mu})/${sigma})` :
                    `Φ((${bVal} − ${mu})/${sigma}) − Φ((${aVal} − ${mu})/${sigma})`
                  } />
                </>
              )}

              {tab === "Z-Score" && (
                <>
                  <NumberInput label="Raw value x" value={rawX} onChange={setRawX} step={0.1} />
                  <Stat label="z-score" value={z.toFixed(4)} />
                  <Stat label="Percentile" value={`${percentile.toFixed(2)}%`} />
                  <Formula text={`z = (x − μ) / σ = (${rawX} − ${mu}) / ${sigma}`} />
                  <div className="text-xs text-neutral-500 mt-2">
                    Inverse: at the {percentile.toFixed(0)}th percentile, x ≈ {(mu + normalInv(percentile / 100) * sigma).toFixed(2)}
                  </div>
                </>
              )}

              {tab === "Data Overlay" && (
                <>
                  {dataset && (
                    <ColumnPicker label="Workspace column (optional)" value={valueCol} onChange={setValueCol} kind="numeric" autoPick={false} />
                  )}
                  {!(valueCol && wsData) && (
                    <>
                      <DataTextArea label="Data" value={rawData} onChange={setRawData}
                        placeholder="62, 65, 68, …" rows={5} />
                      <SampleDataButton onClick={() => setRawData(SAMPLE)} />
                    </>
                  )}
                  {dataPts && dataPts.length >= 2 && (
                    <>
                      <Stat label="Sample n" value={`${dataPts.length}`} />
                      <Stat label="Sample mean" value={mean(dataPts).toFixed(3)} sub={`vs μ = ${mu}`} />
                      <Stat label="Sample SD"   value={sd(dataPts).toFixed(3)}   sub={`vs σ = ${sigma}`} />
                      <Btn onClick={() => { setMu(Number(mean(dataPts).toFixed(2))); setSigma(Number(sd(dataPts).toFixed(2))); }}>
                        Fit μ, σ to data
                      </Btn>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

