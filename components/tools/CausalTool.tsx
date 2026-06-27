"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { rngFor, gauss, multipleRegression } from "./shared/stats";
import {
  Tabs, Field, Stat, Panel, Btn, Interpretation, useTutorInput, useRegisterToolState,
} from "./shared/ui";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import ColumnPicker from "@/components/workspace/ColumnPicker";
import { Sparkles, Trash2, Plus, RefreshCw } from "lucide-react";

const W = 600, H = 340;

interface Node {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

// Preset DAG Configuration (Confounder DAG)
const PRESET_NODES: Node[] = [
  { id: "X", name: "X (Treatment)", x: 80, y: 220 },
  { id: "Y", name: "Y (Outcome)", x: 520, y: 220 },
  { id: "Z", name: "Z (Confounder)", x: 300, y: 80 },
  { id: "W", name: "W (Mediator)", x: 300, y: 280 },
];

const PRESET_EDGES: Edge[] = [
  { from: "X", to: "Y" },
  { from: "Z", to: "X" },
  { from: "Z", to: "Y" },
  { from: "X", to: "W" },
  { from: "W", to: "Y" },
];

export default function CausalTool() {
  const { dataset } = useWorkspace();
  const [tab, setTab] = useState(dataset ? "Workspace" : "Simulation");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // DAG State
  const [nodes, setNodes] = useState<Node[]>(PRESET_NODES);
  const [edges, setEdges] = useState<Edge[]>(PRESET_EDGES);
  const [treatment, setTreatment] = useState<string>("X");
  const [outcome, setOutcome] = useState<string>("Y");
  const [adjustedNodes, setAdjustedNodes] = useState<Set<string>>(new Set(["Z"]));

  // UI Interactive State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState("");

  // Simulation Parameters
  const [simN, setSimN] = useState(250);
  const [seed, setSeed] = useState(1);

  // Column Mappings in Workspace Mode
  const [mappings, setMappings] = useState<Record<string, string | null>>({
    X: null,
    Y: null,
    Z: null,
    W: null,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  // Sync mappings with dataset columns if available
  useEffect(() => {
    if (dataset && dataset.columns.length > 0) {
      const numericCols = dataset.columns.filter((c) => c.type === "numeric").map((c) => c.name);
      setMappings((prev) => {
        const next = { ...prev };
        nodes.forEach((n) => {
          if (!next[n.id] && numericCols.length > 0) {
            // Assign sequentially if possible
            const idx = nodes.indexOf(n) % numericCols.length;
            next[n.id] = numericCols[idx];
          }
        });
        return next;
      });
    }
  }, [dataset, nodes]);

  // Hook-based state serialization
  useRegisterToolState(
    "causal-dag",
    { nodes, edges, treatment, outcome, adjustedNodes: Array.from(adjustedNodes), tab },
    {
      nodes: setNodes,
      edges: setEdges,
      treatment: setTreatment,
      outcome: setOutcome,
      adjustedNodes: (val: string[]) => setAdjustedNodes(new Set(val)),
      tab: setTab,
    }
  );

  // Helper: Directed Reachability (Descendants)
  const getDescendants = (startNode: string): Set<string> => {
    const descendants = new Set<string>();
    const visited = new Set<string>();

    const dfs = (curr: string) => {
      visited.add(curr);
      descendants.add(curr);
      const children = edges.filter((e) => e.from === curr).map((e) => e.to);
      for (const child of children) {
        if (!visited.has(child)) dfs(child);
      }
    };

    dfs(startNode);
    return descendants;
  };

  // Helper: Find all simple undirected paths between Treatment and Outcome
  const allPaths = useMemo(() => {
    if (!treatment || !outcome) return [];
    
    // Build adjacency list for undirected skeleton
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => adj.set(n.id, []));
    edges.forEach((e) => {
      adj.get(e.from)?.push(e.to);
      adj.get(e.to)?.push(e.from);
    });

    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (curr: string, path: string[]) => {
      if (curr === outcome) {
        paths.push([...path, curr]);
        return;
      }
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) dfs(nxt, [...path, curr]);
      }
      visited.delete(curr);
    };

    dfs(treatment, []);
    return paths;
  }, [nodes, edges, treatment, outcome]);

  // Path analysis: Classify and check if open/blocked
  const pathDetails = useMemo(() => {
    return allPaths.map((path) => {
      // 1. Check if causal path (all edges point forward from Treatment to Outcome)
      let isCausal = true;
      for (let i = 0; i < path.length - 1; i++) {
        if (!edges.some((e) => e.from === path[i] && e.to === path[i + 1])) {
          isCausal = false;
          break;
        }
      }

      // 2. D-separation check: Is path blocked by adjustedNodes?
      let blockedBy: string | null = null;
      let blocked = false;

      for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const next = path[i + 1];

        // Is it a collider? (prev -> curr <- next)
        const isCollider = edges.some((e) => e.from === prev && e.to === curr) &&
                            edges.some((e) => e.from === next && e.to === curr);

        if (isCollider) {
          const desc = getDescendants(curr);
          const conditionedDesc = Array.from(desc).find((d) => adjustedNodes.has(d));
          if (!conditionedDesc) {
            blocked = true;
            blockedBy = `${curr} (unconditioned collider)`;
            break;
          }
        } else {
          // Non-collider (chain or fork)
          if (adjustedNodes.has(curr)) {
            blocked = true;
            blockedBy = `${curr} (conditioned)`;
            break;
          }
        }
      }

      return {
        path,
        isCausal,
        isBlocked: blocked,
        blockedBy,
      };
    });
  }, [allPaths, edges, adjustedNodes]);

  // Derive optimal adjustment set
  const recommendedAdjustment = useMemo(() => {
    if (!treatment || !outcome) return null;
    const backdoorPaths = pathDetails.filter((p) => !p.isCausal);
    if (backdoorPaths.length === 0) return [];

    const descX = getDescendants(treatment);
    const candidates = nodes.map((n) => n.id).filter((id) => id !== treatment && id !== outcome && !descX.has(id));

    // Power set search
    const subsets: string[][] = [[]];
    for (const c of candidates) {
      const len = subsets.length;
      for (let i = 0; i < len; i++) {
        subsets.push([...subsets[i], c]);
      }
    }
    subsets.sort((a, b) => a.length - b.length);

    for (const S of subsets) {
      const setS = new Set(S);
      let allBlocked = true;
      for (const p of backdoorPaths) {
        // Evaluate path block status manually
        let blocked = false;
        for (let i = 1; i < p.path.length - 1; i++) {
          const prev = p.path[i - 1];
          const curr = p.path[i];
          const next = p.path[i + 1];
          const isCollider = edges.some((e) => e.from === prev && e.to === curr) &&
                              edges.some((e) => e.from === next && e.to === curr);
          if (isCollider) {
            const desc = getDescendants(curr);
            const conditionedDesc = Array.from(desc).some((d) => setS.has(d));
            if (!conditionedDesc) { blocked = true; break; }
          } else {
            if (setS.has(curr)) { blocked = true; break; }
          }
        }
        if (!blocked) { allBlocked = false; break; }
      }
      if (allBlocked) return S;
    }
    return null; // Confounding cannot be blocked
  }, [nodes, edges, treatment, outcome, pathDetails]);

  // Helper: Topological Sort of DAG
  const topologicalOrder = useMemo(() => {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) return; // Cycle detected
      if (!visited.has(nodeId)) {
        temp.add(nodeId);
        const parents = edges.filter((e) => e.to === nodeId).map((e) => e.from);
        for (const p of parents) visit(p);
        temp.delete(nodeId);
        visited.add(nodeId);
        order.push(nodeId);
      }
    };

    nodes.forEach((n) => visit(n.id));
    return order;
  }, [nodes, edges]);

  // Generative simulation logic based on custom DAG
  const simulatedData = useMemo(() => {
    if (tab !== "Simulation") return null;
    const rng = rngFor(seed);
    const data: Record<string, number[]> = {};
    nodes.forEach((n) => (data[n.id] = []));

    for (let i = 0; i < simN; i++) {
      const row: Record<string, number> = {};
      for (const nodeId of topologicalOrder) {
        const parents = edges.filter((e) => e.to === nodeId);
        if (parents.length === 0) {
          row[nodeId] = gauss(rng);
        } else {
          // linear structural equation model
          let val = 0;
          parents.forEach((p) => {
            // Treatment effect is 0.65; others confounder effects are 1.2
            const coef = p.from === treatment && nodeId === outcome ? 0.65 : 1.2;
            val += coef * (row[p.from] ?? 0);
          });
          row[nodeId] = val + gauss(rng) * 0.45;
        }
        data[nodeId].push(row[nodeId]);
      }
    }
    return data;
  }, [nodes, edges, simN, seed, topologicalOrder, treatment, outcome, tab]);

  // Extract variables for regression analysis
  const regressionVectors = useMemo(() => {
    if (tab === "Simulation") {
      return simulatedData;
    }

    if (!dataset) return null;
    const vectors: Record<string, number[]> = {};
    
    for (const node of nodes) {
      const colName = mappings[node.id];
      if (!colName) return null; // Incomplete mappings
      const col = dataset.columns.find((c) => c.name === colName);
      if (!col) return null;
      vectors[node.id] = dataset.rows
        .map((row) => Number(row[col.index]))
        .filter((v) => !isNaN(v));
    }
    return vectors;
  }, [tab, simulatedData, dataset, nodes, mappings]);

  // Calculate naive and adjusted regressions
  const analyticalResults = useMemo(() => {
    if (!regressionVectors || !treatment || !outcome) return null;
    const Y_vector = regressionVectors[outcome];
    const X_vector = regressionVectors[treatment];
    if (!Y_vector || !X_vector || Y_vector.length < 5) return null;

    const N = Y_vector.length;

    // 1. Naive regression: Y ~ X
    const naive_X_matrix = Array.from({ length: N }, (_, i) => [1, X_vector[i]]);
    const naive_reg = multipleRegression(naive_X_matrix, Y_vector);

    // 2. Adjusted regression: Y ~ X + AdjustedSet
    const adjList = Array.from(adjustedNodes).filter((id) => id !== treatment && id !== outcome && regressionVectors[id]);
    const adj_X_matrix = Array.from({ length: N }, (_, i) => [
      1,
      X_vector[i],
      ...adjList.map((id) => regressionVectors[id][i]),
    ]);
    const adj_reg = multipleRegression(adj_X_matrix, Y_vector);

    return {
      naiveSlope: naive_reg?.coefficients[1] ?? 0,
      naiveR2: naive_reg?.r2 ?? 0,
      adjustedSlope: adj_reg?.coefficients[1] ?? 0,
      adjustedR2: adj_reg?.r2 ?? 0,
      sampleSize: N,
      adjustingFor: adjList,
    };
  }, [regressionVectors, treatment, outcome, adjustedNodes]);

  // Interactive Node Dragging Event Handlers
  const onNodePointerDown = (e: React.PointerEvent<SVGGElement>, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onNodePointerMove = (e: React.PointerEvent<SVGGElement>, nodeId: string) => {
    if (draggingNodeId !== nodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const boundedX = Math.max(25, Math.min(W - 25, x));
    const boundedY = Math.max(25, Math.min(H - 25, y));
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, x: boundedX, y: boundedY } : n)));
  };

  const onNodePointerUp = () => {
    setDraggingNodeId(null);
  };

  // Node Manipulation
  const handleAddNode = () => {
    const name = newNodeName.trim();
    if (!name) return;
    const id = name.replace(/\s+/g, "_").toUpperCase();
    if (nodes.some((n) => n.id === id)) {
      setErrorMsg("Variable node already exists.");
      return;
    }
    const newNode: Node = {
      id,
      name,
      x: W / 2 + (Math.random() - 0.5) * 100,
      y: H / 2 + (Math.random() - 0.5) * 100,
    };
    setNodes((prev) => [...prev, newNode]);
    setMappings((prev) => ({ ...prev, [id]: null }));
    setNewNodeName("");
    setErrorMsg(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === treatment || nodeId === outcome) {
      setErrorMsg("Cannot delete Treatment or Outcome nodes.");
      return;
    }
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setAdjustedNodes((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (connectingFromId === nodeId) setConnectingFromId(null);
  };

  const handleStartConnection = (nodeId: string) => {
    if (connectingFromId === nodeId) {
      setConnectingFromId(null);
    } else {
      setConnectingFromId(nodeId);
    }
  };

  const handleCompleteConnection = (toId: string) => {
    if (!connectingFromId || connectingFromId === toId) return;
    // Check if edge already exists
    const exists = edges.some((e) => e.from === connectingFromId && e.to === toId);
    if (exists) {
      // Toggle delete
      setEdges((prev) => prev.filter((e) => !(e.from === connectingFromId && e.to === toId)));
    } else {
      // Add arrow
      setEdges((prev) => [...prev, { from: connectingFromId, to: toId }]);
    }
    setConnectingFromId(null);
  };

  const deleteEdge = (fromId: string, toId: string) => {
    setEdges((prev) => prev.filter((e) => !(e.from === fromId && e.to === toId)));
  };

  // Color Coding paths/edges visually
  const getEdgeColor = (fromId: string, toId: string) => {
    // 1. Causal edge?
    const isCausal = pathDetails.some(
      (p) => p.isCausal && p.path.some((node, i) => node === fromId && p.path[i + 1] === toId)
    );
    if (isCausal) return "#fb923c"; // Orange

    // 2. Open backdoor edge?
    const isOpenBackdoor = pathDetails.some(
      (p) => !p.isCausal && !p.isBlocked && p.path.some((node, i) => (node === fromId && p.path[i + 1] === toId) || (node === toId && p.path[i + 1] === fromId))
    );
    if (isOpenBackdoor) return "#dc2626"; // Red (confounding)

    // 3. Blocked backdoor edge?
    const isBlockedBackdoor = pathDetails.some(
      (p) => !p.isCausal && p.isBlocked && p.path.some((node, i) => (node === fromId && p.path[i + 1] === toId) || (node === toId && p.path[i + 1] === fromId))
    );
    if (isBlockedBackdoor) return "#16a34a"; // Green

    return "#a3a3a3"; // Grey (neutral/unconnected to outcome)
  };

  // Build interpretive verdict text
  const interpretationText = useMemo(() => {
    if (!treatment || !outcome || !analyticalResults) return "Please complete mapping variables to run analysis.";
    const bias = analyticalResults.naiveSlope - analyticalResults.adjustedSlope;
    const isConfounded = pathDetails.some((p) => !p.isCausal && !p.isBlocked);
    
    if (isConfounded) {
      return `WARNING: The causal effect is confounded! Naive estimate (slope = ${analyticalResults.naiveSlope.toFixed(3)}) is biased because backdoor paths are open. Please adjust for the recommended variable(s) to block confounding.`;
    }
    
    return `SUCCESS: Backdoor paths are successfully blocked. The adjusted OLS slope = ${analyticalResults.adjustedSlope.toFixed(3)} represents the true causal effect parameter. Naive confounding bias was ${bias.toFixed(3)}.`;
  }, [treatment, outcome, analyticalResults, pathDetails]);

  return (
    <div className="space-y-6">
      <Tabs
        tabs={dataset ? ["Workspace", "Simulation"] : ["Simulation"]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Interactive DAG Canvas */}
        <div className="xl:col-span-2 space-y-4">
          <Panel className="relative">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-3 mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">Interactive Causal Graph</span>
                <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-550 rounded-full px-2 py-0.5 font-mono">
                  {nodes.length} variables
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="New var name..."
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNode()}
                  className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-2 py-1 text-xs outline-none w-28 focus:border-orange-500"
                />
                <button
                  onClick={handleAddNode}
                  className="inline-flex items-center gap-1 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg px-2.5 py-1 text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Add Node
                </button>
                <button
                  onClick={() => {
                    setNodes(PRESET_NODES);
                    setEdges(PRESET_EDGES);
                    setAdjustedNodes(new Set(["Z"]));
                    setTreatment("X");
                    setOutcome("Y");
                    setSelectedNodeId(null);
                    setConnectingFromId(null);
                  }}
                  className="inline-flex items-center gap-1 border border-neutral-200 dark:border-neutral-850 bg-white dark:bg-neutral-900 rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-450 hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-colors"
                >
                  Reset presets
                </button>
              </div>
              {errorMsg && (
                <div className="text-red-500 text-[10.5px] font-mono mt-1.5 w-full text-right">
                  ⚠️ {errorMsg}
                </div>
              )}
            </div>

            <div className="relative border border-neutral-100 dark:border-neutral-850 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/10 overflow-hidden">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto select-none"
                style={{ touchAction: "none" }}
              >
                <defs>
                  {/* Dynamic Color-Coded Markers for directed edges */}
                  <marker id="causal-arrow-dc2626" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,2 L8,5 L0,8 Z" fill="#dc2626" />
                  </marker>
                  <marker id="causal-arrow-16a34a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,2 L8,5 L0,8 Z" fill="#16a34a" />
                  </marker>
                  <marker id="causal-arrow-fb923c" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,2 L8,5 L0,8 Z" fill="#fb923c" />
                  </marker>
                  <marker id="causal-arrow-a3a3a3" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,2 L8,5 L0,8 Z" fill="#a3a3a3" />
                  </marker>
                  <marker id="causal-arrow-737373" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,2 L8,5 L0,8 Z" fill="#737373" />
                  </marker>
                </defs>

                {/* Grid Background */}
                <pattern id="dag-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--chart-grid)" strokeWidth="0.8" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#dag-grid)" />

                {/* Render Directed Edges */}
                {edges.map((edge, idx) => {
                  const color = getEdgeColor(edge.from, edge.to);
                  const fromNode = nodes.find((n) => n.id === edge.from);
                  const toNode = nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;

                  const dx = toNode.x - fromNode.x;
                  const dy = toNode.y - fromNode.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist === 0) return null;

                  const ux = dx / dist;
                  const uy = dy / dist;

                  const radius = 20;
                  const x1 = fromNode.x + radius * ux;
                  const y1 = fromNode.y + radius * uy;
                  const x2 = toNode.x - (radius + 6) * ux;
                  const y2 = toNode.y - (radius + 6) * uy;

                  return (
                    <g key={idx} className="group cursor-pointer" onClick={() => deleteEdge(edge.from, edge.to)}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={color}
                        strokeWidth={selectedNodeId === null ? 2.5 : 1.8}
                        markerEnd={`url(#causal-arrow-${color.replace("#", "")})`}
                        className="transition-all group-hover:stroke-red-500 group-hover:stroke-[3px]"
                      />
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} />
                      <title>Click line to delete arrow</title>
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {nodes.map((node) => {
                  const isTreatment = node.id === treatment;
                  const isOutcome = node.id === outcome;
                  const isAdjusted = adjustedNodes.has(node.id);
                  const isConnectingSrc = connectingFromId === node.id;
                  const isSelected = selectedNodeId === node.id;

                  // Node color codes matching roles
                  const strokeColor =
                    isTreatment ? "#fb923c" :
                    isOutcome ? "#16a34a" :
                    isAdjusted ? "#a855f7" :
                    "var(--chart-ink)";

                  const ringColor = isSelected ? "#3b82f6" : isConnectingSrc ? "#fb923c" : "transparent";

                  return (
                    <g
                      key={node.id}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => onNodePointerDown(e, node.id)}
                      onPointerMove={(e) => onNodePointerMove(e, node.id)}
                      onPointerUp={onNodePointerUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (connectingFromId) {
                          handleCompleteConnection(node.id);
                        }
                      }}
                    >
                      {/* Selection Ring */}
                      {ringColor !== "transparent" && (
                        <circle cx={node.x} cy={node.y} r={24} fill="none" stroke={ringColor} strokeWidth={2} strokeDasharray="3 3" />
                      )}
                      
                      {/* Base Node Circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={18}
                        fill="var(--chart-bg)"
                        stroke={strokeColor}
                        strokeWidth={isTreatment || isOutcome || isAdjusted ? 2.5 : 1.5}
                        className="transition-shadow hover:shadow-md"
                      />

                      {/* Node Label text */}
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight={isTreatment || isOutcome || isAdjusted ? "bold" : "normal"}
                        fill="var(--chart-ink)"
                        className="pointer-events-none select-none font-mono"
                      >
                        {node.id}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Graph Helper Instructions overlay */}
              <div className="absolute bottom-2 left-3 pointer-events-none text-[9.5px] font-mono text-neutral-450 dark:text-neutral-500 space-y-0.5">
                <div>• Drag nodes to arrange variables</div>
                <div>• Click a node, then click another node to draw/delete directed arrow</div>
              </div>
            </div>
          </Panel>

          <Interpretation text={interpretationText} />
        </div>

        {/* Causal Diagnostics & OLS Results Sidebar */}
        <div className="space-y-6">
          {/* Selected Node Options */}
          {selectedNodeId && (
            <Panel className="space-y-4 border-l-4 border-blue-500">
              <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-2">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">Variable: {selectedNodeId}</span>
                <button
                  onClick={() => handleDeleteNode(selectedNodeId)}
                  className="text-neutral-450 hover:text-red-500 transition-colors p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded"
                  title="Delete node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Node Role controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      setTreatment(selectedNodeId);
                      if (outcome === selectedNodeId) setOutcome("");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border transition-all ${
                      treatment === selectedNodeId
                        ? "bg-orange-50 dark:bg-orange-950/20 text-orange-500 border-orange-200 dark:border-orange-900/40"
                        : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50"
                    }`}
                  >
                    Set Treatment (X)
                  </button>

                  <button
                    onClick={() => {
                      setOutcome(selectedNodeId);
                      if (treatment === selectedNodeId) setTreatment("");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border transition-all ${
                      outcome === selectedNodeId
                        ? "bg-green-50 dark:bg-green-950/20 text-green-500 border-green-200 dark:border-green-900/40"
                        : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50"
                    }`}
                  >
                    Set Outcome (Y)
                  </button>
                </div>

                {/* Adjust/Condition toggle */}
                {selectedNodeId !== treatment && selectedNodeId !== outcome && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={adjustedNodes.has(selectedNodeId)}
                      onChange={(e) => {
                        setAdjustedNodes((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(selectedNodeId);
                          else next.delete(selectedNodeId);
                          return next;
                        });
                      }}
                      className="rounded text-orange-500 border-neutral-300 dark:border-neutral-700"
                    />
                    <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                      Condition/Adjust for this covariate (Z)
                    </span>
                  </label>
                )}

                {/* Draw connector arrow */}
                <button
                  onClick={() => handleStartConnection(selectedNodeId)}
                  className={`w-full inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-all ${
                    connectingFromId === selectedNodeId
                      ? "bg-orange-500 text-white border-orange-500 hover:opacity-90"
                      : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-805 hover:bg-neutral-50"
                  }`}
                >
                  {connectingFromId === selectedNodeId ? "Click destination node..." : "Draw directed arrow..."}
                </button>

                {/* Mappings to Workspace Columns */}
                {tab === "Workspace" && dataset && (
                  <div className="pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800">
                    <ColumnPicker
                      label={`Map ${selectedNodeId} to column`}
                      value={mappings[selectedNodeId] || ""}
                      onChange={(col) => setMappings((prev) => ({ ...prev, [selectedNodeId]: col }))}
                      kind="numeric"
                    />
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* D-Separation Path Auditor */}
          <Panel className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-2">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">Causal Path Diagnostics</span>
              <span className="text-[10px] font-mono text-neutral-450">
                {allPaths.length} paths identified
              </span>
            </div>

            {allPaths.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">No paths found. Draw arrows between nodes.</p>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {pathDetails.map((pd, i) => (
                  <div
                    key={i}
                    className={`flex items-start justify-between gap-3 p-2 rounded-xl text-xs border ${
                      pd.isCausal
                        ? "bg-orange-50/20 dark:bg-orange-950/5 border-orange-100 dark:border-orange-900/10"
                        : pd.isBlocked
                        ? "bg-green-50/20 dark:bg-green-950/5 border-green-100 dark:border-green-900/10"
                        : "bg-red-50/20 dark:bg-red-950/5 border-red-100 dark:border-red-900/10"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono truncate font-medium text-neutral-800 dark:text-neutral-200">
                        {pd.path.join(" → ")}
                      </div>
                      <div className="text-[10px] text-neutral-550 mt-0.5">
                        {pd.isCausal ? "Causal path" : "Backdoor path"}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {pd.isCausal ? (
                        <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">CAUSAL</span>
                      ) : pd.isBlocked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
                          BLOCKED 🟢
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          OPEN 🔴
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Backdoor adjustment recommendation */}
            {treatment && outcome && (
              <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-3 border border-neutral-100 dark:border-neutral-850 text-xs">
                <div className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                  Recommended Adjustment Set:
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                  {recommendedAdjustment === null ? (
                    <span className="text-red-500">None possible (unresolvable confounding)</span>
                  ) : recommendedAdjustment.length === 0 ? (
                    <span className="text-green-600 dark:text-green-400">∅ (No adjustment needed)</span>
                  ) : (
                    <span>&#123; {recommendedAdjustment.join(", ")} &#125;</span>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* OLS Causal Regression Estimates */}
          <Panel className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-850 pb-2">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">OLS Causal Estimation</span>
              <span className="text-[10px] font-mono text-neutral-450">
                N = {analyticalResults?.sampleSize ?? 0}
              </span>
            </div>

            {tab === "Workspace" && !dataset ? (
              <p className="text-xs text-neutral-400 text-center py-4">Please upload a dataset to run analysis.</p>
            ) : !analyticalResults ? (
              <p className="text-xs text-neutral-400 text-center py-4">Map nodes to dataset columns to compute OLS models.</p>
            ) : (
              <div className="space-y-4">
                {/* Model formulas */}
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="bg-neutral-50 dark:bg-neutral-900/30 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[10px] text-neutral-400 block mb-0.5">Naive Specification</span>
                    <span>{outcome} = β₀ + β₁({treatment})</span>
                  </div>
                  <div className="bg-neutral-50 dark:bg-neutral-900/30 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <span className="text-[10px] text-neutral-400 block mb-0.5">Adjusted Specification</span>
                    <span>
                      {outcome} = β₀ + β₁({treatment}){" "}
                      {analyticalResults.adjustingFor.map((id) => `+ β_(${id})`).join(" ")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <Stat
                    label="Naive Effect"
                    value={analyticalResults.naiveSlope.toFixed(4)}
                    sub={`R² = ${analyticalResults.naiveR2.toFixed(3)}`}
                  />
                  <Stat
                    label="Causal Effect"
                    value={analyticalResults.adjustedSlope.toFixed(4)}
                    sub={`R² = ${analyticalResults.adjustedR2.toFixed(3)}`}
                  />
                </div>
              </div>
            )}

            {/* Simulation controls */}
            {tab === "Simulation" && (
              <div className="space-y-3.5 pt-4 border-t border-dashed border-neutral-100 dark:border-neutral-800">
                <Field label="Sample Size (n)" value={String(simN)}>
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={10}
                    value={simN}
                    onChange={(e) => setSimN(Number(e.target.value))}
                    className="w-full"
                  />
                </Field>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-550">True direct effect (X→Y): 0.65</span>
                  <Btn onClick={() => setSeed((s) => s + 1)}>
                    Generate New Sample
                  </Btn>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
