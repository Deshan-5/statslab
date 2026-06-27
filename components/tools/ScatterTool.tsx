"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  parsePairs, pearsonR, spearmanRho, ols, tCDF, rngFor, gauss, downsample2D,
} from "./shared/stats";
import {
  Tabs, Stat, Field, DataTextArea, SampleDataButton, Panel, Btn, useRegisterToolState,
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

type RenderItem3D =
  | {
      type: "grid-line";
      x1: number; y1: number; z1: number;
      x2: number; y2: number; z2: number;
      stroke: string;
      strokeWidth: number;
      opacity: number;
      depth: number;
      dashArray?: string;
    }
  | {
      type: "point";
      x: number; y: number; z: number;
      r: number;
      color: string;
      opacity: number;
      row: number;
      depth: number;
    }
  | {
      type: "patch";
      p00: { x: number; y: number; z: number };
      p10: { x: number; y: number; z: number };
      p11: { x: number; y: number; z: number };
      p01: { x: number; y: number; z: number };
      depth: number;
    }
  | {
      type: "text";
      x: number; y: number; z: number;
      text: string;
      color: string;
      fontSize: number;
      textAnchor: "start" | "middle" | "end";
      depth: number;
    };

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
  const scale = 175; // fits nicely in 480x480
  const cx = W / 2;
  const cy = H / 2;

  const px = cx + (xRotY * scale) / denom;
  const py = cy - (yRotX * scale) / denom;

  return { px, py, depth: zRotX };
}

function cholesky3D(Sigma: number[][]) {
  const L = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  
  L[0][0] = Math.sqrt(Math.max(1e-9, Sigma[0][0]));
  L[1][0] = Sigma[1][0] / L[0][0];
  L[1][1] = Math.sqrt(Math.max(1e-9, Sigma[1][1] - L[1][0] * L[1][0]));
  
  L[2][0] = Sigma[2][0] / L[0][0];
  L[2][1] = (Sigma[2][1] - L[2][0] * L[1][0]) / L[1][1];
  L[2][2] = Math.sqrt(Math.max(1e-9, Sigma[2][2] - L[2][0] * L[2][0] - L[2][1] * L[2][1]));
  
  return L;
}

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

  // 3D States
  const [is3D, setIs3D] = useState(false);
  const [zCol, setZCol] = useState<string | null>(null);
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.3);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useRegisterToolState("scatter-plot", { tab, raw, rho, n, seed, showLine, xCol, yCol, zCol, is3D, yaw, pitch }, {
    tab: setTab,
    raw: setRaw,
    rho: setRho,
    n: setN,
    seed: setSeed,
    showLine: setShowLine,
    xCol: setXCol,
    yCol: setYCol,
    zCol: setZCol,
    is3D: setIs3D,
    yaw: setYaw,
    pitch: setPitch,
  });

  const numericColumns = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter((c) => {
      return c.values.some(v => v !== null && !isNaN(Number(v)));
    });
  }, [dataset]);

  useEffect(() => {
    if (numericColumns.length >= 2) {
      if (!xCol) setXCol(numericColumns[0].name);
      if (!yCol) setYCol(numericColumns[1].name);
      if (!zCol && numericColumns.length >= 3) setZCol(numericColumns[2].name);
    }
  }, [numericColumns, xCol, yCol, zCol]);

  const active3D = is3D && tab === "Workspace" && dataset && xCol && yCol && zCol;

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

  // 3D Point cloud from workspace
  const wsPts3D = useMemo(() => {
    if (!active3D || !dataset || !xCol || !yCol || !zCol) return [];
    const xs = dataset.columns.find((c) => c.name === xCol);
    const ys = dataset.columns.find((c) => c.name === yCol);
    const zs = dataset.columns.find((c) => c.name === zCol);
    if (!xs || !ys || !zs) return [];
    
    const out: { x: number; y: number; z: number; row: number }[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = xs.values[i], yv = ys.values[i], zv = zs.values[i];
      const xn = typeof xv === "number" ? xv : Number(xv);
      const yn = typeof yv === "number" ? yv : Number(yv);
      const zn = typeof zv === "number" ? zv : Number(zv);
      if (!isNaN(xn) && !isNaN(yn) && !isNaN(zn) && xv !== null && yv !== null && zv !== null) {
        out.push({ x: xn, y: yn, z: zn, row: i });
      }
    }
    return out;
  }, [active3D, dataset, xCol, yCol, zCol]);

  const bounds3D = useMemo(() => {
    if (wsPts3D.length === 0) return {
      xMin: -1, xMax: 1,
      yMin: -1, yMax: 1,
      zMin: -1, zMax: 1,
    };
    const xs = wsPts3D.map(p => p.x);
    const ys = wsPts3D.map(p => p.y);
    const zs = wsPts3D.map(p => p.z);
    return {
      xMin: Math.min(...xs), xMax: Math.max(...xs),
      yMin: Math.min(...ys), yMax: Math.max(...ys),
      zMin: Math.min(...zs), zMax: Math.max(...zs),
    };
  }, [wsPts3D]);

  const scale3D = (x: number, y: number, z: number) => {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = bounds3D;
    const normX = -0.75 + 1.5 * ((x - xMin) / (xMax - xMin || 1));
    const normY = -0.75 + 1.5 * ((y - yMin) / (yMax - yMin || 1));
    const normZ = -0.75 + 1.5 * ((z - zMin) / (zMax - zMin || 1));
    return { x: normX, y: normY, z: normZ };
  };

  const scaledPts = useMemo(() => {
    return wsPts3D.map(p => {
      const s = scale3D(p.x, p.y, p.z);
      return { ...s, row: p.row };
    });
  }, [wsPts3D, bounds3D]);

  const covMatrix3D = useMemo(() => {
    const N = scaledPts.length;
    if (N < 3) return null;
    
    const mx = scaledPts.reduce((sum, p) => sum + p.x, 0) / N;
    const my = scaledPts.reduce((sum, p) => sum + p.y, 0) / N;
    const mz = scaledPts.reduce((sum, p) => sum + p.z, 0) / N;

    let cxx = 0, cyy = 0, czz = 0;
    let cxy = 0, cxz = 0, cyz = 0;

    scaledPts.forEach(p => {
      const dx = p.x - mx;
      const dy = p.y - my;
      const dz = p.z - mz;
      cxx += dx * dx;
      cyy += dy * dy;
      czz += dz * dz;
      cxy += dx * dy;
      cxz += dx * dz;
      cyz += dy * dz;
    });

    const div = Math.max(1, N - 1);
    return {
      mean: { x: mx, y: my, z: mz },
      Sigma: [
        [cxx / div, cxy / div, cxz / div],
        [cxy / div, cyy / div, cyz / div],
        [cxz / div, cyz / div, czz / div]
      ]
    };
  }, [scaledPts]);

  const rXZ = useMemo(() => {
    if (!active3D || wsPts3D.length < 3) return 0;
    const xs = wsPts3D.map(p => p.x);
    const zs = wsPts3D.map(p => p.z);
    return pearsonR(xs, zs);
  }, [active3D, wsPts3D]);

  const rYZ = useMemo(() => {
    if (!active3D || wsPts3D.length < 3) return 0;
    const ys = wsPts3D.map(p => p.y);
    const zs = wsPts3D.map(p => p.z);
    return pearsonR(ys, zs);
  }, [active3D, wsPts3D]);

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

  const renderPts = useMemo(() => downsample2D(dataPts, 1500), [dataPts]);

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

  // 3D rotation dragging handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!active3D) return;
    setIsDragging3D(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!active3D || !isDragging3D || !dragStart.current) return;
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
    if (!active3D) return;
    setIsDragging3D(false);
    dragStart.current = null;
  };

  const renderItems3D = useMemo(() => {
    if (!active3D || !dataset) return [];

    const items: RenderItem3D[] = [];
    const getProj = (x: number, y: number, z: number) => getProjected(x, y, z, yaw, pitch);

    // 1. Bounding Box Outline (12 edges)
    // Floor
    items.push({ type: "grid-line", x1: -1, y1: -1, z1: -1, x2: 1, y2: -1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,-1,-1).depth + getProj(1,-1,-1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: -1, z1: -1, x2: 1, y2: -1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,-1,-1).depth + getProj(1,-1,1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: -1, z1: 1, x2: -1, y2: -1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,-1,1).depth + getProj(-1,-1,1).depth)/2 });
    items.push({ type: "grid-line", x1: -1, y1: -1, z1: 1, x2: -1, y2: -1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,-1,1).depth + getProj(-1,-1,-1).depth)/2 });

    // Ceil
    items.push({ type: "grid-line", x1: -1, y1: 1, z1: -1, x2: 1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,1,-1).depth + getProj(1,1,-1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: 1, z1: -1, x2: 1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,1,-1).depth + getProj(1,1,1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: 1, z1: 1, x2: -1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,1,1).depth + getProj(-1,1,1).depth)/2 });
    items.push({ type: "grid-line", x1: -1, y1: 1, z1: 1, x2: -1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,1,1).depth + getProj(-1,1,-1).depth)/2 });

    // Pillars
    items.push({ type: "grid-line", x1: -1, y1: -1, z1: -1, x2: -1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,-1,-1).depth + getProj(-1,1,-1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: -1, z1: -1, x2: 1, y2: 1, z2: -1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,-1,-1).depth + getProj(1,1,-1).depth)/2 });
    items.push({ type: "grid-line", x1: 1, y1: -1, z1: 1, x2: 1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(1,-1,1).depth + getProj(1,1,1).depth)/2 });
    items.push({ type: "grid-line", x1: -1, y1: -1, z1: 1, x2: -1, y2: 1, z2: 1, stroke: "var(--chart-axis)", strokeWidth: 1.2, opacity: 0.6, depth: (getProj(-1,-1,1).depth + getProj(-1,1,1).depth)/2 });

    // Grid Floor lines
    const gridVals = [-0.5, 0, 0.5];
    gridVals.forEach(v => {
      items.push({ type: "grid-line", x1: v, y1: -1, z1: -1, x2: v, y2: -1, z2: 1, stroke: "var(--chart-grid)", strokeWidth: 0.8, opacity: 0.35, depth: (getProj(v,-1,-1).depth + getProj(v,-1,1).depth)/2 });
      items.push({ type: "grid-line", x1: -1, y1: -1, z1: v, x2: 1, y2: -1, z2: v, stroke: "var(--chart-grid)", strokeWidth: 0.8, opacity: 0.35, depth: (getProj(-1,-1,v).depth + getProj(1,-1,v).depth)/2 });
    });

    // 2. Add Axis Labels
    items.push({ type: "text", x: 1.1, y: -1, z: -1, text: xCol || "X", color: "var(--chart-muted)", fontSize: 10, textAnchor: "start", depth: getProj(1.1, -1, -1).depth });
    items.push({ type: "text", x: -1, y: 1.1, z: -1, text: yCol || "Y", color: "var(--chart-muted)", fontSize: 10, textAnchor: "middle", depth: getProj(-1, 1.1, -1).depth });
    items.push({ type: "text", x: -1, y: -1, z: 1.1, text: zCol || "Z", color: "var(--chart-muted)", fontSize: 10, textAnchor: "end", depth: getProj(-1, -1, 1.1).depth });

    // 3. Add Covariance Ellipsoid Patches
    if (covMatrix3D && covMatrix3D.Sigma) {
      try {
        const L = cholesky3D(covMatrix3D.Sigma);
        const latSteps = 12;
        const lonSteps = 12;
        const spherePoints: { x: number; y: number; z: number }[][] = [];

        for (let i = 0; i <= latSteps; i++) {
          const theta = (i * Math.PI) / latSteps;
          const row: { x: number; y: number; z: number }[] = [];
          for (let j = 0; j <= lonSteps; j++) {
            const phi = (j * 2 * Math.PI) / lonSteps;
            const ux = Math.sin(theta) * Math.cos(phi);
            const uy = Math.sin(theta) * Math.sin(phi);
            const uz = Math.cos(theta);
            
            const lx = L[0][0] * ux;
            const ly = L[1][0] * ux + L[1][1] * uy;
            const lz = L[2][0] * ux + L[2][1] * uy + L[2][2] * uz;
            
            row.push({
              x: covMatrix3D.mean.x + 1.5 * lx,
              y: covMatrix3D.mean.y + 1.5 * ly,
              z: covMatrix3D.mean.z + 1.5 * lz
            });
          }
          spherePoints.push(row);
        }

        // Add patches
        for (let i = 0; i < latSteps; i++) {
          for (let j = 0; j < lonSteps; j++) {
            const p00 = spherePoints[i][j];
            const p10 = spherePoints[i+1][j];
            const p11 = spherePoints[i+1][j+1];
            const p01 = spherePoints[i][j+1];
            
            const x_avg = (p00.x + p10.x + p11.x + p01.x) / 4;
            const y_avg = (p00.y + p10.y + p11.y + p01.y) / 4;
            const z_avg = (p00.z + p10.z + p11.z + p01.z) / 4;

            items.push({
              type: "patch",
              p00, p10, p11, p01,
              depth: getProj(x_avg, y_avg, z_avg).depth
            });
          }
        }
      } catch (err) {
        console.error("Error computing Cholesky / Ellipsoid:", err);
      }
    }

    // 4. Add data points
    scaledPts.forEach((p) => {
      const sel = isSelected(p.row);

      // Vertical drop line to floor (y = -1)
      items.push({
        type: "grid-line",
        x1: p.x, y1: p.y, z1: p.z,
        x2: p.x, y2: -1, z2: p.z,
        stroke: "var(--chart-grid)",
        strokeWidth: 0.6,
        opacity: sel ? 0.55 : 0.22,
        dashArray: "2 2",
        depth: getProj(p.x, (p.y - 1) / 2, p.z).depth
      });

      items.push({
        type: "point",
        x: p.x,
        y: p.y,
        z: p.z,
        r: 3.5,
        color: "var(--chart-ink)",
        opacity: 0.85,
        row: p.row!,
        depth: getProj(p.x, p.y, p.z).depth
      });
    });

    items.sort((a, b) => a.depth - b.depth);
    return items;
  }, [active3D, dataset, xCol, yCol, zCol, yaw, pitch, scaledPts, covMatrix3D]);

  const tabs = dataset
    ? ["Workspace", "Your Data", "Simulation", "Interactive"]
    : ["Your Data", "Simulation", "Interactive"];

  const getProj = (x: number, y: number, z: number) => getProjected(x, y, z, yaw, pitch);

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
        <Panel>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
                 className={`w-full h-auto select-none ${tab === "Interactive" ? "cursor-crosshair" : tab === "Workspace" && !active3D ? "cursor-crosshair" : ""}`}
                 onClick={active3D ? undefined : onSvgClick}
                 onPointerDown={active3D ? handlePointerDown : onPointerDown}
                 onPointerMove={active3D ? handlePointerMove : onPointerMove}
                 onPointerUp={active3D ? handlePointerUp : onPointerUp}
                 onPointerLeave={active3D ? handlePointerUp : undefined}
                 style={{ touchAction: "none" }}>
              {active3D ? (
                renderItems3D.map((item, idx) => {
                  if (item.type === "grid-line") {
                    const p1 = getProj(item.x1, item.y1, item.z1);
                    const p2 = getProj(item.x2, item.y2, item.z2);
                    return (
                      <line
                        key={`l-${idx}`}
                        x1={p1.px}
                        y1={p1.py}
                        x2={p2.px}
                        y2={p2.py}
                        stroke={item.stroke}
                        strokeWidth={item.strokeWidth}
                        opacity={item.opacity}
                        strokeDasharray={item.dashArray}
                      />
                    );
                  } else if (item.type === "text") {
                    const p = getProj(item.x, item.y, item.z);
                    return (
                      <text
                        key={`t-${idx}`}
                        x={p.px}
                        y={p.py}
                        fill={item.color}
                        fontSize={item.fontSize}
                        textAnchor={item.textAnchor}
                        className="font-medium"
                      >
                        {item.text}
                      </text>
                    );
                  } else if (item.type === "patch") {
                    const p00 = getProj(item.p00.x, item.p00.y, item.p00.z);
                    const p10 = getProj(item.p10.x, item.p10.y, item.p10.z);
                    const p11 = getProj(item.p11.x, item.p11.y, item.p11.z);
                    const p01 = getProj(item.p01.x, item.p01.y, item.p01.z);
                    return (
                      <polygon
                        key={`p-${idx}`}
                        points={`${p00.px},${p00.py} ${p10.px},${p10.py} ${p11.px},${p11.py} ${p01.px},${p01.py}`}
                        fill="rgba(99, 102, 241, 0.08)"
                        stroke="rgba(99, 102, 241, 0.25)"
                        strokeWidth="0.5"
                      />
                    );
                  } else {
                    const p = getProj(item.x, item.y, item.z);
                    const sel = isSelected(item.row);
                    return (
                      <circle
                        key={`pt-${idx}`}
                        cx={p.px}
                        cy={p.py}
                        r={sel ? 5.5 : item.r}
                        fill={sel ? "#fb923c" : item.color}
                        fillOpacity={sel ? 0.95 : item.opacity}
                        stroke={sel ? "#fff" : "none"}
                        strokeWidth={sel ? 1 : 0}
                      />
                    );
                  }
                })
              ) : (
                <>
                  <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-grid)" />
                  <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="var(--chart-grid)" />
                  {showLine && reg && (
                    <line x1={sx(xMin)} y1={sy(reg.intercept + reg.slope * xMin)}
                          x2={sx(xMax)} y2={sy(reg.intercept + reg.slope * xMax)}
                          stroke="var(--chart-ink)" strokeWidth={2} />
                  )}
                  {renderPts.map((p, i) => {
                    const sel = p.row !== undefined && isSelected(p.row);
                    return (
                      <circle key={i} cx={sx(p.x)} cy={sy(p.y)}
                        r={sel ? 4 : 2.8}
                        fill={sel ? "#fb923c"
                              : tab === "Interactive" && i === interactive.length - 1 ? "#fb923c"
                              : "var(--chart-ink)"}
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
                </>
              )}

              {active3D && (
                <>
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
        <Panel className="space-y-5">
          {tab === "Workspace" && dataset && (
            <>
              <ColumnPicker label="X column" value={xCol} onChange={setXCol} />
              <ColumnPicker label="Y column" value={yCol} onChange={setYCol} />
              {is3D && <ColumnPicker label="Z column" value={zCol} onChange={setZCol} />}
              
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer font-medium border-t border-neutral-100 dark:border-neutral-800 pt-2 pb-2">
                <input
                  type="checkbox" checked={is3D}
                  onChange={(e) => setIs3D(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                3D Scatter & Correlation Ellipsoid
              </label>

              {!is3D && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Drag a rectangle to select rows — they&apos;ll highlight in every other tool.
                </p>
              )}
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
          
          {!active3D && (
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input type="checkbox" checked={showLine} onChange={(e) => setShowLine(e.target.checked)} />
              Show OLS line
            </label>
          )}

          {active3D ? (
            <>
              <Stat label={`Pearson r (${xCol} vs ${yCol})`} value={r.toFixed(4)} />
              <Stat label={`Pearson r (${xCol} vs ${zCol})`} value={rXZ.toFixed(4)} />
              <Stat label={`Pearson r (${yCol} vs ${zCol})`} value={rYZ.toFixed(4)} />
            </>
          ) : (
            <>
              <Stat label="Pearson r"  value={r.toFixed(4)} sub={`r² = ${(r * r).toFixed(4)}`} />
              <Stat label="Spearman ρ" value={rho_s.toFixed(4)} />
              <Stat label="p-value (r)" value={pR.toFixed(4)} />
              {reg && <Stat label="OLS line" value={`y = ${reg.slope.toFixed(3)}x + ${reg.intercept.toFixed(3)}`} />}
            </>
          )}
          <Stat label="n" value={String(dataPts.length)} />
        </Panel>
      </div>
    </div>
  );
}
