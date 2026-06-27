"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { rngFor, gauss, mean } from "./shared/stats";
import {
  Tabs, Stat, Field, Panel, Btn, useRegisterToolState, DataTextArea, SampleDataButton,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";

const W = 480, H = 280, PAD = 36;
const DENDRO_H = 140;

type Pt = { x: number; y: number; id: number };

interface ClusterNode {
  id: number;
  left?: ClusterNode;
  right?: ClusterNode;
  height: number;
  points: number[];
  x?: number;
  y?: number;
}

// Agglomerative Hierarchical complete linkage clustering solver
function buildDendrogram(points: Pt[]): ClusterNode {
  const N = points.length;
  // Initialize leaves
  let nodes: ClusterNode[] = points.map((p, idx) => ({
    id: idx,
    height: 0,
    points: [idx],
    x: idx,
  }));

  // Compute initial distance matrix
  const dist = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d = Math.hypot(dx, dy);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  let nextId = N;
  const activeSet = new Set<ClusterNode>(nodes);

  while (activeSet.size > 1) {
    const list = Array.from(activeSet);
    let minD = Infinity;
    let mergeA = list[0];
    let mergeB = list[1];

    // Find closest pair (using complete linkage: max distance between members)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const node1 = list[i];
        const node2 = list[j];

        // Complete linkage distance
        let maxPairD = 0;
        for (const p1 of node1.points) {
          for (const p2 of node2.points) {
            maxPairD = Math.max(maxPairD, dist[p1][p2]);
          }
        }

        if (maxPairD < minD) {
          minD = maxPairD;
          mergeA = node1;
          mergeB = node2;
        }
      }
    }

    // Merge A and B
    const parent: ClusterNode = {
      id: nextId++,
      left: mergeA,
      right: mergeB,
      height: minD,
      points: [...mergeA.points, ...mergeB.points],
    };

    activeSet.delete(mergeA);
    activeSet.delete(mergeB);
    activeSet.add(parent);
  }

  return Array.from(activeSet)[0];
}

// Compute X coordinate layout of dendrogram nodes recursively
function layoutDendrogram(node: ClusterNode): void {
  if (!node.left || !node.right) {
    return; // leaf node X is already assigned in buildDendrogram
  }
  layoutDendrogram(node.left);
  layoutDendrogram(node.right);
  node.x = ((node.left.x ?? 0) + (node.right.x ?? 0)) / 2;
}

// Cut dendrogram at height to get cluster mappings
function cutTree(root: ClusterNode, height: number): number[][] {
  const clusters: number[][] = [];
  const traverse = (node: ClusterNode) => {
    if (node.height <= height) {
      clusters.push(node.points);
    } else if (node.left && node.right) {
      traverse(node.left);
      traverse(node.right);
    } else {
      clusters.push(node.points);
    }
  };
  traverse(root);
  return clusters;
}

export default function ClusteringTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState("K-Means");
  const [dataMode, setDataMode] = useState(dataset ? "Workspace" : "Simulation");
  const [n, setN] = useState(80);
  const [seed, setSeed] = useState(1);
  const [k, setK] = useState(3);
  const [raw, setRaw] = useState("0,0\n1,1\n0.5,0.8\n5,5\n6,5.5\n5.5,6");

  // X/Y columns for Workspace tab
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);

  // K-Means State
  const [centroids, setCentroids] = useState<{ x: number; y: number }[]>([]);
  const [assignments, setAssignments] = useState<number[]>([]);
  const [wcss, setWcss] = useState(0);

  // Hierarchical State
  const [cutHeight, setCutHeight] = useState(1.5);
  const svgDendroRef = useRef<SVGSVGElement>(null);

  useRegisterToolState("clustering", { tab, dataMode, n, seed, k, raw, xCol, yCol, centroids, cutHeight }, {
    tab: setTab,
    dataMode: setDataMode,
    n: setN,
    seed: setSeed,
    k: setK,
    raw: setRaw,
    xCol: setXCol,
    yCol: setYCol,
    centroids: setCentroids,
    cutHeight: setCutHeight,
  });

  const numericCols = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter(c => c.type === "numeric").map(c => c.name);
  }, [dataset]);

  useEffect(() => {
    if (numericCols.length >= 2) {
      if (!xCol) setXCol(numericCols[0]);
      if (!yCol) setYCol(numericCols[1]);
    }
  }, [numericCols, xCol, yCol]);

  // Generate simulated points (3 clusters)
  const simPoints = useMemo(() => {
    const rng = rngFor(seed);
    const pts: Pt[] = [];
    const centers = [
      { x: -2, y: -2 },
      { x: 2, y: 2 },
      { x: -1, y: 3 },
    ];
    for (let i = 0; i < n; i++) {
      const c = centers[i % 3];
      pts.push({
        x: gauss(rng, c.x, 0.8),
        y: gauss(rng, c.y, 0.8),
        id: i,
      });
    }
    return pts;
  }, [n, seed]);

  // Parse raw text input
  const parsedPoints = useMemo(() => {
    const lines = raw.split("\n");
    const pts: Pt[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(",").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        pts.push({ x: parts[0], y: parts[1], id: idx });
      }
    });
    return pts;
  }, [raw]);

  // Pick workspace points
  const wsPoints = useMemo(() => {
    if (!dataset || !xCol || !yCol) return [];
    const xs = dataset.columns.find(c => c.name === xCol);
    const ys = dataset.columns.find(c => c.name === yCol);
    if (!xs || !ys) return [];

    const out: Pt[] = [];
    for (let i = 0; i < dataset.rows.length; i++) {
      const xv = xs.values[i];
      const yv = ys.values[i];
      const xnum = typeof xv === "number" ? xv : Number(xv);
      const ynum = typeof yv === "number" ? yv : Number(yv);

      if (!isNaN(xnum) && !isNaN(ynum) && xv !== null && yv !== null) {
        out.push({ x: xnum, y: ynum, id: i });
      }
    }
    return out;
  }, [dataset, xCol, yCol]);

  const points = useMemo(() => {
    if (dataMode === "Workspace") return wsPoints;
    if (dataMode === "Simulation") return simPoints;
    return parsedPoints;
  }, [dataMode, wsPoints, simPoints, parsedPoints]);

  const xMin = points.length ? Math.min(...points.map(p => p.x)) - 0.5 : -4;
  const xMax = points.length ? Math.max(...points.map(p => p.x)) + 0.5 : 4;
  const yMin = points.length ? Math.min(...points.map(p => p.y)) - 0.5 : -4;
  const yMax = points.length ? Math.max(...points.map(p => p.y)) + 0.5 : 4;

  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  // K-Means: initialize centroids randomly if empty
  const initCentroids = () => {
    if (points.length < k) return;
    const rng = rngFor(seed + 99);
    const newCentroids = [];
    const chosen = new Set<number>();
    while (newCentroids.length < k) {
      const idx = Math.floor(rng() * points.length);
      if (!chosen.has(idx)) {
        chosen.add(idx);
        newCentroids.push({ x: points[idx].x, y: points[idx].y });
      }
    }
    setCentroids(newCentroids);
  };

  useEffect(() => {
    initCentroids();
  }, [points, k]);

  // Single step of K-Means
  const stepKMeans = () => {
    if (centroids.length === 0 || points.length === 0) return;
    
    // Assign points to nearest centroid
    const newAssignments = points.map(p => {
      let minD = Infinity;
      let closest = 0;
      centroids.forEach((c, idx) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < minD) {
          minD = d;
          closest = idx;
        }
      });
      return closest;
    });

    // Compute new WCSS
    let nextWcss = 0;
    points.forEach((p, idx) => {
      const c = centroids[newAssignments[idx]];
      nextWcss += (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    });
    setWcss(nextWcss);

    // Compute new centroids
    const nextCentroids = centroids.map((c, idx) => {
      const assigned = points.filter((_, pIdx) => newAssignments[pIdx] === idx);
      if (assigned.length === 0) return c; // keep same if empty
      const avgX = mean(assigned.map(p => p.x));
      const avgY = mean(assigned.map(p => p.y));
      return { x: avgX, y: avgY };
    });

    setAssignments(newAssignments);
    setCentroids(nextCentroids);
  };

  const runToConvergence = () => {
    for (let i = 0; i < 20; i++) stepKMeans();
  };

  // Hierarchical: build dendrogram from points
  // Downsample to max 50 points to ensure dendrogram readability
  const dNodePoints = useMemo(() => {
    if (points.length <= 45) return points;
    // Sequential sample
    const step = Math.ceil(points.length / 45);
    return points.filter((_, idx) => idx % step === 0).slice(0, 45);
  }, [points]);

  const dendroRoot = useMemo(() => {
    if (dNodePoints.length < 3) return null;
    try {
      const root = buildDendrogram(dNodePoints);
      layoutDendrogram(root);
      return root;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [dNodePoints]);

  const dendroHeightMax = dendroRoot?.height ?? 5;

  const hierarchicalClusters = useMemo(() => {
    if (!dendroRoot) return [];
    return cutTree(dendroRoot, cutHeight);
  }, [dendroRoot, cutHeight]);

  // Color arrays
  const COLORS = ["#6366f1", "#fb923c", "#14b8a6", "#ec4899", "#8b5cf6", "#f59e0b", "#10b981", "#3b82f6"];

  const getPtColor = (idx: number) => {
    if (tab === "K-Means") {
      const assign = assignments[idx];
      return assign !== undefined ? COLORS[assign % COLORS.length] : "var(--chart-ink)";
    } else {
      // Hierarchical assignment
      const originalPt = points[idx];
      if (!originalPt) return "var(--chart-ink)";
      const dNodeIdx = dNodePoints.findIndex(p => p.id === originalPt.id);
      if (dNodeIdx === -1) return "#737373"; // outside downsampled set
      
      const clusterIdx = hierarchicalClusters.findIndex(c => c.includes(dNodeIdx));
      return clusterIdx !== -1 ? COLORS[clusterIdx % COLORS.length] : "var(--chart-ink)";
    }
  };

  // SVG lines for the dendrogram tree
  const dendroLines = useMemo(() => {
    if (!dendroRoot) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const leavesN = dNodePoints.length;

    const dx = (x: number) => PAD + (x / (leavesN - 1 || 1)) * (W - 2 * PAD);
    const dy = (h: number) => DENDRO_H - PAD - (h / (dendroHeightMax || 1)) * (DENDRO_H - 2 * PAD);

    const traverse = (node: ClusterNode) => {
      if (node.left && node.right) {
        const lx = dx(node.left.x ?? 0);
        const rx = dx(node.right.x ?? 0);
        const ly = dy(node.left.height);
        const ry = dy(node.right.height);
        const py = dy(node.height);

        // Orthogonal connecting lines
        lines.push({ x1: lx, y1: ly, x2: lx, y2: py });
        lines.push({ x1: rx, y1: ry, x2: rx, y2: py });
        lines.push({ x1: lx, y1: py, x2: rx, y2: py });

        traverse(node.left);
        traverse(node.right);
      }
    };
    traverse(dendroRoot);
    return lines;
  }, [dendroRoot, dNodePoints, dendroHeightMax]);

  // Handle dragging height threshold on dendrogram
  const handleDendroPointerDown = (e: React.PointerEvent) => {
    if (!svgDendroRef.current) return;
    const rect = svgDendroRef.current.getBoundingClientRect();
    const py = ((e.clientY - rect.top) / rect.height) * DENDRO_H;
    const normH = ((DENDRO_H - PAD - py) / (DENDRO_H - 2 * PAD)) * dendroHeightMax;
    setCutHeight(Math.max(0, Math.min(dendroHeightMax, normH)));
    svgDendroRef.current.setPointerCapture(e.pointerId);
  };

  const handleDendroPointerMove = (e: React.PointerEvent) => {
    if (!svgDendroRef.current || !e.buttons) return;
    const rect = svgDendroRef.current.getBoundingClientRect();
    const py = ((e.clientY - rect.top) / rect.height) * DENDRO_H;
    const normH = ((DENDRO_H - PAD - py) / (DENDRO_H - 2 * PAD)) * dendroHeightMax;
    setCutHeight(Math.max(0, Math.min(dendroHeightMax, normH)));
  };

  const menuTabs = dataset
    ? ["Workspace", "Simulation", "Your Data"]
    : ["Simulation", "Your Data"];

  return (
    <div className="space-y-6">
      <Tabs tabs={["K-Means", "Hierarchical"]} active={tab} onChange={setTab} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Main Scatter View */}
          <Panel>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold"> Cluster Scatter Space </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <rect width={W} height={H} fill="none" stroke="var(--chart-axis)" strokeWidth={0.5} />
              
              {/* Grid axes */}
              <line x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} stroke="var(--chart-grid)" strokeOpacity={0.4} />
              <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="var(--chart-grid)" strokeOpacity={0.4} />

              {/* Data points */}
              {points.map((p, idx) => (
                <circle
                  key={`pt-${idx}`}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={3.8}
                  fill={getPtColor(idx)}
                  fillOpacity={0.8}
                />
              ))}

              {/* K-Means Centroids */}
              {tab === "K-Means" && centroids.map((c, idx) => (
                <g key={`cent-${idx}`} transform={`translate(${sx(c.x)},${sy(c.y)})`}>
                  <circle r={9} fill={COLORS[idx % COLORS.length]} fillOpacity={0.3} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} />
                  <path d="M-4,0 L4,0 M0,-4 L0,4" stroke="#fff" strokeWidth={1.5} />
                </g>
              ))}
            </svg>
          </Panel>

          {/* Dendrogram Tree View (Hierarchical tab only) */}
          {tab === "Hierarchical" && dendroRoot && (
            <Panel>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2 font-semibold flex justify-between">
                <span>Agglomerative complete-linkage dendrogram</span>
                <span className="text-[#6366f1]">Clusters Cut: {hierarchicalClusters.length}</span>
              </div>
              <svg
                ref={svgDendroRef}
                viewBox={`0 0 ${W} ${DENDRO_H}`}
                className="w-full h-auto cursor-row-resize select-none touch-none"
                onPointerDown={handleDendroPointerDown}
                onPointerMove={handleDendroPointerMove}
              >
                {/* Dendrogram Lines */}
                {dendroLines.map((l, idx) => (
                  <line key={`dl-${idx}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--chart-ink)" strokeWidth={1} strokeOpacity={0.6} />
                ))}

                {/* Draggable Cut Height Threshold Line */}
                <line
                  x1={PAD}
                  y1={DENDRO_H - PAD - (cutHeight / (dendroHeightMax || 1)) * (DENDRO_H - 2 * PAD)}
                  x2={W - PAD}
                  y2={DENDRO_H - PAD - (cutHeight / (dendroHeightMax || 1)) * (DENDRO_H - 2 * PAD)}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
                <text
                  x={W - PAD - 8}
                  y={DENDRO_H - PAD - (cutHeight / (dendroHeightMax || 1)) * (DENDRO_H - 2 * PAD) - 5}
                  textAnchor="end"
                  fontSize="9"
                  fill="#ef4444"
                  className="font-semibold"
                >
                  Cut Height ({cutHeight.toFixed(2)})
                </text>
              </svg>
            </Panel>
          )}
        </div>

        <Panel className="space-y-5">
          <Tabs tabs={menuTabs} active={dataMode} onChange={setDataMode} />

          {dataMode === "Workspace" && dataset && (
            <>
              <ColumnPicker label="X column" value={xCol} onChange={setXCol} kind="numeric" />
              <ColumnPicker label="Y column" value={yCol} onChange={setYCol} kind="numeric" />
            </>
          )}

          {dataMode === "Simulation" && (
            <>
              <Field label="Sample size n" value={String(n)}>
                <input type="range" min={20} max={300} step={10} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
              </Field>
              <Btn onClick={() => setSeed(s => s + 1)}>New Simulation Seeds</Btn>
            </>
          )}

          {dataMode === "Your Data" && (
            <>
              <DataTextArea label="X, Y coordinates" value={raw} onChange={setRaw} rows={5} />
              <SampleDataButton onClick={() => setRaw("0,0\n1,1\n0.5,0.8\n5,5\n6,5.5\n5.5,6")} />
            </>
          )}

          {tab === "K-Means" ? (
            <div className="border-t pt-4 space-y-4">
              <Field label="Clusters count (K)" value={String(k)}>
                <input type="range" min={2} max={8} value={k} onChange={(e) => setK(Number(e.target.value))} className="w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Btn onClick={stepKMeans}>Step K-Means</Btn>
                <Btn primary onClick={runToConvergence}>Converge Model</Btn>
              </div>
              <Btn onClick={initCentroids}>Reset centroids</Btn>
              <Stat label="WCSS score" value={wcss.toFixed(2)} sub="Within-Cluster Sum of Squares" />
            </div>
          ) : (
            <div className="border-t pt-4 space-y-4">
              <Field label="Dendrogram Cut height" value={cutHeight.toFixed(2)}>
                <input
                  type="range"
                  min={0.01}
                  max={dendroHeightMax}
                  step={0.01}
                  value={cutHeight}
                  onChange={(e) => setCutHeight(Number(e.target.value))}
                  className="w-full"
                />
              </Field>
              <Stat label="Dendrogram depth" value={dendroHeightMax.toFixed(2)} />
              <Stat label="Resulting clusters" value={String(hierarchicalClusters.length)} />
            </div>
          )}

          <Stat label="n" value={String(points.length)} />
        </Panel>
      </div>
    </div>
  );
}
