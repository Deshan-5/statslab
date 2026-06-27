"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import { Maximize2, Minimize2, ScanFace, BoxSelect, SlidersHorizontal, Sparkles, CheckCircle2 } from "lucide-react";

interface Point2D { x1: number; x2: number; y: number; rbfZ: number; currentZ: number; }

// Generate Non-linearly separable Dataset (Concentric Circles)
function generateData(n: number = 300): Point2D[] {
  const data: Point2D[] = [];
  const gamma = 3.0; // RBF spread

  for (let i = 0; i < n; i++) {
    const isInner = i < n * 0.4; // 40% inner circle, 60% outer ring
    const angle = Math.random() * Math.PI * 2;
    
    // Inner cluster around 0.2, Outer ring around 0.8
    const r = isInner 
      ? Math.random() * 0.35 
      : 0.65 + Math.random() * 0.25;
    
    const x1 = r * Math.cos(angle);
    const x2 = r * Math.sin(angle);
    const y = isInner ? 1 : 0; // 1 = Orange (Inner), 0 = Blue (Outer)

    // Compute RBF Kernel projection Z = exp(-gamma * (x^2 + y^2))
    const distSq = x1 * x1 + x2 * x2;
    const rbfZ = Math.exp(-gamma * distSq);

    data.push({ x1, x2, y, rbfZ, currentZ: 0 });
  }
  return data;
}

const RANGE = 1.2;

export default function SVMKernelTool() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [is3DMode, setIs3DMode] = useState(false);
  const [hyperplaneZ, setHyperplaneZ] = useState(0.4);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dark, setDark] = useState(false);

  const dataRef = useRef<Point2D[]>([]);
  const animationRef = useRef({ progress: 0, target: 0 }); // 0 = 2D, 1 = 3D

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const pointsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const hyperplaneRef = useRef<THREE.Mesh | null>(null);

  // Init Data
  useRegisterToolState("svm-kernel", { is3DMode, hyperplaneZ }, { is3DMode: setIs3DMode, hyperplaneZ: setHyperplaneZ });
  useEffect(() => {
    dataRef.current = generateData();
  }, []);

  // Sync dark mode
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

  // Handle Resize
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

  // Core WebGL Init
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? "#07070a" : "#f9fafb");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    // Start strictly top-down (2D view)
    camera.position.set(0, 10, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    // Restrict angles initially for 2D
    controls.maxPolarAngle = 0;
    controls.minPolarAngle = 0;
    controlsRef.current = controls;

    const grid = new THREE.GridHelper(10, 20, dark ? "#1f2937" : "#cbd5e1", dark ? "#0f172a" : "#94a3b8");
    grid.position.y = -0.01;
    scene.add(grid);
    gridHelperRef.current = grid;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Data Points
    const pointsGroup = new THREE.Group();
    scene.add(pointsGroup);
    pointsGroupRef.current = pointsGroup;

    const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const mat0 = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 0.2 }); // Blue
    const mat1 = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 0.2 }); // Orange

    for (const pt of dataRef.current) {
      const sphere = new THREE.Mesh(sphereGeo, pt.y === 1 ? mat1 : mat0);
      // Data range (-1.2 to 1.2) mapped to surface (-3 to 3)
      sphere.position.set((pt.x1 / RANGE) * 4, 0, (pt.x2 / RANGE) * 4);
      pointsGroup.add(sphere);
    }

    // Hyperplane (Separating glass)
    const planeGeo = new THREE.PlaneGeometry(8, 8);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshStandardMaterial({ 
      color: 0x10b981, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.0 // Invisible initially
    });
    const hyperplane = new THREE.Mesh(planeGeo, planeMat);
    hyperplane.position.y = 0.4 * 4; // scaled Z
    scene.add(hyperplane);
    hyperplaneRef.current = hyperplane;

    // Animation Loop
    let animFrameId = 0;
    const animate = (time: number) => {
      animFrameId = requestAnimationFrame(animate);
      
      const anim = animationRef.current;
      // Smooth lerp progress towards target
      anim.progress += (anim.target - anim.progress) * 0.05;

      // Update Points Z coordinate
      const children = pointsGroup.children;
      for (let i = 0; i < dataRef.current.length; i++) {
        const pt = dataRef.current[i];
        pt.currentZ = pt.rbfZ * anim.progress; // scale RBF effect by progress
        children[i].position.y = pt.currentZ * 4; // Multiply by 4 for visual scaling
      }

      // Update Plane Opacity
      if (hyperplaneRef.current) {
        (hyperplaneRef.current.material as THREE.Material).opacity = anim.progress * 0.4;
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
      planeGeo.dispose();
      planeMat.dispose();
    };
  }, []);

  // Handle Mode Switch
  useEffect(() => {
    animationRef.current.target = is3DMode ? 1.0 : 0.0;
    
    if (controlsRef.current && cameraRef.current) {
      if (is3DMode) {
        // Unlock camera for 3D
        controlsRef.current.maxPolarAngle = Math.PI;
        controlsRef.current.minPolarAngle = 0;
        
        // Tween camera to isometric view
        const tweenCamera = () => {
          cameraRef.current!.position.lerp(new THREE.Vector3(8, 6, 8), 0.05);
          if (cameraRef.current!.position.distanceTo(new THREE.Vector3(8, 6, 8)) > 0.1) {
            requestAnimationFrame(tweenCamera);
          }
        };
        tweenCamera();
      } else {
        // Tween camera to top-down view
        const tweenCamera = () => {
          cameraRef.current!.position.lerp(new THREE.Vector3(0, 10, 0), 0.05);
          if (cameraRef.current!.position.distanceTo(new THREE.Vector3(0, 10, 0)) > 0.1) {
            requestAnimationFrame(tweenCamera);
          } else {
            // Lock camera to 2D
            controlsRef.current!.maxPolarAngle = 0;
            controlsRef.current!.minPolarAngle = 0;
            cameraRef.current!.position.set(0, 10, 0);
          }
        };
        tweenCamera();
      }
    }
  }, [is3DMode]);

  // Update Hyperplane height
  useEffect(() => {
    if (hyperplaneRef.current) {
      hyperplaneRef.current.position.y = hyperplaneZ * 4;
    }
  }, [hyperplaneZ]);

  const renderControls = () => (
    <>
      <div className="flex gap-2">
        <Btn 
          primary={is3DMode} 
          onClick={() => setIs3DMode(true)} 
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 font-bold uppercase tracking-wider ${!is3DMode ? 'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300' : ''}`}
        >
          <BoxSelect className="w-4 h-4" />
          Apply 3D RBF Kernel
        </Btn>
        <Btn 
          primary={!is3DMode}
          onClick={() => setIs3DMode(false)} 
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 font-bold uppercase tracking-wider ${is3DMode ? 'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300' : ''}`}
        >
          <ScanFace className="w-4 h-4" />
          Flat 2D View
        </Btn>
      </div>

      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 p-3 space-y-2 mt-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Educational Scenarios</div>
        <div className="flex gap-2">
          <button onClick={() => setIs3DMode(false)} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800/50 rounded-md text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors ${!is3DMode ? 'ring-2 ring-emerald-500' : ''}`}>
            <ScanFace className="w-3 h-3 text-orange-500" /> The Flat Problem
          </button>
          <button onClick={() => setIs3DMode(true)} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800/50 rounded-md text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors ${is3DMode ? 'ring-2 ring-emerald-500' : ''}`}>
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> The 3D Solution
          </button>
        </div>
      </div>

      <Field label="Separating Hyperplane (Z-Intercept)" value={hyperplaneZ.toFixed(2)}>
        <input 
          type="range" min={0.1} max={0.9} step={0.01} value={hyperplaneZ} 
          onChange={(e) => setHyperplaneZ(Number(e.target.value))} 
          className="w-full accent-emerald-500" 
          disabled={!is3DMode}
        />
        <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
          <span>0.1 (Low)</span>
          <span>0.9 (High)</span>
        </div>
        <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 flex items-start gap-1.5 bg-neutral-50 dark:bg-neutral-900 p-2 rounded border border-neutral-100 dark:border-neutral-800">
          <Sparkles className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
          <span><strong className="text-neutral-700 dark:text-neutral-300">Insight:</strong> The hyperplane is the "decision boundary". By tuning its height, we control exactly where the model decides a point is Orange vs Blue. In a real SVM, math finds the optimal height for us.</span>
        </div>
      </Field>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3.5 space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
        <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-[10px] uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1">Support Vector Machine (SVM)</div>
        <div className="space-y-2 leading-relaxed">
          <p>
            <span className="font-bold text-orange-500">The Problem</span>: A straight line cannot slice a circle perfectly in half on a flat 2D plane. The data is non-linearly separable.
          </p>
          <p>
            <span className="font-bold text-emerald-500">The Kernel Trick</span>: By applying a mathematical transformation (Radial Basis Function), we project the 2D points into 3D space. Suddenly, a simple flat glass plane (the hyperplane) can cleanly separate the blue ring from the orange center!
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div 
        ref={containerRef} 
        className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-4"}
      >
        <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}>
          
          {/* Dashboard HUD */}
          <div className="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-emerald-400 font-bold">
                  The Kernel Trick Visualizer
                </h3>
              </div>

              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-emerald-500" /> : <Maximize2 className="w-3.5 h-3.5 text-emerald-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] shadow-lg pointer-events-auto flex flex-col gap-1">
              <div className="flex justify-between items-center w-full">
                <span className="font-mono text-neutral-500 dark:text-neutral-400">Mode: <span className="text-neutral-800 dark:text-white font-bold">{is3DMode ? "3D Projection" : "2D Base"}</span></span>
              </div>
              <div className={`font-medium ${!is3DMode ? 'text-orange-500' : 'text-emerald-500'}`}>
                {is3DMode ? "Data is linearly separable!" : "Data is non-linearly separable."}
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
                <button 
                  onClick={() => setIsFullscreen(false)} 
                  className="text-[10px] text-emerald-400 hover:underline"
                >
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
          <Panel className="space-y-6 border-neutral-200 dark:border-neutral-800">
            {renderControls()}
          </Panel>
        </div>
      )}
    </div>
  );
}
