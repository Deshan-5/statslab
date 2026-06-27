"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import { Play, Pause, RotateCcw, Compass, HelpCircle, LineChart, Maximize2, Minimize2 } from "lucide-react";

type Optimizer = "SGD" | "Momentum" | "Adam";
type SurfaceType = "Rugged" | "Rosenbrock";
interface Point3D { w0: number; w1: number; loss: number; }

// --- Loss Surface Mathematics ---
function loss(w0: number, w1: number, type: SurfaceType): number {
  if (type === "Rosenbrock") {
    // Rosenbrock Valley: (1 - x)^2 + 10 * (y - x^2)^2
    // Scaled by 0.12 so it fits comfortably on our height scale
    return 0.12 * (Math.pow(1 - w0, 2) + 8 * Math.pow(w1 - w0 * w0, 2));
  }
  // Rugged Hills (default)
  const a = 0.4 * w0 * w0 + 0.8 * w1 * w1;
  const b = 0.5 * Math.cos(2.5 * w0) * Math.cos(2.5 * w1);
  return a - b + 0.6;
}

function gradLoss(w0: number, w1: number, type: SurfaceType): [number, number] {
  const eps = 1e-4;
  return [
    (loss(w0 + eps, w1, type) - loss(w0 - eps, w1, type)) / (2 * eps),
    (loss(w0, w1 + eps, type) - loss(w0, w1 - eps, type)) / (2 * eps),
  ];
}

// --- Optimizer Algorithms ---
function stepSGD(w0: number, w1: number, lr: number, type: SurfaceType): [number, number] {
  const [g0, g1] = gradLoss(w0, w1, type);
  return [w0 - lr * g0, w1 - lr * g1];
}

function stepMomentum(w0: number, w1: number, v0: number, v1: number, lr: number, type: SurfaceType, beta = 0.9): [number, number, number, number] {
  const [g0, g1] = gradLoss(w0, w1, type);
  const nv0 = beta * v0 - lr * g0;
  const nv1 = beta * v1 - lr * g1;
  return [w0 + nv0, w1 + nv1, nv0, nv1];
}

function stepAdam(w0: number, w1: number, m0: number, m1: number, v0: number, v1: number, t: number, lr: number, type: SurfaceType, beta1 = 0.9, beta2 = 0.999, eps = 1e-8): [number, number, number, number, number, number] {
  const [g0, g1] = gradLoss(w0, w1, type);
  const nm0 = beta1 * m0 + (1 - beta1) * g0;
  const nm1 = beta1 * m1 + (1 - beta1) * g1;
  const nv0 = beta2 * v0 + (1 - beta2) * g0 * g0;
  const nv1 = beta2 * v1 + (1 - beta2) * g1 * g1;
  const mc0 = nm0 / (1 - Math.pow(beta1, t));
  const mc1 = nm1 / (1 - Math.pow(beta1, t));
  const vc0 = nv0 / (1 - Math.pow(beta2, t));
  const vc1 = nv1 / (1 - Math.pow(beta2, t));
  return [w0 - lr * mc0 / (Math.sqrt(vc0) + eps), w1 - lr * mc1 / (Math.sqrt(vc1) + eps), nm0, nm1, nv0, nv1];
}

const RANGE = 2.4;
const HEIGHT_SCALE = 2.0;

const OPTIMIZER_COLORS: Record<Optimizer, string> = { SGD: "#f97316", Momentum: "#a855f7", Adam: "#10b981" };
const OPTIMIZER_HEX: Record<Optimizer, number> = { SGD: 0xf97316, Momentum: 0xa855f7, Adam: 0x10b981 };

function getSurfaceLimits(type: SurfaceType): { min: number, max: number } {
  const tempGrid: number[] = [];
  for (let i = 0; i <= 50; i++) {
    for (let j = 0; j <= 50; j++) {
      tempGrid.push(loss(-RANGE + (2 * RANGE * i) / 50, -RANGE + (2 * RANGE * j) / 50, type));
    }
  }
  return { min: Math.min(...tempGrid), max: Math.max(...tempGrid) };
}

const RUGGED_LIMITS = getSurfaceLimits("Rugged");
const ROSENBROCK_LIMITS = getSurfaceLimits("Rosenbrock");

export default function GradientDescentTool() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [lr, setLr] = useState(0.08);
  const [optimizers, setOptimizers] = useState<Record<Optimizer, boolean>>({ SGD: true, Momentum: true, Adam: true });
  const [surfaceType, setSurfaceType] = useState<SurfaceType>("Rugged");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dark, setDark] = useState(false);
  
  useRegisterToolState("gradient-descent", { lr, surfaceType }, { lr: setLr, surfaceType: setSurfaceType });
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);
  
  const [paths, setPaths] = useState<Record<Optimizer, Point3D[]>>({ SGD: [], Momentum: [], Adam: [] });
  
  const stateRef = useRef({
    sgd: { w0: 2.0, w1: 1.8 },
    mom: { w0: 2.0, w1: 1.8, v0: 0, v1: 0 },
    adam: { w0: 2.0, w1: 1.8, m0: 0, m1: 0, v0: 0, v1: 0, t: 0 }
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);

  const sphereMeshesRef = useRef<Record<Optimizer, THREE.Mesh | null>>({ SGD: null, Momentum: null, Adam: null });
  const pathLinesRef = useRef<Record<Optimizer, THREE.Line | null>>({ SGD: null, Momentum: null, Adam: null });

  // --- Reset Simulation and Camera ---
  const doReset = useCallback(() => {
    setRunning(false);
    setStep(0);
    const start = surfaceType === "Rosenbrock" ? { w0: -1.8, w1: 1.5 } : { w0: 2.0, w1: 1.8 };
    stateRef.current = {
      sgd: { ...start },
      mom: { ...start, v0: 0, v1: 0 },
      adam: { ...start, m0: 0, m1: 0, v0: 0, v1: 0, t: 0 }
    };
    
    const initialPaths = {
      SGD: [{ ...start, loss: loss(start.w0, start.w1, surfaceType) }],
      Momentum: [{ ...start, loss: loss(start.w0, start.w1, surfaceType) }],
      Adam: [{ ...start, loss: loss(start.w0, start.w1, surfaceType) }]
    };
    setPaths(initialPaths);

    const spheres = sphereMeshesRef.current;
    const yVal = loss(start.w0, start.w1, surfaceType) * HEIGHT_SCALE + 0.15;
    
    Object.keys(spheres).forEach((key) => {
      const opt = key as Optimizer;
      const mesh = spheres[opt];
      if (mesh) {
        mesh.position.set(start.w0 * 3, yVal, start.w1 * 3);
        mesh.visible = optimizers[opt];
      }
      
      const line = pathLinesRef.current[opt];
      if (line) {
        const positions = new Float32Array(200 * 3);
        positions[0] = start.w0 * 3;
        positions[1] = yVal;
        positions[2] = start.w1 * 3;
        line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        line.geometry.setDrawRange(0, 1);
        line.visible = optimizers[opt];
      }
    });

    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(12, 14, 18);
      controlsRef.current.target.set(0, 2, 0);
      controlsRef.current.update();
    }
  }, [optimizers, surfaceType]);

  useEffect(() => { doReset(); }, [optimizers, doReset]);

  // --- Handle Resize when fullscreen toggles ---
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

  // --- Core WebGL Init and Loop ---
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 400;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? "#07070a" : "#f9fafb");
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(12, 14, 18);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;

    // Grid Floor underneath
    const grid = new THREE.GridHelper(24, 12, dark ? "#1f2937" : "#cbd5e1", dark ? "#0f172a" : "#94a3b8");
    grid.position.y = -0.05;
    scene.add(grid);
    gridHelperRef.current = grid;

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x4f46e5, 0.4);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    // 6. Generate 3D Mathematical Terrain Mesh
    const gridSegments = 80;
    const terrainGeo = new THREE.PlaneGeometry(15, 15, gridSegments, gridSegments);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    const colorsArr = [];
    const colorLow = new THREE.Color("#312e81");
    const colorMid = new THREE.Color("#6366f1");
    const colorHigh = new THREE.Color("#f97316");

    const limits = surfaceType === "Rugged" ? RUGGED_LIMITS : ROSENBROCK_LIMITS;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      const w0 = (x / 7.5) * RANGE;
      const w1 = (z / 7.5) * RANGE;

      const val = loss(w0, w1, surfaceType);
      const y = val * HEIGHT_SCALE;
      posAttr.setY(i, y);

      const t = (val - limits.min) / (limits.max - limits.min || 1);
      const c = new THREE.Color();
      if (t < 0.4) {
        c.lerpColors(colorLow, colorMid, t / 0.4);
      } else {
        c.lerpColors(colorMid, colorHigh, (t - 0.4) / 0.6);
      }
      colorsArr.push(c.r, c.g, c.b);
    }
    terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: false,
      side: THREE.DoubleSide
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 7. Spheres for Optimizers
    const sphereGeo = new THREE.SphereGeometry(0.3, 32, 32);
    
    Object.keys(OPTIMIZER_HEX).forEach((key) => {
      const opt = key as Optimizer;
      const mat = new THREE.MeshStandardMaterial({
        color: OPTIMIZER_HEX[opt],
        roughness: 0.1,
        metalness: 0.8,
        emissive: OPTIMIZER_HEX[opt],
        emissiveIntensity: 0.15
      });
      const sphere = new THREE.Mesh(sphereGeo, mat);
      const start = surfaceType === "Rosenbrock" ? { w0: -1.8, w1: 1.5 } : { w0: 2.0, w1: 1.8 };
      sphere.position.set(start.w0 * 3, loss(start.w0, start.w1, surfaceType) * HEIGHT_SCALE + 0.15, start.w1 * 3);
      sphere.visible = optimizers[opt];
      scene.add(sphere);
      sphereMeshesRef.current[opt] = sphere;

      // 8. Tracing Path Lines
      const lineGeo = new THREE.BufferGeometry();
      const lineMat = new THREE.LineBasicMaterial({
        color: OPTIMIZER_HEX[opt],
        linewidth: 4
      });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      pathLinesRef.current[opt] = line;
    });

    // 9. Frame loop
    let animFrameId = 0;
    const animate = (time: number) => {
      animFrameId = requestAnimationFrame(animate);
      if (!running) {
        terrainMesh.rotation.y = Math.sin(time * 0.0001) * 0.02;
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

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      sphereGeo.dispose();
      Object.keys(pathLinesRef.current).forEach((k) => {
        const line = pathLinesRef.current[k as Optimizer];
        if (line) {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
      });
    };
  }, [optimizers]);

  // Handle Dynamic Mesh update when Surface Type changes
  useEffect(() => {
    if (!terrainMeshRef.current) return;
    const mesh = terrainMeshRef.current;
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    
    const limits = surfaceType === "Rugged" ? RUGGED_LIMITS : ROSENBROCK_LIMITS;
    const colorsArr = [];
    const colorLow = new THREE.Color("#312e81");
    const colorMid = new THREE.Color("#6366f1");
    const colorHigh = new THREE.Color("#f97316");

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      const w0 = (x / 7.5) * RANGE;
      const w1 = (z / 7.5) * RANGE;

      const val = loss(w0, w1, surfaceType);
      const y = val * HEIGHT_SCALE;
      posAttr.setY(i, y);

      const t = (val - limits.min) / (limits.max - limits.min || 1);
      const c = new THREE.Color();
      if (t < 0.4) {
        c.lerpColors(colorLow, colorMid, t / 0.4);
      } else {
        c.lerpColors(colorMid, colorHigh, (t - 0.4) / 0.6);
      }
      colorsArr.push(c.r, c.g, c.b);
    }

    posAttr.needsUpdate = true;
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
    geo.computeVertexNormals();

    doReset();
  }, [surfaceType, doReset]);

  // Handle theme transitions dynamically
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
    const newGrid = new THREE.GridHelper(24, 12, gridColor1, gridColor2);
    newGrid.position.y = -0.05;
    scene.add(newGrid);
    gridHelperRef.current = newGrid;
  }, [dark]);

  // --- Run single math tick of Gradient Descent ---
  const runDescentStep = useCallback(() => {
    setStep((prevStep) => {
      const nextStep = prevStep + 1;

      setPaths((prevPaths) => {
        const nextPaths = { ...prevPaths };
        const st = stateRef.current;

        if (optimizers.SGD) {
          const [nw0, nw1] = stepSGD(st.sgd.w0, st.sgd.w1, lr, surfaceType);
          st.sgd = { w0: nw0, w1: nw1 };
          nextPaths.SGD = [...prevPaths.SGD, { w0: nw0, w1: nw1, loss: loss(nw0, nw1, surfaceType) }];
        }
        if (optimizers.Momentum) {
          const [nw0, nw1, nv0, nv1] = stepMomentum(st.mom.w0, st.mom.w1, st.mom.v0, st.mom.v1, lr, surfaceType);
          st.mom = { w0: nw0, w1: nw1, v0: nv0, v1: nv1 };
          nextPaths.Momentum = [...prevPaths.Momentum, { w0: nw0, w1: nw1, loss: loss(nw0, nw1, surfaceType) }];
        }
        if (optimizers.Adam) {
          const nt = st.adam.t + 1;
          const [nw0, nw1, nm0, nm1, nv0, nv1] = stepAdam(st.adam.w0, st.adam.w1, st.adam.m0, st.adam.m1, st.adam.v0, st.adam.v1, nt, lr, surfaceType);
          st.adam = { w0: nw0, w1: nw1, m0: nm0, m1: nm1, v0: nv0, v1: nv1, t: nt };
          nextPaths.Adam = [...prevPaths.Adam, { w0: nw0, w1: nw1, loss: loss(nw0, nw1, surfaceType) }];
        }

        Object.keys(OPTIMIZER_COLORS).forEach((key) => {
          const opt = key as Optimizer;
          const sphere = sphereMeshesRef.current[opt];
          const line = pathLinesRef.current[opt];
          const currentPath = nextPaths[opt];

          if (optimizers[opt] && currentPath.length > 0) {
            const p = currentPath[currentPath.length - 1];
            const yVal = p.loss * HEIGHT_SCALE + 0.15;
            
            if (sphere) {
              sphere.position.set(p.w0 * 3, yVal, p.w1 * 3);
            }

            if (line) {
              const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
              if (posAttr) {
                const idx = currentPath.length - 1;
                if (idx < 200) {
                  posAttr.setXYZ(idx, p.w0 * 3, yVal - 0.1, p.w1 * 3);
                  posAttr.needsUpdate = true;
                  line.geometry.setDrawRange(0, idx + 1);
                }
              }
            }
          }
        });

        return nextPaths;
      });

      return nextStep;
    });
  }, [lr, optimizers]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(runDescentStep, 80);
    return () => clearInterval(interval);
  }, [running, runDescentStep]);

  const toggleOptimizer = (opt: Optimizer) => {
    setOptimizers((prev) => ({ ...prev, [opt]: !prev[opt] }));
  };

  const currentLoss = (opt: Optimizer) => {
    const p = paths[opt];
    return p.length > 0 ? p[p.length - 1].loss : null;
  };

  const renderControls = () => (
    <>
      <div className="flex gap-2">
        <Btn 
          primary 
          onClick={() => setRunning(!running)} 
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 font-bold uppercase tracking-wider"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? "Pause" : "Run Descent"}
        </Btn>
        <Btn 
          onClick={doReset} 
          className="flex items-center justify-center gap-1.5 text-xs py-2.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <RotateCcw className="w-4 h-4" />
          Reset View
        </Btn>
      </div>

      <Field label="Loss Surface Function" value={surfaceType}>
        <div className="flex gap-2">
          {(["Rugged", "Rosenbrock"] as SurfaceType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setSurfaceType(t); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-all ${surfaceType === t ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400" : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}
            >
              {t === "Rugged" ? "Rugged Hills" : "Rosenbrock Valley"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Global Learning Rate" value={lr.toFixed(3)}>
        <input 
          type="range" 
          min={0.005} 
          max={0.2} 
          step={0.005} 
          value={lr} 
          onChange={(e) => { 
            setLr(Number(e.target.value)); 
            doReset(); 
          }} 
          className="w-full accent-purple-500" 
        />
        <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
          <span>0.005 (Safe)</span>
          <span>0.200 (Aggressive)</span>
        </div>
      </Field>

      <div>
        <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 font-semibold">Active Optimizers</div>
        <div className="space-y-2">
          {(["SGD", "Momentum", "Adam"] as Optimizer[]).map((opt) => (
            <button 
              key={opt} 
              onClick={() => toggleOptimizer(opt)} 
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all text-sm ${optimizers[opt] ? "border-transparent text-white" : "border-neutral-200 dark:border-neutral-800 text-neutral-500 bg-neutral-50 dark:bg-[#07070a] hover:bg-neutral-100 dark:hover:bg-neutral-900"}`} 
              style={optimizers[opt] ? { backgroundColor: OPTIMIZER_COLORS[opt] } : {}}
            >
              <span className={`w-2 h-2 rounded-full ${optimizers[opt] ? "bg-white" : "bg-neutral-800"}`} />
              <span className="font-semibold">{opt}</span>
              {optimizers[opt] && currentLoss(opt) !== null && (
                <span className="ml-auto text-[11px] opacity-80 font-mono">Loss: {currentLoss(opt)!.toFixed(3)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
        <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-[10px] uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1">Optimization Logic</div>
        <div className="space-y-2 leading-relaxed">
          <p>
            <span className="font-bold text-orange-500">SGD</span>:
            Moves straight down the local slope. Very sensitive to learning rates.
          </p>
          <p>
            <span className="font-bold text-purple-400">Momentum</span>:
            Accumulates velocity (rolling mass) to speed through flat plateaus.
          </p>
          <p>
            <span className="font-bold text-emerald-400">Adam</span>:
            Adapts step sizes for each parameter. The default standard in LLMs.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      {/* 3D Loss Surface Viewer */}
      <div 
        ref={containerRef} 
        className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-4"}
      >
        <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}>
          
          {/* Dashboard HUD */}
          <div className="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <Compass className="w-3.5 h-3.5 text-purple-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-purple-400 font-bold">
                  {surfaceType === "Rugged" ? "Rugged Hills Topology" : "Rosenbrock Valley Path"}
                </h3>
              </div>

              {/* Surface toggle in HUD */}
              <button 
                onClick={() => setSurfaceType(surfaceType === "Rugged" ? "Rosenbrock" : "Rugged")}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                Change Loss Terrain
              </button>

              {/* Fullscreen Toggle */}
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-purple-500" /> : <Maximize2 className="w-3.5 h-3.5 text-purple-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] font-mono text-neutral-600 dark:text-neutral-400 shadow-lg pointer-events-auto">
              Epoch/Step: <span className="text-neutral-800 dark:text-white font-bold">{step}</span>
            </div>
          </div>

          {/* WebGL Canvas */}
          <canvas 
            ref={canvasRef} 
            className="w-full block select-none cursor-grab active:cursor-grabbing flex-1" 
            style={{ height: isFullscreen ? "100%" : "400px" }} 
          />

          {/* Interactive Guide Overlay */}
          <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-neutral-900/80 backdrop-blur px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-400 flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-neutral-700 dark:text-neutral-300">
              <HelpCircle className="w-3.5 h-3.5 text-purple-400" /> Controls:
            </span>
            <span>🖱️ Rotate Camera</span>
            <span>⚡ Zoom Surface</span>
          </div>

          {/* Floating Controls in Fullscreen Mode */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 z-20 w-80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Floating controls</span>
                <button 
                  onClick={() => setIsFullscreen(false)} 
                  className="text-[10px] text-purple-400 hover:underline"
                >
                  Exit FS
                </button>
              </div>
              {renderControls()}
            </div>
          )}
        </Panel>

        {/* 2D History Chart for Convergence Rates (Only in normal layout) */}
        {!isFullscreen && paths.SGD.length > 1 && (
          <Panel className="bg-white dark:bg-[#09090d] border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2 mb-3">
              <LineChart className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-bold">Convergence Rates (Loss vs Steps)</span>
            </div>
            <div className="h-20 w-full relative">
              <svg viewBox="0 0 500 80" className="w-full h-full overflow-visible">
                <line x1="0" y1="10" x2="500" y2="10" stroke="var(--chart-axis)" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="40" x2="500" y2="40" stroke="var(--chart-axis)" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="70" x2="500" y2="70" stroke="var(--chart-axis)" strokeWidth="0.5" strokeDasharray="2 2" />

                {(["SGD", "Momentum", "Adam"] as Optimizer[]).map((opt) => {
                  if (!optimizers[opt] || paths[opt].length < 2) return null;
                  const allLosses = paths[opt].map((p) => p.loss);
                  const maxL = Math.max(...allLosses);
                  const minL = Math.min(...allLosses);
                  const range = maxL - minL || 1;

                  const d = paths[opt].map((p, i) => {
                    const x = (i / Math.max(paths[opt].length - 1, 1)) * 480 + 10;
                    const y = 70 - ((p.loss - minL) / range) * 60;
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  }).join(" ");

                  return (
                    <path
                      key={opt}
                      d={d}
                      fill="none"
                      stroke={OPTIMIZER_COLORS[opt]}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.9"
                    />
                  );
                })}
              </svg>
            </div>
          </Panel>
        )}
      </div>

      {/* Side Control panel (Normal Mode) */}
      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="space-y-6 border-neutral-200 dark:border-neutral-800">
            {renderControls()}
          </Panel>
        </div>
      )}
    </div>
  );
}
