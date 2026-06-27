"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import { pipeline, env } from "@xenova/transformers";
import { Maximize2, Minimize2, Sparkles, BrainCircuit, Table2, BoxSelect } from "lucide-react";

env.allowLocalModels = false;
env.useBrowserCache = true;

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr.filter(x => x !== -Infinity));
  const exps = arr.map(x => x === -Infinity ? 0 : Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => sum === 0 ? 0 : x / sum);
}

// Map 384D to 3D for visualization
function extract3DVector(vec: number[]): THREE.Vector3 {
  // We use slightly different strides so X, Y, Z aren't identical
  let x = 0, y = 0, z = 0;
  for(let i=0; i<30; i++) x += vec[i];
  for(let i=30; i<60; i++) y += vec[i];
  for(let i=60; i<90; i++) z += vec[i];
  
  // Normalize and scale
  const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(1.5);
  return v;
}

export default function TransformerTool() {
  const [status, setStatus] = useState("Loading engine...");
  const [inputText, setInputText] = useState("The cat sat on the mat");
  const [tokens, setTokens] = useState<string[]>([]);
  const [attention, setAttention] = useState<number[][] | null>(null);
  const [vectors, setVectors] = useState<number[][]>([]);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [dark, setDark] = useState(false);

  const extractorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Sync dark mode
  useRegisterToolState("transformer-engine", { inputText, is3DMode }, { inputText: setInputText, is3DMode: setIs3DMode });
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    async function loadModel() {
      try {
        setStatus("Downloading model (~22MB)...");
        extractorRef.current = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        setStatus("Model ready");
      } catch (err: any) {
        setStatus(`Error: ${err.message || String(err)}`);
        console.error(err);
      }
    }
    loadModel();
  }, []);

  const runInference = async () => {
    if (!extractorRef.current) return;
    setStatus("Processing...");
    try {
      const output = await extractorRef.current(inputText, { pooling: 'none' });
      const seqLen = output.dims[1];
      const hiddenSize = output.dims[2];
      
      const words = inputText.split(" ").filter(w => w.trim().length > 0);
      const displayTokens = [];
      for (let i = 0; i < seqLen; i++) {
        if (i === 0) displayTokens.push("[CLS]");
        else if (i === seqLen - 1) displayTokens.push("[SEP]");
        else if (i - 1 < words.length) displayTokens.push(words[i - 1]);
        else displayTokens.push(`Tok_${i}`);
      }
      setTokens(displayTokens);

      const extractedVectors = [];
      for (let i = 0; i < seqLen; i++) {
        const vec = [];
        for (let j = 0; j < hiddenSize; j++) {
          const idx = i * hiddenSize + j;
          vec.push(output.data[idx]);
        }
        extractedVectors.push(vec);
      }
      setVectors(extractedVectors);

      const rawScores = [];
      for (let i = 0; i < seqLen; i++) {
        const row = [];
        for (let j = 0; j < seqLen; j++) {
          const score = dotProduct(extractedVectors[i], extractedVectors[j]) / Math.sqrt(hiddenSize);
          row.push(score);
        }
        rawScores.push(row);
      }

      const attentionMatrix = [];
      for (let i = 0; i < seqLen; i++) {
        const maskedRow = [...rawScores[i]];
        for (let j = i + 1; j < seqLen; j++) {
          maskedRow[j] = -Infinity; // Causal Masking
        }
        attentionMatrix.push(softmax(maskedRow));
      }

      setAttention(attentionMatrix);
      setStatus("Done");
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    }
  };

  // --- 3D Scene Setup ---
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 500;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 8, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    let animFrameId = 0;
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;

      if (groupRef.current) {
        groupRef.current.children.forEach(child => {
          if (child.userData && child.userData.isAttentionLine) {
            if ((child as THREE.Line).material instanceof THREE.LineDashedMaterial) {
              ((child as THREE.Line).material as any).dashOffset -= 0.05 * child.userData.speed;
            }
          }
        });
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
    };
  }, []);

  // Update Theme Colors
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
    const newGrid = new THREE.GridHelper(20, 40, gridColor1, gridColor2);
    newGrid.position.y = -0.01;
    scene.add(newGrid);
    gridHelperRef.current = newGrid;
  }, [dark]);

  // Handle Resize for Fullscreen Toggle
  useEffect(() => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  }, [isFullscreen]);

  // Re-draw 3D Attention Graph when data changes
  useEffect(() => {
    if (!groupRef.current || !attention || tokens.length === 0) return;
    const group = groupRef.current;
    group.clear();

    const n = tokens.length;
    const radius = Math.max(3, n * 0.4);
    
    // Positions for each word in a circle
    const positions: THREE.Vector3[] = [];
    
    // Create Nodes (Words)
    const sphereGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const matToken = new THREE.MeshStandardMaterial({ color: 0x6366f1, emissive: 0x4f46e5, emissiveIntensity: 0.2 });

    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
      
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const pos = new THREE.Vector3(x, 0, z);
        positions.push(pos);

        const sphere = new THREE.Mesh(sphereGeo, matToken);
        sphere.position.copy(pos);
        sphere.userData = { isToken: true, index: i };
        group.add(sphere);

        // Word Label
        const textGeo = new TextGeometry(tokens[i], { font, size: 0.2, depth: 0.02 });
        textGeo.center();
        const textMat = new THREE.MeshBasicMaterial({ color: dark ? 0xffffff : 0x1e293b });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(pos.x, pos.y - 0.4, pos.z);
        textMesh.userData = { isLabel: true, index: i };
        
        // Face text outwards
        textMesh.lookAt(new THREE.Vector3(pos.x * 2, pos.y - 0.4, pos.z * 2));
        group.add(textMesh);

        // Draw the Q/K vector projection for this word
        if (vectors[i]) {
          const projectedVec = extract3DVector(vectors[i]);
          const arrowHelper = new THREE.ArrowHelper(
            projectedVec.clone().normalize(),
            pos,
            projectedVec.length(),
            0x8b5cf6, // Violet for embedding vector
            0.2,
            0.1
          );
          arrowHelper.userData = { isArrow: true, index: i };
          group.add(arrowHelper);
        }
      }

      // Draw Attention Beams (Lines)
      const matLine = new THREE.LineBasicMaterial({ color: 0xec4899, transparent: true, blending: THREE.AdditiveBlending });

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          
          const weight = attention[i][j];
          if (weight < 0.05) continue; // Ignore weak attention

          // Use a curved path (quadratic bezier) so lines don't clip through the floor
          const p1 = positions[i];
          const p2 = positions[j];
          const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          midPoint.y += (p1.distanceTo(p2) * 0.3); // Curve height depends on distance

          const curve = new THREE.QuadraticBezierCurve3(p1, midPoint, p2);
          const pts = curve.getPoints(20);
          const geoLine = new THREE.BufferGeometry().setFromPoints(pts);

          // Clone material to set specific opacity
          const m = new THREE.LineDashedMaterial({ 
            color: 0xec4899, 
            transparent: true, 
            blending: THREE.AdditiveBlending,
            dashSize: 0.3,
            gapSize: 0.2,
            opacity: weight * 0.9 
          });
          
          const line = new THREE.Line(geoLine, m);
          line.computeLineDistances();
          line.userData = { isAttentionLine: true, speed: weight * 2 + 0.5 };
          group.add(line);
        }
      }
    });

  }, [attention, tokens, vectors, dark]);

  const renderControls = () => (
    <>
      <div className="flex gap-2">
        <input 
          type="text" 
          value={inputText}
          maxLength={80}
          onChange={(e) => {
            const val = e.target.value;
            const words = val.split(" ");
            if (words.length > 10) {
              setInputText(words.slice(0, 10).join(" "));
            } else {
              setInputText(val);
            }
          }}
          className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Type a sentence (max 10 words)..."
        />
        <Btn primary onClick={runInference} disabled={status.includes("Downloading") || status.includes("Processing")} className="px-6 font-bold">
          Analyze
        </Btn>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-4 space-y-4 text-xs text-neutral-600 dark:text-neutral-400 mt-6">
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
          <BrainCircuit className="w-4 h-4 text-indigo-500" />
          <div className="font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">How 3D Attention Works</div>
        </div>
        
        <div className="space-y-3 leading-relaxed">
          <p>
            <span className="font-bold text-indigo-500 flex items-center gap-1"><Sparkles className="w-3 h-3"/> The Tokens (Spheres)</span>
            Each word is mapped to a position in our 3D space.
          </p>
          <p>
            <span className="font-bold text-violet-500 flex items-center gap-1"><Sparkles className="w-3 h-3"/> The Query/Key Vectors (Purple Arrows)</span>
            Words aren't just strings; they are mathematically encoded as vectors in high-dimensional space. We project the 384D embedding of each word into a 3D arrow to visualize its "semantic direction".
          </p>
          <p>
            <span className="font-bold text-pink-500 flex items-center gap-1"><Sparkles className="w-3 h-3"/> The Attention Beams (Pink Curves)</span>
            The model takes the Dot-Product of the arrows. If two words are grammatically or semantically relevant (like "cat" and "sat"), the mathematical result is high, and a glowing pink beam is drawn between them.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div 
        ref={containerRef} 
        className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-4 h-[600px] lg:h-auto"}
      >
        <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}>
          
          {/* Dashboard HUD */}
          <div className="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <BrainCircuit className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-indigo-400 font-bold">
                  Transformer QKV Space
                </h3>
              </div>

              <button 
                onClick={() => setIs3DMode(!is3DMode)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {is3DMode ? <Table2 className="w-3.5 h-3.5 text-indigo-500" /> : <BoxSelect className="w-3.5 h-3.5 text-indigo-500" />}
                {is3DMode ? "2D Matrix" : "3D Space"}
              </button>

              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-500" /> : <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>

            <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] font-mono text-neutral-600 dark:text-neutral-400 shadow-lg pointer-events-auto flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${status === "Done" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`}></div>
              {status}
            </div>
          </div>

          <canvas 
            ref={canvasRef} 
            className={`w-full select-none cursor-grab active:cursor-grabbing flex-1 ${is3DMode ? "block" : "hidden"}`} 
            style={{ height: isFullscreen ? "100%" : "500px" }} 
          />

          {!is3DMode && attention && tokens.length > 0 && (
            <div className="w-full flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-white dark:bg-[#07070a]">
              <div className="relative inline-block mt-8">
                <div className="flex ml-24">
                  {tokens.map((t, i) => (
                    <div key={`col-${i}`} className="w-12 h-24 relative">
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 -rotate-45 origin-bottom-left text-xs text-neutral-500 whitespace-nowrap">
                        {t}
                      </span>
                    </div>
                  ))}
                </div>

                {tokens.map((tRow, i) => (
                  <div key={`row-${i}`} className="flex items-center group" onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}>
                    <div className={`w-24 text-right pr-4 text-xs truncate transition-colors ${hoveredRow === i ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-neutral-500"}`}>
                      {tRow}
                    </div>
                    {tokens.map((tCol, j) => {
                      const val = attention[i][j];
                      const intensity = Math.min(1, Math.max(0, val));
                      const isMasked = j > i;
                      
                      return (
                        <div 
                          key={`cell-${i}-${j}`} 
                          className="w-12 h-12 border border-neutral-100 dark:border-neutral-900 relative flex items-center justify-center transition-all duration-300"
                          style={{
                            backgroundColor: isMasked 
                              ? "transparent" 
                              : `rgba(99, 102, 241, ${intensity})`
                          }}
                        >
                          {!isMasked && hoveredRow === i && (
                            <span className="text-[10px] bg-white/95 text-neutral-900 dark:bg-black/95 dark:text-white border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 rounded shadow-lg z-10 font-bold font-mono backdrop-blur-sm">
                              {val.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isFullscreen && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4 pointer-events-auto">
              <div className="bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                  <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Model Input</span>
                  <button 
                    onClick={() => setIsFullscreen(false)} 
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    Exit Fullscreen
                  </button>
                </div>
                {renderControls()}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="border-neutral-200 dark:border-neutral-800 h-full">
            {renderControls()}
          </Panel>
        </div>
      )}
    </div>
  );
}
