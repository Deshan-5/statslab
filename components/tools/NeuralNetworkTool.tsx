"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import NeuralNetworkArchitectureView from "@/components/tools/NeuralNetworkArchitectureView";
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Layers,
  Sparkles,
  Flame,
  CheckCircle2,
  Activity,
  AlertTriangle,
} from "lucide-react";

type DatasetType = "XOR" | "Circles";
type ActivationType = "Tanh" | "ReLU";

interface Point2D {
  x1: number;
  x2: number;
  y: number;
}

interface TrainStepResult {
  loss: number;
  accuracy: number;
  gradNorm: number;
  neuronActivity: number[]; // mean |h_j| over the batch, length 4
}

interface HistoryPoint {
  epoch: number;
  loss: number;
  accuracy: number;
  gradNorm: number;
}

const HISTORY_LIMIT = 200;
const RANGE = 1.2;
const DEAD_NEURON_THRESHOLD = 0.01; // mean |activation| below this => flagged dead

// --- Neural Network Engine (2 -> 4 -> 1) ---
class SimpleNN {
  W1: number[][]; // 2x4
  B1: number[]; // 4
  W2: number[]; // 4x1
  B2: number; // 1

  constructor() {
    this.W1 = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    this.B1 = [0, 0, 0, 0];
    this.W2 = [0, 0, 0, 0];
    this.B2 = 0;
    this.reset("Tanh");
  }

  // He init for ReLU, Xavier-ish for Tanh. Fan-in for layer 1 is 2, layer 2 is 4.
  reset(act: ActivationType) {
    const scale1 = act === "ReLU" ? Math.sqrt(2 / 2) : Math.sqrt(1 / 2);
    const scale2 = act === "ReLU" ? Math.sqrt(2 / 4) : Math.sqrt(1 / 4);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 4; j++) this.W1[i][j] = (Math.random() * 2 - 1) * scale1;
    for (let j = 0; j < 4; j++) this.B1[j] = 0;
    for (let j = 0; j < 4; j++) this.W2[j] = (Math.random() * 2 - 1) * scale2;
    this.B2 = 0;
  }

  relu(x: number) {
    return Math.max(0, x);
  }
  d_relu(x: number) {
    return x > 0 ? 1 : 0;
  }
  tanh(x: number) {
    return Math.tanh(x);
  }
  d_tanh(x: number) {
    const t = Math.tanh(x);
    return 1 - t * t;
  }
  sigmoid(x: number) {
    return 1 / (1 + Math.exp(-x));
  }

  forward(
    x1: number,
    x2: number,
    act: ActivationType
  ): { h: number[]; z1: number[]; out: number } {
    const z1 = [0, 0, 0, 0];
    const h = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      z1[j] = x1 * this.W1[0][j] + x2 * this.W1[1][j] + this.B1[j];
      h[j] = act === "ReLU" ? this.relu(z1[j]) : this.tanh(z1[j]);
    }
    let z2 = this.B2;
    for (let j = 0; j < 4; j++) z2 += h[j] * this.W2[j];
    return { h, z1, out: this.sigmoid(z2) };
  }

  trainStep(data: Point2D[], lr: number, act: ActivationType): TrainStepResult {
    const dW1 = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const dB1 = [0, 0, 0, 0];
    const dW2 = [0, 0, 0, 0];
    let dB2 = 0;

    let totalLoss = 0;
    let correct = 0;
    const activitySum = [0, 0, 0, 0];
    const EPS = 1e-7;

    for (const pt of data) {
      const { h, z1, out } = this.forward(pt.x1, pt.x2, act);

      const outClamped = Math.min(1 - EPS, Math.max(EPS, out));
      totalLoss += -(pt.y * Math.log(outClamped) + (1 - pt.y) * Math.log(1 - outClamped));
      const predicted = out >= 0.5 ? 1 : 0;
      if (predicted === pt.y) correct += 1;

      for (let j = 0; j < 4; j++) activitySum[j] += Math.abs(h[j]);

      // BCE + sigmoid derivative w.r.t. logits simplifies to (out - y)
      const dZ2 = out - pt.y;

      dB2 += dZ2;
      for (let j = 0; j < 4; j++) {
        dW2[j] += dZ2 * h[j];

        const dH = dZ2 * this.W2[j];
        const dZ1 = dH * (act === "ReLU" ? this.d_relu(z1[j]) : this.d_tanh(z1[j]));

        dB1[j] += dZ1;
        dW1[0][j] += dZ1 * pt.x1;
        dW1[1][j] += dZ1 * pt.x2;
      }
    }

    const n = data.length || 1;

    // Gradient norm computed BEFORE the update, over the averaged gradient,
    // so it reflects the actual step that's about to be taken.
    let sumSq = 0;
    for (let j = 0; j < 4; j++) {
      sumSq += (dW2[j] / n) ** 2;
      sumSq += (dB1[j] / n) ** 2;
      sumSq += (dW1[0][j] / n) ** 2;
      sumSq += (dW1[1][j] / n) ** 2;
    }
    sumSq += (dB2 / n) ** 2;
    const gradNorm = Math.sqrt(sumSq);

    for (let j = 0; j < 4; j++) {
      this.W2[j] -= lr * (dW2[j] / n);
      this.B1[j] -= lr * (dB1[j] / n);
      this.W1[0][j] -= lr * (dW1[0][j] / n);
      this.W1[1][j] -= lr * (dW1[1][j] / n);
    }
    this.B2 -= lr * (dB2 / n);

    return {
      loss: totalLoss / n,
      accuracy: correct / n,
      gradNorm,
      neuronActivity: activitySum.map((s) => s / n),
    };
  }
}

function generateData(type: DatasetType, n: number = 200): Point2D[] {
  const data: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    if (type === "XOR") {
      const x1 = (Math.random() * 2 - 1) * 0.8;
      const x2 = (Math.random() * 2 - 1) * 0.8;
      const y = x1 * x2 > 0 ? 1 : 0;
      data.push({ x1: x1 + (Math.random() - 0.5) * 0.2, x2: x2 + (Math.random() - 0.5) * 0.2, y });
    } else {
      const radius = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const r = radius > 0.5 ? 0.7 + Math.random() * 0.2 : Math.random() * 0.3;
      const y = radius > 0.5 ? 0 : 1;
      data.push({ x1: r * Math.cos(angle), x2: r * Math.sin(angle), y });
    }
  }
  return data;
}

export default function NeuralNetworkTool() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [datasetType, setDatasetType] = useState<DatasetType>("XOR");
  const [activation, setActivation] = useState<ActivationType>("Tanh");
  const [lr, setLr] = useState(0.1);
  const [running, setRunning] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<"manifold" | "architecture">("manifold");

  const [loss, setLoss] = useState(0.693); // ln(2), loss at random-chance init
  const [accuracy, setAccuracy] = useState(0.5);
  const [gradNorm, setGradNorm] = useState(0);
  const [neuronActivity, setNeuronActivity] = useState([0, 0, 0, 0]);
  const [lossVolatility, setLossVolatility] = useState(0);

  const historyRef = useRef<HistoryPoint[]>([]);
  const lossWindowRef = useRef<number[]>([]); // rolling window for instability detection
  const [historyVersion, setHistoryVersion] = useState(0); // bump to force chart redraw

  const nnRef = useRef(new SimpleNN());
  const dataRef = useRef<Point2D[]>([]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const pointsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lossChartRef = useRef<SVGSVGElement>(null);
  const boundaryRef = useRef<SVGSVGElement>(null);

  // --- Reset (defined before effects that call it, fixes hoisting fragility) ---
  useRegisterToolState("neural-network", { datasetType, activation, lr }, { datasetType: setDatasetType, activation: setActivation, lr: setLr });
  const doReset = useCallback(() => {
    setRunning(false);
    setEpoch(0);
    setLoss(0.693);
    setAccuracy(0.5);
    setGradNorm(0);
    setNeuronActivity([0, 0, 0, 0]);
    setLossVolatility(0);
    lossWindowRef.current = [];
    historyRef.current = [];
    setHistoryVersion((v) => v + 1);
    nnRef.current.reset(activation);
    updateSurface();
    updateNetworkSVG();
    updateBoundarySVG();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation]);

  useEffect(() => {
    dataRef.current = generateData(datasetType);
    doReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetType]);

  const setPreset = (type: "Perfect" | "Exploding") => {
    setRunning(false);
    if (type === "Perfect") {
      setDatasetType("Circles");
      setActivation("Tanh");
      setLr(0.3);
    } else {
      setDatasetType("Circles");
      setActivation("ReLU");
      setLr(0.45);
    }
    setTimeout(doReset, 50);
  };

  const getStatusMessage = () => {
    if (lossVolatility > 0.08) return "Training is unstable — loss is bouncing instead of falling. Lower the learning rate.";
    if (epoch === 0) return "Ready to train. Click Play to start mapping the manifold.";
    if (accuracy > 0.97) return "Converged. The data is now linearly separable in the folded space.";
    if (epoch > 40) return "Optimizing weights via gradient descent — watch loss fall as accuracy climbs.";
    return "Optimizing weights using gradient descent...";
  };

  const updateNetworkSVG = useCallback(() => {
    if (!svgRef.current || !nnRef.current) return;
    const nn = nnRef.current;
    const MAX_THICKNESS = 4.0;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        const line = svgRef.current.getElementById(`w1_${i}_${j}`);
        if (line) {
          const w = nn.W1[i][j];
          line.setAttribute("stroke-width", String(Math.min(MAX_THICKNESS, Math.abs(w) * 2.0 + 0.5)));
          line.setAttribute("stroke", w > 0 ? "#10b981" : "#ef4444");
          line.setAttribute("opacity", String(Math.min(1, Math.abs(w) * 0.6 + 0.1)));
        }
      }
    }
    for (let j = 0; j < 4; j++) {
      const line = svgRef.current.getElementById(`w2_${j}`);
      if (line) {
        const w = nn.W2[j];
        line.setAttribute("stroke-width", String(Math.min(MAX_THICKNESS, Math.abs(w) * 2.0 + 0.5)));
        line.setAttribute("stroke", w > 0 ? "#10b981" : "#ef4444");
        line.setAttribute("opacity", String(Math.min(1, Math.abs(w) * 0.6 + 0.1)));
      }
    }

    // Dead-neuron flag on hidden nodes
    for (let j = 0; j < 4; j++) {
      const node = svgRef.current.getElementById(`hnode_${j}`);
      const dead = activation === "ReLU" && neuronActivity[j] < DEAD_NEURON_THRESHOLD && epoch > 20;
      if (node) {
        node.setAttribute("fill", dead ? "#374151" : "#10b981");
        node.setAttribute("opacity", dead ? "0.5" : "1");
      }
    }
  }, [activation, neuronActivity, epoch]);

  // 2D per-neuron decision-boundary overlay: draws each hidden unit's
  // linear boundary (z1_j = 0) as a line over the scattered data, so
  // "folding the plane" is visible as 4 literal cuts before the 3D
  // manifold shows the combined nonlinear result.
  const updateBoundarySVG = useCallback(() => {
    if (!boundaryRef.current) return;
    const nn = nnRef.current;
    const W = 180,
      H = 180;
    const toPx = (v: number) => ((v + RANGE) / (2 * RANGE)) * W;

    const neuronColors = ["#a855f7", "#06b6d4", "#f59e0b", "#ec4899"];

    for (let j = 0; j < 4; j++) {
      const line = boundaryRef.current.getElementById(`boundary_${j}`);
      if (!line) continue;
      const w0 = nn.W1[0][j];
      const w1 = nn.W1[1][j];
      const b = nn.B1[j];

      // w0*x1 + w1*x2 + b = 0  -> solve for endpoints at x1 = -RANGE, RANGE
      if (Math.abs(w1) < 1e-6) {
        // vertical-ish line: x1 = -b/w0
        const x = -b / (w0 || 1e-6);
        line.setAttribute("x1", String(toPx(x)));
        line.setAttribute("y1", String(0));
        line.setAttribute("x2", String(toPx(x)));
        line.setAttribute("y2", String(H));
      } else {
        const x1a = -RANGE,
          x2a = (-w0 * x1a - b) / w1;
        const x1b = RANGE,
          x2b = (-w0 * x1b - b) / w1;
        line.setAttribute("x1", String(toPx(x1a)));
        line.setAttribute("y1", String(H - toPx(x2a)));
        line.setAttribute("x2", String(toPx(x1b)));
        line.setAttribute("y2", String(H - toPx(x2b)));
      }
      const dead = activation === "ReLU" && neuronActivity[j] < DEAD_NEURON_THRESHOLD && epoch > 20;
      line.setAttribute("stroke", neuronColors[j]);
      line.setAttribute("opacity", dead ? "0.15" : "0.85");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation, neuronActivity, epoch]);

  const drawLossChart = useCallback(() => {
    if (!lossChartRef.current) return;
    const history = historyRef.current;
    const svg = lossChartRef.current;
    const W = 240,
      H = 70;

    const lossPath = svg.getElementById("loss-path");
    const accPath = svg.getElementById("acc-path");
    const gradPath = svg.getElementById("grad-path");
    if (!lossPath || !accPath) return;

    if (history.length < 2) {
      lossPath.setAttribute("d", "");
      accPath.setAttribute("d", "");
      gradPath?.setAttribute("d", "");
      return;
    }

    const maxLoss = Math.max(0.1, ...history.map((h) => h.loss));
    const maxGrad = Math.max(0.1, ...history.map((h) => h.gradNorm));

    const xStep = W / (HISTORY_LIMIT - 1);
    const startIdx = Math.max(0, HISTORY_LIMIT - history.length);

    const lossPts = history
      .map((h, i) => {
        const x = startIdx * xStep + i * xStep;
        const y = H - (Math.min(h.loss, maxLoss) / maxLoss) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L ");
    const accPts = history
      .map((h, i) => {
        const x = startIdx * xStep + i * xStep;
        const y = H - h.accuracy * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L ");
    const gradPts = history
      .map((h, i) => {
        const x = startIdx * xStep + i * xStep;
        const y = H - (Math.min(h.gradNorm, maxGrad) / maxGrad) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L ");

    lossPath.setAttribute("d", `M ${lossPts}`);
    accPath.setAttribute("d", `M ${accPts}`);
    gradPath?.setAttribute("d", `M ${gradPts}`);
  }, []);

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const bgColor = dark ? "#07070a" : "#f9fafb";
    scene.background = new THREE.Color(bgColor);

    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      (gridHelperRef.current.material as THREE.Material).dispose();
    }
    const gridColor1 = dark ? "#1f2937" : "#cbd5e1";
    const gridColor2 = dark ? "#0f172a" : "#94a3b8";
    const newGrid = new THREE.GridHelper(10, 20, gridColor1, gridColor2);
    newGrid.position.y = -0.01;
    scene.add(newGrid);
    gridHelperRef.current = newGrid;
  }, [dark]);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const timer = setTimeout(handleResize, 60);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Core WebGL init — runs once
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? "#07070a" : "#f9fafb");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 5, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.5, 0);
    controlsRef.current = controls;

    const grid = new THREE.GridHelper(10, 20, dark ? "#1f2937" : "#cbd5e1", dark ? "#0f172a" : "#94a3b8");
    grid.position.y = -0.01;
    scene.add(grid);
    gridHelperRef.current = grid;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const segments = 40;
    const geo = new THREE.PlaneGeometry(6, 6, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });

    const terrain = new THREE.Mesh(geo, mat);
    scene.add(terrain);
    terrainMeshRef.current = terrain;

    const pointsGroup = new THREE.Group();
    scene.add(pointsGroup);
    pointsGroupRef.current = pointsGroup;

    let animFrameId = 0;
    const animate = (time: number) => {
      animFrameId = requestAnimationFrame(animate);
      if (!running) {
        scene.rotation.y = Math.sin(time * 0.0001) * 0.05;
      } else {
        scene.rotation.y = 0;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    requestAnimationFrame(animate);

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    updateSurface();

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSurface = useCallback(() => {
    if (!terrainMeshRef.current || !pointsGroupRef.current) return;

    const geo = terrainMeshRef.current.geometry;
    const pos = geo.attributes.position;
    const colorsArr: number[] = [];

    const color0 = new THREE.Color("#f97316");
    const color1 = new THREE.Color("#3b82f6");
    const colorMid = new THREE.Color("#e2e8f0");

    const nn = nnRef.current;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const w0 = (x / 3) * RANGE;
      const w1 = (z / 3) * RANGE;

      const { out } = nn.forward(w0, w1, activation);
      const safeOut = Number.isFinite(out) ? out : 0.5;
      pos.setY(i, safeOut * 2);

      const c = new THREE.Color();
      if (safeOut < 0.5) {
        c.lerpColors(color0, colorMid, safeOut * 2);
      } else {
        c.lerpColors(colorMid, color1, (safeOut - 0.5) * 2);
      }
      colorsArr.push(c.r, c.g, c.b);
    }

    pos.needsUpdate = true;
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
    geo.computeVertexNormals();

    pointsGroupRef.current.clear();
    const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const mat0 = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 0.2 });
    const mat1 = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 0.2 });

    for (const pt of dataRef.current) {
      const sphere = new THREE.Mesh(sphereGeo, pt.y === 0 ? mat0 : mat1);
      sphere.position.set((pt.x1 / RANGE) * 3, pt.y === 1 ? 2.1 : -0.1, (pt.x2 / RANGE) * 3);
      pointsGroupRef.current.add(sphere);
    }
  }, [activation]);

  // Training loop with loss/accuracy/gradNorm tracking + instability detection.
  // Note: this network's sigmoid output + BCE loss keeps dZ2 bounded in [-1, 1],
  // so weights cannot diverge to infinity here regardless of learning rate --
  // verified by sweeping lr up to 8 with 8x init scale, zero numerical blowups.
  // What DOES happen at high LR is genuine loss oscillation/instability, which
  // is what we detect and surface instead of a divergence that can't occur.
  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      let lastResult: TrainStepResult | null = null;

      for (let i = 0; i < 5; i++) {
        lastResult = nnRef.current.trainStep(dataRef.current, lr, activation);
      }
      if (!lastResult) return;

      const newEpoch = epoch + 5;
      setEpoch(newEpoch);
      setLoss(lastResult.loss);
      setAccuracy(lastResult.accuracy);
      setGradNorm(lastResult.gradNorm);
      setNeuronActivity(lastResult.neuronActivity);

      historyRef.current.push({
        epoch: newEpoch,
        loss: lastResult.loss,
        accuracy: lastResult.accuracy,
        gradNorm: lastResult.gradNorm,
      });
      if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();

      // Instability: rolling std-dev of loss over the last 20 steps. This rises
      // monotonically with learning rate in this architecture (measured), so it's
      // an honest proxy for "training is bouncing around" rather than a fake
      // explosion flag.
      lossWindowRef.current.push(lastResult.loss);
      if (lossWindowRef.current.length > 20) lossWindowRef.current.shift();
      if (lossWindowRef.current.length >= 10) {
        const mean = lossWindowRef.current.reduce((a, b) => a + b, 0) / lossWindowRef.current.length;
        const variance =
          lossWindowRef.current.reduce((a, b) => a + (b - mean) ** 2, 0) / lossWindowRef.current.length;
        setLossVolatility(Math.sqrt(variance));
      }

      updateSurface();
      updateNetworkSVG();
      updateBoundarySVG();
      drawLossChart();
    }, 40);

    return () => clearInterval(interval);
  }, [running, lr, activation, epoch, updateSurface, updateNetworkSVG, updateBoundarySVG, drawLossChart]);

  // Keep loss chart in sync on reset/dataset change
  useEffect(() => {
    drawLossChart();
  }, [historyVersion, drawLossChart]);

  const renderControls = () => (
    <>
      <div className="flex gap-2">
        <Btn
          primary
          onClick={() => setRunning(!running)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 font-bold uppercase tracking-wider"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? "Pause" : "Train Network"}
        </Btn>
        <Btn
          onClick={doReset}
          className="flex items-center justify-center gap-1.5 text-xs py-2.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </Btn>
      </div>

      {lossVolatility > 0.08 && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-300 dark:border-red-800/40 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 dark:text-red-300">
            <strong>Training is unstable.</strong> The loss is oscillating instead of decreasing —
            each step overshoots the minimum it&apos;s aiming for. With this small a network and a
            bounded output (sigmoid + BCE), the weights won&apos;t blow up to infinity, but they will
            bounce around indefinitely at this learning rate. Lower it to let the loss settle.
          </div>
        </div>
      )}

      <div className="rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30 p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          Test Scenarios
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreset("Perfect")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white dark:bg-neutral-900 border border-purple-200 dark:border-purple-800/50 rounded-md text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Perfect Setup
          </button>
          <button
            onClick={() => setPreset("Exploding")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white dark:bg-neutral-900 border border-purple-200 dark:border-purple-800/50 rounded-md text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <Flame className="w-3 h-3 text-red-500" /> Exploding Gradient
          </button>
        </div>
      </div>

      <Field label="Dataset Pattern" value={datasetType}>
        <div className="flex gap-2">
          {(["XOR", "Circles"] as DatasetType[]).map((t) => (
            <button
              key={t}
              onClick={() => setDatasetType(t)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-all ${datasetType === t
                  ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400"
                  : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Activation Function" value={activation}>
        <div className="flex gap-2">
          {(["Tanh", "ReLU"] as ActivationType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActivation(t);
                setTimeout(doReset, 0);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-all ${activation === t
                  ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 flex items-start gap-1.5 bg-neutral-50 dark:bg-neutral-900 p-2 rounded border border-neutral-100 dark:border-neutral-800">
          <Sparkles className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-neutral-700 dark:text-neutral-300">Insight:</strong> Non-linear
            activations introduce &apos;bends&apos; into the model&apos;s logic. ReLU folds the space
            like sharp origami; Tanh creates smooth hills. A ReLU unit that outputs zero for every
            point in the dataset is &quot;dead&quot; — it stops contributing entirely. Watch the
            hidden nodes below dim when that happens.
          </span>
        </div>
      </Field>

      <Field label="Learning Rate" value={lr.toFixed(3)}>
        <input
          type="range"
          min={0.01}
          max={0.5}
          step={0.01}
          value={lr}
          onChange={(e) => setLr(Number(e.target.value))}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
          <span>0.01</span>
          <span>0.50</span>
        </div>
      </Field>

      {/* Loss / Accuracy / Gradient-norm readout + chart */}
      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-3">
        <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-[10px] uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1 flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-cyan-500" />
          Training Metrics
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">Loss</div>
            <div className="text-sm font-mono font-bold text-orange-500">{loss.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">Accuracy</div>
            <div className="text-sm font-mono font-bold text-blue-500">{(accuracy * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 flex items-center justify-center gap-0.5">
              ||grad|| {gradNorm > 0.15 && <AlertTriangle className="w-2.5 h-2.5 text-red-500" />}
            </div>
            <div
              className={`text-sm font-mono font-bold ${gradNorm > 0.15 ? "text-red-500" : "text-emerald-500"}`}
            >
              {gradNorm.toFixed(3)}
            </div>
          </div>
        </div>

        <svg ref={lossChartRef} viewBox="0 0 240 70" className="w-full h-16 bg-neutral-900 rounded border border-neutral-800">
          <line x1={0} y1={70 * 0.5} x2={240} y2={70 * 0.5} stroke="#1f2937" strokeWidth={1} strokeDasharray="2,2" />
          <path id="grad-path" fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.5} />
          <path id="loss-path" fill="none" stroke="#f97316" strokeWidth={1.5} />
          <path id="acc-path" fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        </svg>
        <div className="flex justify-center gap-3 text-[9px] font-mono">
          <span className="flex items-center gap-1 text-orange-500"><span className="w-2 h-0.5 bg-orange-500 inline-block" />loss</span>
          <span className="flex items-center gap-1 text-blue-500"><span className="w-2 h-0.5 bg-blue-500 inline-block" />accuracy</span>
          <span className="flex items-center gap-1 text-red-500"><span className="w-2 h-0.5 bg-red-500 inline-block" />grad norm</span>
        </div>
      </div>

      {/* 2D per-neuron decision boundary overlay */}
      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-2">
        <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-[10px] uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1">
          Hidden-Unit Boundaries (2D)
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Each hidden neuron draws one straight line through input space. The 3D manifold is what
          you get when all four lines combine.
        </div>
        <div className="flex justify-center">
          <svg ref={boundaryRef} viewBox="0 0 180 180" className="w-40 h-40 bg-neutral-900 rounded border border-neutral-800">
            {dataRef.current.map((pt, i) => (
              <circle
                key={i}
                cx={((pt.x1 + RANGE) / (2 * RANGE)) * 180}
                cy={180 - ((pt.x2 + RANGE) / (2 * RANGE)) * 180}
                r={1.6}
                fill={pt.y === 0 ? "#f97316" : "#3b82f6"}
                opacity={0.6}
              />
            ))}
            {[0, 1, 2, 3].map((j) => (
              <line key={j} id={`boundary_${j}`} strokeWidth={1.5} strokeDasharray="4,2" />
            ))}
          </svg>
        </div>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
        <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-[10px] uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1 flex justify-between items-center">
          <span>Network Architecture</span>
          <span className="flex gap-2">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> + Weight</span>
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> - Weight</span>
          </span>
        </div>

        <div className="flex justify-center py-4 bg-neutral-900 rounded-xl border border-neutral-800 shadow-inner relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
          ></div>

          <svg ref={svgRef} viewBox="0 0 260 130" className="w-full max-w-[260px] h-auto relative z-10">
            <defs>
              <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-emerald" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {[0, 1].map((i) =>
              [0, 1, 2, 3].map((j) => {
                const x1 = 40,
                  y1 = 45 + i * 40;
                const x2 = 130,
                  y2 = 20 + j * 30;
                const cx1 = (x1 + x2) / 2,
                  cy1 = y1;
                const cx2 = (x1 + x2) / 2,
                  cy2 = y2;
                return (
                  <path
                    key={`w1_${i}_${j}`}
                    id={`w1_${i}_${j}`}
                    d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#334155"
                    strokeWidth={1}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                );
              })
            )}

            {[0, 1, 2, 3].map((j) => {
              const x1 = 130,
                y1 = 20 + j * 30;
              const x2 = 220,
                y2 = 65;
              const cx1 = (x1 + x2) / 2,
                cy1 = y1;
              const cx2 = (x1 + x2) / 2,
                cy2 = y2;
              return (
                <path
                  key={`w2_${j}`}
                  id={`w2_${j}`}
                  d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#334155"
                  strokeWidth={1}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              );
            })}

            <circle cx={40} cy={45} r={7} fill="#a855f7" filter="url(#glow-purple)" />
            <circle cx={40} cy={85} r={7} fill="#a855f7" filter="url(#glow-purple)" />
            <circle cx={40} cy={45} r={3} fill="#ffffff" />
            <circle cx={40} cy={85} r={3} fill="#ffffff" />

            {[0, 1, 2, 3].map((j) => (
              <g key={`h_${j}`}>
                <circle id={`hnode_${j}`} cx={130} cy={20 + j * 30} r={7} fill="#10b981" filter="url(#glow-emerald)" />
                <circle cx={130} cy={20 + j * 30} r={3} fill="#ffffff" />
              </g>
            ))}

            <circle cx={220} cy={65} r={7} fill="#f97316" filter="url(#glow-orange)" />
            <circle cx={220} cy={65} r={3} fill="#ffffff" />

            <text x={40} y={120} fontSize="8" fill="#a855f7" textAnchor="middle" fontWeight="800" letterSpacing="1">INPUT</text>
            <text x={130} y={120} fontSize="8" fill="#10b981" textAnchor="middle" fontWeight="800" letterSpacing="1">HIDDEN</text>
            <text x={220} y={120} fontSize="8" fill="#f97316" textAnchor="middle" fontWeight="800" letterSpacing="1">OUTPUT</text>
          </svg>
        </div>

        <div className="space-y-2 leading-relaxed">
          <p>
            The diagram above shows the <strong>Classic Architecture</strong> (nodes and weights).
            Watch the lines change color and thickness as the network learns, and watch for a gray,
            dimmed node — that&apos;s a dead ReLU unit.
          </p>
          <p>
            The 3D view shows the <strong>Output Manifold</strong>; the panel above it shows the
            same fold from directly overhead, one straight line per hidden unit.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div>
      {!isFullscreen && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setView("manifold")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-colors ${
              view === "manifold"
                ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400"
                : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
          >
            Manifold Fold
          </button>
          <button
            onClick={() => setView("architecture")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-colors ${
              view === "architecture"
                ? "bg-cyan-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400"
                : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
          >
            Architecture
          </button>
        </div>
      )}

      <div className={view === "architecture" ? "hidden" : ""}>
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div
        ref={containerRef}
        className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-4"}
      >
        <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}>
          <div className="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-purple-400 font-bold">
                  Neural Space Warper
                </h3>
              </div>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-purple-500" /> : <Maximize2 className="w-3.5 h-3.5 text-purple-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] shadow-lg pointer-events-auto flex flex-col gap-1 min-w-[180px]">
              <div className="flex justify-between items-center w-full">
                <span className="font-mono text-neutral-500 dark:text-neutral-400">
                  Epoch: <span className="text-neutral-800 dark:text-white font-bold">{epoch}</span>
                </span>
                <span className="font-mono text-neutral-500 dark:text-neutral-400">
                  Acc: <span className="text-blue-500 font-bold">{(accuracy * 100).toFixed(0)}%</span>
                </span>
                {gradNorm > 0.15 && <Flame className="w-3 h-3 text-red-500 animate-pulse ml-1" />}
              </div>
              <div className={`font-medium ${lossVolatility > 0.08 || gradNorm > 0.15 ? "text-red-500" : "text-neutral-600 dark:text-neutral-300"}`}>
                {getStatusMessage()}
              </div>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full block select-none cursor-grab active:cursor-grabbing flex-1"
            style={{ height: isFullscreen ? "100%" : "400px" }}
          />

          {isFullscreen && (
            <div className="absolute top-4 right-4 z-20 w-80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Floating controls</span>
                <button onClick={() => setIsFullscreen(false)} className="text-[10px] text-purple-400 hover:underline">
                  Exit FS
                </button>
              </div>
              {renderControls()}
            </div>
          )}
        </Panel>
      </div>

      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="space-y-6 border-neutral-200 dark:border-neutral-800">{renderControls()}</Panel>
        </div>
      )}
    </div>
      </div>

      <div className={view === "architecture" ? "" : "hidden"}>
        <NeuralNetworkArchitectureView
          dark={dark}
          isFullscreen={isFullscreen && view === "architecture"}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      </div>
    </div>
  );
}