"use client";

import { useMemo, useRef, useState } from "react";
import {
  ols,
  parsePairs,
  mean,
  normalInv,
  tCDF,
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
  useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";
import { Minimize2, Maximize2 } from "lucide-react";

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

interface Regression3DResult {
  b0: number;
  b1: number;
  b2: number;
  r2: number;
  adjR2: number;
  seB0: number;
  seB1: number;
  seB2: number;
  tB0: number;
  tB1: number;
  tB2: number;
  pB0: number;
  pB1: number;
  pB2: number;
  residuals: number[];
  fitted: number[];
  df: number;
  invXTx: number[][];
}

type RenderItem =
  | { type: "line"; x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; stroke: string; strokeWidth: number; dashArray?: string; opacity?: number }
  | { type: "point"; x: number; y: number; z: number; r: number; color: string; stroke: string; strokeWidth: number; label?: string; row?: number }
  | { type: "polygon"; points: { x: number; y: number; z: number }[]; fill: string; stroke: string; strokeWidth: number; opacity?: number }
  | { type: "text"; x: number; y: number; z: number; text: string; color: string; fontSize: number; textAnchor: "start" | "middle" | "end" | "inherit" };

const DEFAULT_POINTS_3D = [
  { x1: 1.0, x2: 2.0, y: 3.5 },
  { x1: 1.7, x2: 2.5, y: 4.2 },
  { x1: 2.4, x2: 1.8, y: 5.1 },
  { x1: 3.1, x2: 3.2, y: 6.0 },
  { x1: 3.8, x2: 2.8, y: 6.8 },
  { x1: 4.5, x2: 4.0, y: 7.5 },
  { x1: 5.2, x2: 3.5, y: 8.2 },
  { x1: 5.9, x2: 5.0, y: 9.1 },
  { x1: 6.6, x2: 4.5, y: 9.8 }
];

const SAMPLE_DATA_3D = `1.0, 2.0, 3.5
1.7, 2.5, 4.2
2.4, 1.8, 5.1
3.1, 3.2, 6.0
3.8, 2.8, 6.8
4.5, 4.0, 7.5
5.2, 3.5, 8.2
5.9, 5.0, 9.1
6.6, 4.5, 9.8`;

function ols3D(
  x1: number[],
  x2: number[],
  y: number[]
): Regression3DResult | null {
  const N = y.length;
  if (N < 4) return null;

  let sumX1 = 0, sumX2 = 0, sumY = 0;
  let sumX1Sq = 0, sumX2Sq = 0, sumYSq = 0;
  let sumX1X2 = 0, sumX1Y = 0, sumX2Y = 0;

  for (let i = 0; i < N; i++) {
    const x1Val = x1[i];
    const x2Val = x2[i];
    const yVal = y[i];

    sumX1 += x1Val;
    sumX2 += x2Val;
    sumY += yVal;

    sumX1Sq += x1Val * x1Val;
    sumX2Sq += x2Val * x2Val;
    sumYSq += yVal * yVal;

    sumX1X2 += x1Val * x2Val;
    sumX1Y += x1Val * yVal;
    sumX2Y += x2Val * yVal;
  }

  const a11 = N;
  const a12 = sumX1;
  const a13 = sumX2;

  const a21 = sumX1;
  const a22 = sumX1Sq;
  const a23 = sumX1X2;

  const a31 = sumX2;
  const a32 = sumX1X2;
  const a33 = sumX2Sq;

  const det =
    a11 * (a22 * a33 - a23 * a32) -
    a12 * (a21 * a33 - a23 * a31) +
    a13 * (a21 * a32 - a22 * a31);

  if (Math.abs(det) < 1e-12) {
    return null;
  }

  const c11 = a22 * a33 - a23 * a32;
  const c12 = -(a21 * a33 - a23 * a31);
  const c13 = a21 * a32 - a22 * a31;

  const c21 = -(a12 * a33 - a13 * a32);
  const c22 = a11 * a33 - a13 * a31;
  const c23 = -(a11 * a32 - a12 * a31);

  const c31 = a12 * a23 - a13 * a22;
  const c32 = -(a11 * a23 - a13 * a21);
  const c33 = a11 * a22 - a12 * a21;

  const b1 = sumY;
  const b2 = sumX1Y;
  const b3 = sumX2Y;

  const b0 = (c11 * b1 + c12 * b2 + c13 * b3) / det;
  const beta1 = (c21 * b1 + c22 * b2 + c23 * b3) / det;
  const beta2 = (c31 * b1 + c32 * b2 + c33 * b3) / det;

  const fitted: number[] = [];
  const residuals: number[] = [];
  let ssRes = 0;
  let ssTot = 0;
  const meanY = sumY / N;

  for (let i = 0; i < N; i++) {
    const f = b0 + beta1 * x1[i] + beta2 * x2[i];
    const r = y[i] - f;
    fitted.push(f);
    residuals.push(r);
    ssRes += r * r;
    ssTot += (y[i] - meanY) * (y[i] - meanY);
  }

  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const df = N - 3;
  const adjR2 = df > 0 ? 1 - ((1 - r2) * (N - 1)) / df : r2;

  const s2 = df > 0 ? ssRes / df : 0;
  const s = Math.sqrt(s2);

  const seB0 = df > 0 ? s * Math.sqrt(c11 / det) : 0;
  const seB1 = df > 0 ? s * Math.sqrt(c22 / det) : 0;
  const seB2 = df > 0 ? s * Math.sqrt(c33 / det) : 0;

  const tB0 = seB0 === 0 ? 0 : b0 / seB0;
  const tB1 = seB1 === 0 ? 0 : beta1 / seB1;
  const tB2 = seB2 === 0 ? 0 : beta2 / seB2;

  const pB0 = df > 0 ? 2 * (1 - tCDF(Math.abs(tB0), df)) : 1;
  const pB1 = df > 0 ? 2 * (1 - tCDF(Math.abs(tB1), df)) : 1;
  const pB2 = df > 0 ? 2 * (1 - tCDF(Math.abs(tB2), df)) : 1;

  const invXTx = [
    [c11 / det, c12 / det, c13 / det],
    [c21 / det, c22 / det, c23 / det],
    [c31 / det, c32 / det, c33 / det],
  ];

  return {
    b0,
    b1: beta1,
    b2: beta2,
    r2,
    adjR2,
    seB0,
    seB1,
    seB2,
    tB0,
    tB1,
    tB2,
    pB0,
    pB1,
    pB2,
    residuals,
    fitted,
    df,
    invXTx,
  };
}

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
  const scale = 140;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2 - 10;

  const px = cx + (xRotY * scale) / denom;
  const py = cy - (yRotX * scale) / denom;

  return { px, py, depth: zRotX };
}

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

  // 3D Multiple Regression States
  const [is3D, setIs3D] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [x2Col, setX2Col] = useState<string | null>(null);
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.3);
  const [isDragging3D, setIsDragging3D] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [points3D, setPoints3D] = useState<{ x1: number; x2: number; y: number }[]>(DEFAULT_POINTS_3D);
  const [rawData3D, setRawData3D] = useState(SAMPLE_DATA_3D);
  const [newX2, setNewX2] = useState("");
  const [predictX1, setPredictX1] = useState("");
  const [predictX2, setPredictX2] = useState("");

  useRegisterToolState("linear-regression", { tab, xCol, yCol, is3D, x2Col, showResiduals }, { tab: setTab, xCol: setXCol, yCol: setYCol, is3D: setIs3D, x2Col: setX2Col, showResiduals: setShowResiduals });
  const parsedPairs = useMemo(() => parsePairs(rawData), [rawData]);

  const parsedTriplets = useMemo(() => {
    if (!rawData3D.trim()) return null;
    const lines = rawData3D.trim().split("\n").filter((l) => l.trim());
    const triplets: { x1: number; x2: number; y: number }[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const x1 = Number(parts[0]), x2 = Number(parts[1]), y = Number(parts[2]);
        if (isNaN(x1) || isNaN(x2) || isNaN(y)) return null;
        triplets.push({ x1, x2, y });
      }
    }
    return triplets.length > 0 ? triplets : null;
  }, [rawData3D]);

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

  const wsPoints3D: { x1: number; x2: number; y: number; row?: number }[] = useMemo(() => {
    if (!dataset || !xCol || !x2Col || !yCol) return [];
    const x1C = dataset.columns.find((c) => c.name === xCol);
    const x2C = dataset.columns.find((c) => c.name === x2Col);
    const yC = dataset.columns.find((c) => c.name === yCol);
    if (!x1C || !x2C || !yC) return [];
    const out: { x1: number; x2: number; y: number; row: number }[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const x1v = x1C.values[i], x2v = x2C.values[i], yv = yC.values[i];
      const x1n = typeof x1v === "number" ? x1v : Number(x1v);
      const x2n = typeof x2v === "number" ? x2v : Number(x2v);
      const yn = typeof yv === "number" ? yv : Number(yv);
      if (!isNaN(x1n) && !isNaN(x2n) && !isNaN(yn) && x1v !== null && x2v !== null && yv !== null) {
        out.push({ x1: x1n, x2: x2n, y: yn, row: i });
      }
    }
    return out;
  }, [dataset, xCol, x2Col, yCol]);

  const activePoints: { x: number; y: number; row?: number }[] =
    tab === "Workspace" ? wsPoints :
    tab === "Data Input" && parsedPairs ? parsedPairs.map((p) => ({ x: p.x, y: p.y })) :
    points;

  const activePoints3D: { x1: number; x2: number; y: number; row?: number }[] =
    tab === "Workspace" ? wsPoints3D :
    tab === "Data Input" && parsedTriplets ? parsedTriplets :
    points3D;

  // Domain 2D
  const xs = activePoints.map((p) => p.x);
  const ys = activePoints.map((p) => p.y);
  const xMin = xs.length ? Math.min(...xs) - 1 : 0;
  const xMax = xs.length ? Math.max(...xs) + 1 : 10;
  const yMin = ys.length ? Math.min(...ys) - 1 : 0;
  const yMax = ys.length ? Math.max(...ys) + 1 : 8;

  const sx = (x: number) => PAD_L + ((x - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const sy = (y: number) => PAD_T + (1 - (y - yMin) / (yMax - yMin || 1)) * PLOT_H;
  const invX = (px: number) => xMin + ((px - PAD_L) / PLOT_W) * (xMax - xMin);
  const invY = (py: number) => yMin + (1 - (py - PAD_T) / PLOT_H) * (yMax - yMin);

  // Domain 3D
  const x1s = activePoints3D.map((p) => p.x1);
  const x2s = activePoints3D.map((p) => p.x2);
  const ys3D = activePoints3D.map((p) => p.y);

  const x1Min = x1s.length ? Math.min(...x1s) : 0;
  const x1Max = x1s.length ? Math.max(...x1s) : 10;
  const x2Min = x2s.length ? Math.min(...x2s) : 0;
  const x2Max = x2s.length ? Math.max(...x2s) : 10;
  const yMin3D = ys3D.length ? Math.min(...ys3D) : 0;
  const yMax3D = ys3D.length ? Math.max(...ys3D) : 8;

  const x1Span = x1Max - x1Min || 1;
  const x2Span = x2Max - x2Min || 1;
  const ySpan3D = yMax3D - yMin3D || 1;

  const padX1Min = x1Min - 0.1 * x1Span;
  const padX1Max = x1Max + 0.1 * x1Span;
  const padX1Span = padX1Max - padX1Min || 1;

  const padX2Min = x2Min - 0.1 * x2Span;
  const padX2Max = x2Max + 0.1 * x2Span;
  const padX2Span = padX2Max - padX2Min || 1;

  const padYMin3D = yMin3D - 0.1 * ySpan3D;
  const padYMax3D = yMax3D + 0.1 * ySpan3D;
  const padYSpan3D = padYMax3D - padYMin3D || 1;

  const normX1 = (v: number) => -1 + 2 * ((v - padX1Min) / padX1Span);
  const normX2 = (v: number) => -1 + 2 * ((v - padX2Min) / padX2Span);
  const normY3D = (v: number) => -1 + 2 * ((v - padYMin3D) / padYSpan3D);

  // Regression 2D
  const reg = useMemo(() => {
    if (activePoints.length < 2) return null;
    return ols(activePoints.map((p) => p.x), activePoints.map((p) => p.y));
  }, [activePoints]);

  // Regression 3D
  const reg3D = useMemo(() => {
    if (!is3D || activePoints3D.length < 4) return null;
    return ols3D(
      activePoints3D.map((p) => p.x1),
      activePoints3D.map((p) => p.x2),
      activePoints3D.map((p) => p.y)
    );
  }, [is3D, activePoints3D]);

  // Prediction 2D
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

  // Prediction 3D
  const predX1Num = Number(predictX1);
  const predX2Num = Number(predictX2);
  const prediction3D = useMemo(() => {
    if (!reg3D || isNaN(predX1Num) || isNaN(predX2Num) || predictX1.trim() === "" || predictX2.trim() === "") return null;
    const yhat = reg3D.b0 + reg3D.b1 * predX1Num + reg3D.b2 * predX2Num;
    const X_h = [1, predX1Num, predX2Num];
    let quad = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        quad += X_h[i] * X_h[j] * reg3D.invXTx[i][j];
      }
    }
    const s2 = reg3D.residuals.reduce((sum, r) => sum + r * r, 0) / reg3D.df;
    const se = Math.sqrt(s2 * (1 + quad));
    return { yhat, se };
  }, [reg3D, predX1Num, predX2Num, predictX1, predictX2]);

  // Fitted values scale for residual plots
  const fitMin = useMemo(() => {
    const fittedVals = is3D ? (reg3D?.fitted ?? []) : (reg?.fitted ?? []);
    return fittedVals.length ? Math.min(...fittedVals) : 0;
  }, [is3D, reg, reg3D]);

  const fitMax = useMemo(() => {
    const fittedVals = is3D ? (reg3D?.fitted ?? []) : (reg?.fitted ?? []);
    return fittedVals.length ? Math.max(...fittedVals) : 10;
  }, [is3D, reg, reg3D]);

  const sxFit = (f: number) => {
    const span = fitMax - fitMin || 1;
    return PAD_L + ((f - fitMin) / span) * PLOT_W;
  };

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

  const addPoint3D = () => {
    const x1 = Number(newX), x2 = Number(newX2), y = Number(newY);
    if (!isNaN(x1) && !isNaN(x2) && !isNaN(y) && newX.trim() && newX2.trim() && newY.trim()) {
      setPoints3D([...points3D, { x1, x2, y }]);
      setNewX(""); setNewX2(""); setNewY("");
    }
  };

  const removePoint = (idx: number) => {
    setPoints(points.filter((_, i) => i !== idx));
  };

  const removePoint3D = (idx: number) => {
    setPoints3D(points3D.filter((_, i) => i !== idx));
  };

  // Residual plot scale
  const activeReg = is3D ? reg3D : reg;
  const resYMax = activeReg ? Math.max(1, ...activeReg.residuals.map((r) => Math.abs(r))) * 1.2 : 1;
  const resSy = (r: number) => PAD_T + (1 - (r + resYMax) / (2 * resYMax)) * (RES_H - PAD_T - 24);

  // 2D X/Y ticks
  const xTicks = [];
  const xStep = Math.max(1, Math.ceil((xMax - xMin) / 8));
  for (let t = Math.ceil(xMin); t <= Math.floor(xMax); t += xStep) xTicks.push(t);
  const yTicks = [];
  const yStep = Math.max(1, Math.ceil((yMax - yMin) / 6));
  for (let t = Math.ceil(yMin); t <= Math.floor(yMax); t += yStep) yTicks.push(t);

  // 3D dragging rotation handlers
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

  // 3D projections
  const renderItems3D = useMemo(() => {
    if (!is3D) return [];

    const items: RenderItem[] = [];
    const getProj = (x: number, y: number, z: number) => getProjected(x, y, z, yaw, pitch);

    // 1. Bottom floor grid lines
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

    // 3. Grid tick labels (3D)
    gridValues.forEach((val) => {
      const realVal = padX1Min + ((val + 1) / 2) * padX1Span;
      items.push({
        type: "text",
        x: val, y: -1.15, z: 1.15,
        text: realVal.toFixed(1),
        color: "#9ca3af",
        fontSize: 10,
        textAnchor: "middle"
      });
    });

    gridValues.forEach((val) => {
      const realVal = padX2Min + ((val + 1) / 2) * padX2Span;
      items.push({
        type: "text",
        x: 1.15, y: -1.15, z: val,
        text: realVal.toFixed(1),
        color: "#9ca3af",
        fontSize: 10,
        textAnchor: "middle"
      });
    });

    gridValues.forEach((val) => {
      const realVal = padYMin3D + ((val + 1) / 2) * padYSpan3D;
      items.push({
        type: "text",
        x: -1.15, y: val, z: 1.15,
        text: realVal.toFixed(1),
        color: "#9ca3af",
        fontSize: 10,
        textAnchor: "end"
      });
    });

    // 4. Axis titles
    items.push({
      type: "text",
      x: 0, y: -1.35, z: 1.35,
      text: xCol || "X₁",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });
    items.push({
      type: "text",
      x: 1.35, y: -1.35, z: 0,
      text: x2Col || "X₂",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });
    items.push({
      type: "text",
      x: -1.35, y: 0, z: 1.35,
      text: yCol || "Y",
      color: "var(--chart-ink)",
      fontSize: 11,
      textAnchor: "middle"
    });

    // 5. Regression plane patches (8x8 polygons)
    if (reg3D) {
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const u0 = -1 + (2 * i) / steps;
        const u1 = -1 + (2 * (i + 1)) / steps;
        for (let j = 0; j < steps; j++) {
          const v0 = -1 + (2 * j) / steps;
          const v1 = -1 + (2 * (j + 1)) / steps;

          const rx1_00 = padX1Min + ((u0 + 1) / 2) * padX1Span;
          const rx2_00 = padX2Min + ((v0 + 1) / 2) * padX2Span;
          const ry_00 = reg3D.b0 + reg3D.b1 * rx1_00 + reg3D.b2 * rx2_00;

          const rx1_10 = padX1Min + ((u1 + 1) / 2) * padX1Span;
          const rx2_10 = padX2Min + ((v0 + 1) / 2) * padX2Span;
          const ry_10 = reg3D.b0 + reg3D.b1 * rx1_10 + reg3D.b2 * rx2_10;

          const rx1_11 = padX1Min + ((u1 + 1) / 2) * padX1Span;
          const rx2_11 = padX2Min + ((v1 + 1) / 2) * padX2Span;
          const ry_11 = reg3D.b0 + reg3D.b1 * rx1_11 + reg3D.b2 * rx2_11;

          const rx1_01 = padX1Min + ((u0 + 1) / 2) * padX1Span;
          const rx2_01 = padX2Min + ((v1 + 1) / 2) * padX2Span;
          const ry_01 = reg3D.b0 + reg3D.b1 * rx1_01 + reg3D.b2 * rx2_01;

          items.push({
            type: "polygon",
            points: [
              { x: u0, y: normY3D(ry_00), z: v0 },
              { x: u1, y: normY3D(ry_10), z: v0 },
              { x: u1, y: normY3D(ry_11), z: v1 },
              { x: u0, y: normY3D(ry_01), z: v1 }
            ],
            fill: "rgba(99, 102, 241, 0.22)",
            stroke: "rgba(99, 102, 241, 0.35)",
            strokeWidth: 0.5
          });
        }
      }
    }

    // 6. Data Points & Residual lines
    activePoints3D.forEach((pt, index) => {
      const nx1 = normX1(pt.x1);
      const nx2 = normX2(pt.x2);
      const ny = normY3D(pt.y);

      const sel = pt.row !== undefined && isSelected(pt.row);
      const ptColor = sel ? "#fb923c" : "var(--chart-ink)";

      if (reg3D && showResiduals) {
        const ryFitted = reg3D.fitted[index];
        const nyFitted = normY3D(ryFitted);
        items.push({
          type: "line",
          x1: nx1, y1: ny, z1: nx2,
          x2: nx1, y2: nyFitted, z2: nx2,
          stroke: "#dc2626",
          strokeWidth: 1.5,
          dashArray: "3 3",
          opacity: 0.6
        });
      }

      items.push({
        type: "point",
        x: nx1, y: ny, z: nx2,
        r: sel ? 6 : 4.5,
        color: ptColor,
        stroke: "#ffffff",
        strokeWidth: 1.5,
        row: pt.row,
        label: `Observation ${index + 1}`
      });
    });

    // 7. Painter's depth sorting
    const rotatedItems = items.map((item) => {
      let depth = 0;
      if (item.type === "line") {
        const p1 = getProj(item.x1, item.y1, item.z1);
        const p2 = getProj(item.x2, item.y2, item.z2);
        depth = (p1.depth + p2.depth) / 2;
      } else if (item.type === "point" || item.type === "text") {
        const p = getProj(item.x, item.y, item.z);
        depth = p.depth;
      } else if (item.type === "polygon") {
        let sumDepth = 0;
        item.points.forEach((p) => {
          sumDepth += getProj(p.x, p.y, p.z).depth;
        });
        depth = sumDepth / item.points.length;
      }
      return { item, depth };
    });

    rotatedItems.sort((a, b) => a.depth - b.depth);
    return rotatedItems;
  }, [is3D, yaw, pitch, activePoints3D, padX1Min, padX1Span, padX2Min, padX2Span, padYMin3D, padYSpan3D, reg3D, showResiduals, isSelected, xCol, x2Col, yCol]);

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
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          opacity={0.9}
        />
      );
    }

    if (item.type === "polygon") {
      const pointsStr = item.points
        .map((p) => {
          const proj = getProj(p.x, p.y, p.z);
          return `${proj.px},${proj.py}`;
        })
        .join(" ");

      return (
        <polygon
          key={`poly-${index}`}
          points={pointsStr}
          fill={item.fill}
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          opacity={item.opacity ?? 0.75}
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
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer font-medium border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <input
            type="checkbox" checked={is3D}
            onChange={(e) => {
              const val = e.target.checked;
              setIs3D(val);
              setTab(dataset ? "Workspace" : "Interactive");
            }}
            className="rounded text-indigo-600"
          />
          3D Multiple Regression
        </label>

        {tab === "Workspace" && dataset && (
          <>
            {!is3D ? (
              <>
                <ColumnPicker label="X column" value={xCol} onChange={setXCol} />
                <ColumnPicker label="Y column" value={yCol} onChange={setYCol} />
              </>
            ) : (
              <>
                <ColumnPicker label="X₁ column (Predictor 1)" value={xCol} onChange={setXCol} />
                <ColumnPicker label="X₂ column (Predictor 2)" value={x2Col} onChange={setX2Col} />
                <ColumnPicker label="Y column (Dependent)" value={yCol} onChange={setYCol} />
              </>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Selected rows from Scatter highlight here automatically.
            </p>
          </>
        )}

        {tab === "Interactive" && (
          <>
            {!is3D ? (
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
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <NumberInput label="X₁" value={Number(newX) || 0} onChange={(v) => setNewX(String(v))} step={0.1} />
                  </div>
                  <div>
                    <NumberInput label="X₂" value={Number(newX2) || 0} onChange={(v) => setNewX2(String(v))} step={0.1} />
                  </div>
                  <div>
                    <NumberInput label="Y" value={Number(newY) || 0} onChange={(v) => setNewY(String(v))} step={0.1} />
                  </div>
                </div>
                <Btn onClick={addPoint3D}>Add point</Btn>
              </>
            )}

            {/* Points table */}
            <div className="max-h-40 overflow-y-auto font-sans">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-neutral-500 uppercase tracking-wider">
                    <th className="text-left py-1">#</th>
                    <th className="text-right py-1">{!is3D ? "X" : "X₁"}</th>
                    {is3D && <th className="text-right py-1">X₂</th>}
                    <th className="text-right py-1">Y</th>
                    <th className="text-right py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {!is3D ? (
                    points.map((p, i) => (
                      <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="py-1 text-neutral-400">{i + 1}</td>
                        <td className="py-1 text-right">{p.x.toFixed(2)}</td>
                        <td className="py-1 text-right">{p.y.toFixed(2)}</td>
                        <td className="py-1 text-right">
                          <button onClick={() => removePoint(i)} className="text-red-400 hover:text-red-650">×</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    points3D.map((p, i) => (
                      <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="py-1 text-neutral-400">{i + 1}</td>
                        <td className="py-1 text-right">{p.x1.toFixed(2)}</td>
                        <td className="py-1 text-right">{p.x2.toFixed(2)}</td>
                        <td className="py-1 text-right">{p.y.toFixed(2)}</td>
                        <td className="py-1 text-right">
                          <button onClick={() => removePoint3D(i)} className="text-red-400 hover:text-red-650">×</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Btn onClick={() => {!is3D ? setPoints([]) : setPoints3D([])}}>Clear all</Btn>
          </>
        )}

        {tab === "Data Input" && (
          <>
            {!is3D ? (
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
            ) : (
              <>
                <DataTextArea
                  label="X₁, X₂, Y triplets (one per line)"
                  value={rawData3D}
                  onChange={setRawData3D}
                  placeholder="1.0, 2.0, 3.5&#10;1.5, 2.5, 4.2&#10;2.0, 1.8, 5.1"
                  rows={5}
                />
                <SampleDataButton onClick={() => setRawData3D(SAMPLE_DATA_3D)} />
                {rawData3D && !parsedTriplets && (
                  <div className="text-xs text-red-500">Could not parse data. Use &ldquo;x1, x2, y&rdquo; per line.</div>
                )}
              </>
            )}
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox" checked={showResiduals}
            onChange={(e) => setShowResiduals(e.target.checked)}
            className="rounded"
          />
          Show residuals
        </label>

        {/* Results */}
        {!is3D && reg && (
          <>
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3 font-sans">
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

        {is3D && reg3D && (
          <>
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3 font-sans">
              <Stat label="Intercept (β₀)" value={reg3D.b0.toFixed(6)} sub={`SE = ${reg3D.seB0.toFixed(4)}, p = ${reg3D.pB0.toFixed(4)}`} />
              <Stat label="Slope 1 (β₁)" value={reg3D.b1.toFixed(6)} sub={`SE = ${reg3D.seB1.toFixed(4)}, p = ${reg3D.pB1.toFixed(4)}`} />
              <Stat label="Slope 2 (β₂)" value={reg3D.b2.toFixed(6)} sub={`SE = ${reg3D.seB2.toFixed(4)}, p = ${reg3D.pB2.toFixed(4)}`} />
              <Stat label="R²" value={reg3D.r2.toFixed(6)} />
              <Stat label="Adjusted R²" value={reg3D.adjR2.toFixed(6)} />
              <Stat label="n" value={String(activePoints3D.length)} />
            </div>

            <Formula text={`ŷ = ${reg3D.b0.toFixed(4)} + ${reg3D.b1.toFixed(4)} · x₁ + ${reg3D.b2.toFixed(4)} · x₂`} />

            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 space-y-1 font-sans">
              <div>Model: <strong>Y = β₀ + β₁X₁ + β₂X₂</strong></div>
              <div>Residual SE: <strong>{Math.sqrt(reg3D.residuals.reduce((s, r) => s + r * r, 0) / reg3D.df).toFixed(4)}</strong> on {reg3D.df} DF</div>
            </div>
          </>
        )}

        {/* Prediction */}
        {!is3D && reg && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3 font-sans">
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

        {is3D && reg3D && (
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3 font-sans">
            <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Prediction</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <NumberInput label="Enter x₁" value={predX1Num || 0} onChange={(v) => setPredictX1(String(v))} step={0.1} />
              </div>
              <div className="flex-1">
                <NumberInput label="Enter x₂" value={predX2Num || 0} onChange={(v) => setPredictX2(String(v))} step={0.1} />
              </div>
            </div>
            {prediction3D && (
              <>
                <Stat label="ŷ" value={prediction3D.yhat.toFixed(4)} />
                <Stat label="95% PI" value={`[${(prediction3D.yhat - 1.96 * prediction3D.se).toFixed(4)}, ${(prediction3D.yhat + 1.96 * prediction3D.se).toFixed(4)}]`} />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs
        tabs={dataset ? ["Workspace", "Interactive", "Data Input"] : ["Interactive", "Data Input"]}
        active={tab} onChange={setTab}
      />

      {/* Main scatter plot / 3D Canvas */}
      <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
        <div className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-4"}>
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
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className={`w-full h-auto select-none ${is3D ? "cursor-move" : ""} ${isFullscreen ? "flex-1" : ""}`}
              style={{ touchAction: "none", height: isFullscreen ? "100%" : "auto" }}
              onPointerDown={is3D ? handlePointerDown : undefined}
              onPointerMove={is3D ? handlePointerMove : (e) => {
                if (dragging === null || tab !== "Interactive") return;
                const c = toSvg(e.clientX, e.clientY);
                if (c) {
                  const next = [...points];
                  next[dragging] = c;
                  setPoints(next);
                }
              }}
              onPointerUp={is3D ? handlePointerUp : () => setDragging(null)}
              onPointerLeave={is3D ? handlePointerUp : () => setDragging(null)}
              onClick={is3D ? undefined : (e) => {
                if (tab !== "Interactive" || dragging !== null) return;
                const c = toSvg(e.clientX, e.clientY);
                if (c && c.x >= xMin && c.x <= xMax && c.y >= yMin && c.y <= yMax) {
                  setPoints([...points, c]);
                }
              }}
            >
              {!is3D ? (
                <>
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
                      stroke="#6366f1" strokeWidth={2} strokeLinecap="round"
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
                        fill={sel ? "#fb923c" : i === 0 && tab === "Interactive" ? "#fb923c" : "var(--chart-ink)"}
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
                </>
              ) : (
                <>
                  {/* Render 3D items */}
                  {renderItems3D.map(({ item }, index) => renderItem(item, index))}

                  {/* Rotation and interactive hint */}
                  <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" fontSize="10" fill="var(--chart-muted)">
                    Drag to rotate view · Use side controls to add/remove points
                  </text>

                  <g 
                    className="cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setYaw(0.6);
                      setPitch(0.3);
                    }}
                    transform={`translate(${VIEW_W - 80}, ${VIEW_H - 22})`}
                  >
                    <rect width="70" height="16" rx="4" fill="var(--chart-bg)" stroke="var(--chart-axis)" strokeWidth="0.8" />
                    <text x="35" y="11" textAnchor="middle" fontSize="9" fill="var(--chart-ink)" className="font-semibold">Reset View</text>
                  </g>

                  {/* Underdetermined system message */}
                  {activePoints3D.length < 4 && (
                    <g>
                      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--chart-bg)" fillOpacity={0.8} />
                      <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" fill="var(--chart-muted)" fontSize="14" fontWeight="500">
                        At least 4 data points required for 3D Multiple Regression.
                      </text>
                      <text x={VIEW_W / 2} y={VIEW_H / 2 + 20} textAnchor="middle" fill="var(--chart-muted)" fontSize="12">
                        Current points: {activePoints3D.length}
                      </text>
                    </g>
                  )}
                </>
              )}
            </svg>
          </Panel>

          {/* Residual plot */}
          {(is3D ? reg3D : reg) && showResiduals && (
            <Panel>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Residuals vs Fitted</div>
              <svg viewBox={`0 0 ${VIEW_W} ${RES_H}`} className="w-full h-auto">
                <line x1={PAD_L} y1={resSy(0)} x2={VIEW_W - PAD_R} y2={resSy(0)}
                  stroke="var(--chart-axis)" strokeDasharray="4 4" />
                {(is3D ? activePoints3D : activePoints).map((p, i) => {
                  const activeReg = is3D ? reg3D : reg;
                  if (!activeReg) return null;
                  return (
                    <circle key={i} cx={sxFit(activeReg.fitted[i])} cy={resSy(activeReg.residuals[i])}
                      r={4} fill="#dc2626" fillOpacity={0.6} stroke="#fff" strokeWidth={1} />
                  );
                })}
              </svg>
            </Panel>
          )}

          {/* Diagnostics: Q-Q plot + Cook's distance + summary */}
          {(is3D ? reg3D : reg) && showResiduals && (is3D ? activePoints3D : activePoints).length >= 4 && (() => {
            const DIAG_W = 480;
            const DIAG_H = 200;
            const D_PAD_L = 48;
            const D_PAD_R = 16;
            const D_PAD_T = 18;
            const D_PAD_B = 32;
            const D_PLOT_W = DIAG_W - D_PAD_L - D_PAD_R;
            const D_PLOT_H = DIAG_H - D_PAD_T - D_PAD_B;

            const activeReg = is3D ? reg3D : reg;
            if (!activeReg) return null;
            const n = (is3D ? activePoints3D : activePoints).length;
            const residuals = activeReg.residuals;
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
            const xBar = is3D ? 0 : mean(xs);
            const sxx = is3D ? 1 : xs.reduce((s, x) => s + (x - xBar) ** 2, 0) || 1;
            const ssRes = residuals.reduce((s, r) => s + r * r, 0);
            
            const leverages = is3D && reg3D
              ? activePoints3D.map((pt) => {
                  const X_i = [1, pt.x1, pt.x2];
                  let quad = 0;
                  for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                      quad += X_i[r] * X_i[c] * reg3D.invXTx[r][c];
                    }
                  }
                  return quad;
                })
              : activePoints.map((pt) => 1 / n + ((pt.x - xBar) ** 2) / sxx);

            const p = is3D ? 3 : 2;
            const mse = ssRes / Math.max(1, n - p);
            const cooks = (is3D ? activePoints3D : activePoints).map((_, i) => {
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

            // Reference line endpoints for Q-Q
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
                          fill={high ? "#dc2626" : "var(--chart-ink)"} fillOpacity={high ? 0.85 : 0.7}
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
        {!isFullscreen && (
          <div>
            <Panel className="space-y-4">
              {renderControls()}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
