"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import { RotateCcw, Maximize2, Minimize2, Search, X, ArrowRight } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seededRng(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function cosineSim(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dot = ax * bx + ay * by + az * bz;
  const mA = Math.sqrt(ax ** 2 + ay ** 2 + az ** 2);
  const mB = Math.sqrt(bx ** 2 + by ** 2 + bz ** 2);
  return mA && mB ? Math.max(-1, Math.min(1, dot / (mA * mB))) : 0;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const CLUSTERS = [
  {
    name: "Royalty", centroid: [14, 8, 4] as [number, number, number], radius: 4, color: "#d97706",
    words: ["King", "Queen", "Prince", "Princess", "Man", "Woman", "Father", "Mother", "Brother", "Sister", "Husband", "Wife", "Lord", "Lady"],
  },
  {
    name: "Geography", centroid: [-14, 10, -6] as [number, number, number], radius: 4, color: "#3b82f6",
    words: ["Paris", "France", "Rome", "Italy", "Tokyo", "Japan", "London", "England", "Berlin", "Germany", "Madrid", "Spain"],
  },
  {
    name: "Animals", centroid: [-10, -12, 8] as [number, number, number], radius: 4, color: "#10b981",
    words: ["Dog", "Cat", "Lion", "Tiger", "Wolf", "Bear", "Eagle", "Shark", "Elephant", "Rabbit"],
  },
  {
    name: "Opposites", centroid: [4, -10, -12] as [number, number, number], radius: 4.5, color: "#a855f7",
    words: ["Good", "Bad", "Better", "Worse", "Big", "Small", "Bigger", "Smaller", "Happy", "Sad", "Hot", "Cold"],
  },
  {
    name: "Food", centroid: [-14, -10, -2] as [number, number, number], radius: 3.5, color: "#f97316",
    words: ["Pizza", "Coffee", "Bread", "Cheese", "Apple", "Banana", "Rice", "Soup"],
  },
  {
    name: "Technology", centroid: [10, 14, 10] as [number, number, number], radius: 3, color: "#06b6d4",
    words: ["Computer", "Internet", "Robot", "Code", "Data", "Software"],
  },
  {
    name: "Sports", centroid: [14, -14, 6] as [number, number, number], radius: 3, color: "#eab308",
    words: ["Soccer", "Basketball", "Tennis", "Athlete", "Stadium", "Coach"],
  },
];

const ANCHOR_OFFSETS: Record<string, [number, number, number]> = {
  King: [1.5, 2, 0], Queen: [3.5, 2, 1.5], Man: [1, -2.5, 0], Woman: [3, -2.5, 1.5],
  Paris: [-1, 3, 1], France: [-1, 1, 1], Italy: [2, 0.5, -1], Rome: [2, 2.5, -1],
  Better: [1, 1.5, 0], Good: [-1, 1.5, 0], Bad: [-1, -1.5, 0], Worse: [1, -1.5, 0],
};

interface WordPoint { word: string; x: number; y: number; z: number; cluster: string; color: string; }

function generateEmbeddings(): WordPoint[] {
  const words: WordPoint[] = [];
  const placed = new Set<string>();
  let seed = 42;
  CLUSTERS.forEach(c => {
    c.words.forEach(w => {
      const off = ANCHOR_OFFSETS[w];
      const [cx, cy, cz] = c.centroid;
      let x: number, y: number, z: number;
      if (off) {
        x = cx + off[0]; y = cy + off[1]; z = cz + off[2];
      } else {
        const angle = seededRng(seed++) * Math.PI * 2;
        const r = 0.8 + seededRng(seed++) * (c.radius - 0.8);
        x = cx + Math.cos(angle) * r;
        y = cy + Math.sin(angle) * r;
        z = cz + (seededRng(seed++) - 0.5) * c.radius;
      }
      if (!placed.has(w.toLowerCase())) {
        words.push({ word: w, x, y, z, cluster: c.name, color: c.color });
        placed.add(w.toLowerCase());
      }
    });
  });
  return words;
}

const PRESETS = [
  { a: "King", b: "Man", c: "Woman", result: "Queen", hint: "Remove gender, keep the royal title" },
  { a: "Paris", b: "France", c: "Italy", result: "Rome", hint: "Swap the country, keep the capital" },
  { a: "Better", b: "Good", c: "Bad", result: "Worse", hint: "Same comparison, opposite direction" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmbeddingsTool() {
  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const labelARef = useRef<HTMLDivElement>(null);
  const labelBRef = useRef<HTMLDivElement>(null);
  const labelCRef = useRef<HTMLDivElement>(null);
  const labelResultRef = useRef<HTMLDivElement>(null);
  const clusterDivsRef = useRef<(HTMLDivElement | null)[]>(Array(CLUSTERS.length).fill(null));

  // THREE refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const pointsMeshRef = useRef<THREE.Points | null>(null);
  const starfieldRef = useRef<THREE.Points | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const haloMeshesRef = useRef<THREE.Mesh[]>([]);
  const autoRotRef = useRef(true);
  const flyTriggerRef = useRef<((t: WordPoint) => void) | null>(null);

  // Vector viz refs — shafts are solid cylinders (not THREE.Line) so they
  // stay visible regardless of zoom; THREE.Line ignores linewidth on most
  // WebGL backends and was rendering as a near-invisible hairline.
  const subLineRef = useRef<THREE.Mesh | null>(null);
  const addLineRef = useRef<THREE.Mesh | null>(null);
  const subConeRef = useRef<THREE.Mesh | null>(null);
  const addConeRef = useRef<THREE.Mesh | null>(null);
  const resultGlowRef = useRef<THREE.Mesh | null>(null);

  // State mirrors for animation loop (avoids stale closure)
  const selectedARef = useRef<WordPoint | null>(null);
  const selectedBRef = useRef<WordPoint | null>(null);
  const selectedCRef = useRef<WordPoint | null>(null);
  const resultWordRef = useRef<WordPoint | null>(null);

  const wordData = useMemo(() => generateEmbeddings(), []);

  const [wordA, setWordA] = useState("King");
  const [wordB, setWordB] = useState("Man");
  const [wordC, setWordC] = useState("Woman");
  const [showCustom, setShowCustom] = useState(false);
  const [selectedA, setSelectedA] = useState<WordPoint | null>(null);
  const [selectedB, setSelectedB] = useState<WordPoint | null>(null);
  const [selectedC, setSelectedC] = useState<WordPoint | null>(null);
  const [resultWord, setResultWord] = useState<WordPoint | null>(null);
  useRegisterToolState("semantic-space", { wordA, wordB, wordC }, { wordA: setWordA, wordB: setWordB, wordC: setWordC });
  const [resultSim, setResultSim] = useState<number | null>(null);
  const [suggestionsA, setSuggestionsA] = useState<WordPoint[]>([]);
  const [suggestionsB, setSuggestionsB] = useState<WordPoint[]>([]);
  const [suggestionsC, setSuggestionsC] = useState<WordPoint[]>([]);
  const [isFlying, setIsFlying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);
  const [dark, setDark] = useState(false);
  const [solved, setSolved] = useState(false);

  // Sync state → refs for animation loop
  useEffect(() => {
    selectedARef.current = selectedA;
    selectedBRef.current = selectedB;
    selectedCRef.current = selectedC;
    resultWordRef.current = resultWord;
  }, [selectedA, selectedB, selectedC, resultWord]);

  // Dark mode observer
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);

  // Word lookup + analogy math
  useEffect(() => {
    const find = (w: string) => wordData.find(p => p.word.toLowerCase() === w.trim().toLowerCase()) ?? null;
    const pA = find(wordA), pB = find(wordB), pC = find(wordC);
    setSelectedA(pA); setSelectedB(pB); setSelectedC(pC);

    if (pA && pB && pC) {
      const tx = pA.x - pB.x + pC.x;
      const ty = pA.y - pB.y + pC.y;
      const tz = pA.z - pB.z + pC.z;
      let closest: WordPoint | null = null;
      let minDist = Infinity;
      wordData.forEach(w => {
        if (w === pA || w === pB || w === pC) return;
        const d = (w.x - tx) ** 2 + (w.y - ty) ** 2 + (w.z - tz) ** 2;
        if (d < minDist) { minDist = d; closest = w; }
      });
      setResultWord(closest);
      if (closest != null) {
        const c2 = closest as WordPoint;
        const sim = cosineSim(tx, ty, tz, c2.x, c2.y, c2.z);
        setResultSim(Math.round(sim * 100));
      }
    } else {
      setResultWord(null); setResultSim(null);
    }
    setSolved(false);
  }, [wordA, wordB, wordC, wordData]);

  // ── Scene setup (runs once) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const isDk = () => document.documentElement.classList.contains("dark");
    const w0 = containerRef.current.clientWidth;
    const h0 = containerRef.current.clientHeight || 460;

    const scene = new THREE.Scene();
    const bgColor = isDk() ? "#07070a" : "#f8fafc";
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.011);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w0 / h0, 0.1, 1000);
    camera.position.set(0, 5, 52);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(w0, h0);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.maxDistance = 150;
    orbit.minDistance = 5;
    orbit.autoRotate = true;
    orbit.autoRotateSpeed = 1.2;
    orbitRef.current = orbit;
    orbit.addEventListener("start", () => { autoRotRef.current = false; orbit.autoRotate = false; });

    // Starfield
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = new Float32Array(600 * 3);
    for (let i = 0; i < starsPos.length; i++) starsPos[i] = (Math.random() - 0.5) * 220;
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.3 });
    const starfield = new THREE.Points(starsGeo, starsMat);
    starfield.visible = isDk();
    scene.add(starfield);
    starfieldRef.current = starfield;

    // Grid floor
    const grid = new THREE.GridHelper(100, 25, isDk() ? 0x1f2937 : 0xe2e8f0, isDk() ? 0x0f172a : 0xcbd5e1);
    grid.position.y = -20;
    scene.add(grid);
    gridRef.current = grid;

    // Cluster wireframe halos — colored cages showing cluster boundaries
    haloMeshesRef.current = [];
    CLUSTERS.forEach(c => {
      const hGeo = new THREE.SphereGeometry(c.radius + 1.5, 10, 7);
      const hMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(c.color),
        wireframe: true,
        transparent: true,
        opacity: isDk() ? 0.18 : 0.10,
      });
      const halo = new THREE.Mesh(hGeo, hMat);
      halo.position.set(...c.centroid);
      scene.add(halo);
      haloMeshesRef.current.push(halo);
    });

    // Word particle texture
    const mkTex = () => {
      const cv = document.createElement("canvas");
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.6, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
      return new THREE.CanvasTexture(cv);
    };

    const positions = new Float32Array(wordData.length * 3);
    const colors = new Float32Array(wordData.length * 3);
    wordData.forEach((wp, i) => {
      positions[i * 3] = wp.x; positions[i * 3 + 1] = wp.y; positions[i * 3 + 2] = wp.z;
      const col = new THREE.Color(wp.color);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    });
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const pMat = new THREE.PointsMaterial({
      size: 3.2, map: mkTex(), vertexColors: true,
      transparent: true, opacity: isDk() ? 0.92 : 0.95,
      depthWrite: false,
      blending: isDk() ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pointsMesh = new THREE.Points(pGeo, pMat);
    scene.add(pointsMesh);
    pointsMeshRef.current = pointsMesh;

    // Result glow sphere (hidden until analogy is solved)
    const gGeo = new THREE.SphereGeometry(1.8, 16, 16);
    const gMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0, depthWrite: false });
    const glowSphere = new THREE.Mesh(gGeo, gMat);
    glowSphere.visible = false;
    scene.add(glowSphere);
    resultGlowRef.current = glowSphere;

    // Raycaster for hover
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 1.0;
    const mouse = new THREE.Vector2();
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    renderer.domElement.addEventListener("mousemove", onMouseMove);

    const v3 = new THREE.Vector3();
    let hovIdx = -1;
    let animId = 0;

    let flyAnim: {
      active: boolean; start: number; dur: number;
      sp: THREE.Vector3; ep: THREE.Vector3;
      sl: THREE.Vector3; el: THREE.Vector3;
    } | null = null;

    const project = (x: number, y: number, z: number) => {
      v3.set(x, y, z).project(camera);
      const cw = renderer.domElement.clientWidth;
      const ch = renderer.domElement.clientHeight;
      return { x: (v3.x * 0.5 + 0.5) * cw, y: (-(v3.y * 0.5) + 0.5) * ch, ok: v3.z >= -1 && v3.z <= 1 };
    };

    const posWordLabel = (el: HTMLDivElement | null, wp: WordPoint | null, prefix: string) => {
      if (!el) return;
      if (!wp) { el.style.display = "none"; return; }
      const { x, y, ok } = project(wp.x, wp.y, wp.z);
      if (!ok) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.transform = `translate(-50%,-100%) translate(${x}px,${y - 14}px)`;
      el.innerHTML = `<span style="opacity:0.6;font-size:7px;display:block;text-transform:uppercase;letter-spacing:0.1em">${prefix}</span><span>${wp.word}</span>`;
    };

    const animate = (t: number) => {
      animId = requestAnimationFrame(animate);

      // Auto-rotate the camera (handled by OrbitControls.autoRotate below) rather
      // than the points/halos themselves — keeps word bubbles locked inside their
      // cluster cages instead of drifting away from them at a different rate.
      if (autoRotRef.current && !flyAnim && starfield.visible) {
        starfield.rotation.y = t * 0.000022;
      }

      // Fly animation (cubic ease in-out)
      if (flyAnim?.active) {
        const elapsed = (performance.now() - flyAnim.start) / 1000;
        const p = Math.min(elapsed / flyAnim.dur, 1);
        const ease = p < 0.5 ? 4 * p ** 3 : 1 - Math.pow(-2 * p + 2, 3) / 2;
        camera.position.lerpVectors(flyAnim.sp, flyAnim.ep, ease);
        orbit.target.lerpVectors(flyAnim.sl, flyAnim.el, ease);
        orbit.update();
        if (p >= 1) { flyAnim = null; setIsFlying(false); setSolved(true); }
      } else {
        orbit.update();
      }

      // Result glow pulse
      const rg = resultGlowRef.current;
      if (rg?.visible) {
        const pulse = (Math.sin(t * 0.0025) + 1) / 2;
        (rg.material as THREE.MeshBasicMaterial).opacity = 0.1 + pulse * 0.4;
        const s = 1 + pulse * 0.55;
        rg.scale.set(s, s, s);
      }

      // Hover detection
      if (!flyAnim) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(pointsMesh);
        if (hits.length && hits[0].index !== undefined) {
          const idx = hits[0].index;
          if (idx !== hovIdx) {
            hovIdx = idx;
            const pt = wordData[idx];
            const { x, y } = project(pt.x, pt.y, pt.z);
            const dk = document.documentElement.classList.contains("dark");
            const hl = hoverLabelRef.current;
            if (hl) {
              hl.style.display = "block";
              hl.style.transform = `translate(-50%,-140%) translate(${x}px,${y}px)`;
              hl.innerHTML = `<div style="padding:6px 10px;background:${dk ? "rgba(10,10,14,0.96)" : "rgba(255,255,255,0.96)"};border:1px solid ${dk ? "#374151" : "#d1d5db"};border-radius:8px;font-size:10px;white-space:nowrap;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,0.2)"><div style="font-weight:700;color:${pt.color}">${pt.word}</div><div style="font-size:8px;color:#6b7280;margin-top:2px">${pt.cluster}</div></div>`;
            }
          }
        } else {
          hovIdx = -1;
          if (hoverLabelRef.current) hoverLabelRef.current.style.display = "none";
        }
      }

      // Cluster name labels (projected to screen)
      CLUSTERS.forEach((c, i) => {
        const el = clusterDivsRef.current[i];
        if (!el) return;
        const { x, y, ok } = project(c.centroid[0], c.centroid[1] + c.radius + 2.8, c.centroid[2]);
        if (!ok) { el.style.display = "none"; return; }
        el.style.display = "block";
        el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
      });

      // Pinned word labels (A, −B, +C, = Result)
      posWordLabel(labelARef.current, selectedARef.current, "A");
      posWordLabel(labelBRef.current, selectedBRef.current, "−B");
      posWordLabel(labelCRef.current, selectedCRef.current, "+C");
      posWordLabel(labelResultRef.current, resultWordRef.current, "= Result");

      renderer.render(scene, camera);
    };

    requestAnimationFrame(animate);

    flyTriggerRef.current = (target: WordPoint) => {
      setIsFlying(true);
      autoRotRef.current = false;
      const sp = camera.position.clone();
      const ep = new THREE.Vector3(target.x + 5, target.y + 4, target.z + 13);
      const sl = orbit.target.clone();
      const el2 = new THREE.Vector3(target.x, target.y, target.z);
      flyAnim = { active: true, start: performance.now(), dur: 3, sp, ep, sl, el: el2 };
    };

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      scene.clear();
      renderer.dispose();
    };
  }, [wordData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dark mode color update (no scene rebuild) ───────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const bg = new THREE.Color(dark ? "#07070a" : "#f8fafc");
    scene.background = bg;
    if (scene.fog) (scene.fog as THREE.FogExp2).color = bg;
    if (starfieldRef.current) starfieldRef.current.visible = dark;
    if (pointsMeshRef.current) {
      const m = pointsMeshRef.current.material as THREE.PointsMaterial;
      m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.opacity = dark ? 0.92 : 0.95;
      m.needsUpdate = true;
    }
    haloMeshesRef.current.forEach(h => {
      const m = h.material as THREE.MeshBasicMaterial;
      m.opacity = dark ? 0.18 : 0.10;
      m.needsUpdate = true;
    });
    if (gridRef.current) {
      scene.remove(gridRef.current);
      gridRef.current.geometry.dispose();
      (gridRef.current.material as THREE.Material).dispose();
    }
    const newGrid = new THREE.GridHelper(100, 25, dark ? 0x1f2937 : 0xe2e8f0, dark ? 0x0f172a : 0xcbd5e1);
    newGrid.position.y = -20;
    scene.add(newGrid);
    gridRef.current = newGrid;
  }, [dark]);

  // ── Vector lines + arrow cones (updates whenever selection changes) ─────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const disposeRef = (r: React.MutableRefObject<THREE.Mesh | null>) => {
      if (r.current) {
        scene.remove(r.current);
        r.current.geometry.dispose();
        (r.current.material as THREE.Material).dispose();
        r.current = null;
      }
    };
    disposeRef(subLineRef);
    disposeRef(addLineRef);
    disposeRef(subConeRef);
    disposeRef(addConeRef);
    if (resultGlowRef.current) resultGlowRef.current.visible = false;

    if (!selectedA || !selectedB || !selectedC || !resultWord) return;

    // Arrowhead + shaft are sized relative to the vector's own length, not a
    // fixed world-space constant — otherwise a cone tuned to look right from
    // the wide establishing shot balloons into a giant triangle once the
    // camera flies in close to a short within-cluster hop.
    const makeArrow = (
      from: WordPoint, to: WordPoint, color: number, faded: boolean
    ): { line: THREE.Mesh; cone: THREE.Mesh } => {
      const start = new THREE.Vector3(from.x, from.y, from.z);
      const end = new THREE.Vector3(to.x, to.y, to.z);
      const full = new THREE.Vector3().subVectors(end, start);
      const length = Math.max(full.length(), 0.001);
      const dir = full.clone().normalize();

      const coneHeight = THREE.MathUtils.clamp(length * 0.22, 0.5, 1.6);
      const coneRadius = coneHeight * 0.32;
      const shaftLength = Math.max(length - coneHeight, 0.01);
      const shaftRadius = coneRadius * 0.22;

      const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
      const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: faded, opacity: faded ? 0.55 : 0.9 });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.copy(start).addScaledVector(dir, shaftLength / 2);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(shaft);

      const cGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 10);
      const cMat = new THREE.MeshBasicMaterial({ color });
      const cone = new THREE.Mesh(cGeo, cMat);
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(cone);
      return { line: shaft, cone };
    };

    // Amber, slightly faded: B → A (the subtraction step)
    const { line: sl, cone: sc } = makeArrow(selectedB, selectedA, 0xf59e0b, true);
    subLineRef.current = sl;
    subConeRef.current = sc;

    // Cyan, fully opaque: C → Result (the addition step)
    const { line: al, cone: ac } = makeArrow(selectedC, resultWord, 0x22d3ee, false);
    addLineRef.current = al;
    addConeRef.current = ac;

    // Position result glow
    if (resultGlowRef.current) {
      resultGlowRef.current.position.set(resultWord.x, resultWord.y, resultWord.z);
      resultGlowRef.current.visible = true;
      (resultGlowRef.current.material as THREE.MeshBasicMaterial).color.set(resultWord.color);
    }
  }, [selectedA, selectedB, selectedC, resultWord]);

  // ── 2D / 3D Z tween ────────────────────────────────────────────────────────
  useEffect(() => {
    const pm = pointsMeshRef.current;
    const oc = orbitRef.current;
    if (!pm || !oc) return;
    const pos = pm.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    oc.enableRotate = is3DMode;

    if (!is3DMode && cameraRef.current) {
      const flatCam = new THREE.Vector3(0, 0, 45);
      const tween = () => {
        cameraRef.current!.position.lerp(flatCam, 0.1);
        oc.target.lerp(new THREE.Vector3(0, 0, 0), 0.1);
        if (cameraRef.current!.position.distanceTo(flatCam) > 0.1) requestAnimationFrame(tween);
      };
      tween();
    }

    let fId: number;
    const tweenZ = () => {
      let active = false;
      for (let i = 0; i < wordData.length; i++) {
        const target = is3DMode ? wordData[i].z : 0;
        arr[i * 3 + 2] += (target - arr[i * 3 + 2]) * 0.1;
        if (Math.abs(target - arr[i * 3 + 2]) > 0.05) active = true;
        else arr[i * 3 + 2] = target;
      }
      pos.needsUpdate = true;
      if (active) fId = requestAnimationFrame(tweenZ);
    };
    tweenZ();
    return () => cancelAnimationFrame(fId);
  }, [is3DMode, wordData]);

  // Fullscreen resize
  useEffect(() => {
    const t = setTimeout(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    }, 60);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleInput = (val: string, setter: (v: string) => void, suggSetter: (s: WordPoint[]) => void) => {
    setter(val);
    suggSetter(val.length < 1 ? [] : wordData.filter(w => w.word.toLowerCase().startsWith(val.toLowerCase())).slice(0, 6));
  };

  const pickSugg = (w: WordPoint, setter: (v: string) => void, suggSetter: (s: WordPoint[]) => void) => {
    setter(w.word); suggSetter([]);
  };

  const applyPreset = (p: typeof PRESETS[0]) => {
    setWordA(p.a); setWordB(p.b); setWordC(p.c);
    setSuggestionsA([]); setSuggestionsB([]); setSuggestionsC([]);
  };

  const handleReset = () => {
    setWordA("King"); setWordB("Man"); setWordC("Woman");
    setSuggestionsA([]); setSuggestionsB([]); setSuggestionsC([]);
    autoRotRef.current = true;
    if (cameraRef.current && orbitRef.current) {
      cameraRef.current.position.set(0, 5, 52);
      orbitRef.current.target.set(0, 0, 0);
      orbitRef.current.autoRotate = true;
      orbitRef.current.update();
    }
  };

  const handleSolve = () => {
    if (!resultWord || isFlying) return;
    flyTriggerRef.current?.(resultWord);
  };

  // ── Panel JSX ───────────────────────────────────────────────────────────────
  const sidePanel = (
    <div className="space-y-4">
      {/* Cluster legend */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 dark:text-neutral-500 font-semibold mb-2">
          Word Clusters
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {CLUSTERS.map(c => (
            <div key={c.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="text-[11px] text-neutral-600 dark:text-neutral-400">{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">Analogy</p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-0.5 leading-relaxed">
            Words are coordinates. Subtract the direction <em>B</em> encoded, add <em>C</em>, and you land near a new word.
          </p>
        </div>

        {/* Preset buttons */}
        <div className="space-y-2">
          {PRESETS.map((p, i) => {
            const active = wordA === p.a && wordB === p.b && wordC === p.c;
            return (
              <button
                key={i}
                onClick={() => applyPreset(p)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  active
                    ? "bg-emerald-500/10 border-emerald-500/40 dark:border-emerald-500/25"
                    : "bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  <span className="text-amber-500">{p.a}</span>
                  <span className="text-neutral-400 mx-1">−</span>
                  <span className="text-neutral-500">{p.b}</span>
                  <span className="text-neutral-400 mx-1">+</span>
                  <span className="text-sky-500">{p.c}</span>
                  <span className="text-neutral-400 mx-1">=</span>
                  <span className={active ? "text-emerald-500 dark:text-emerald-400" : "text-neutral-400"}>
                    {p.result}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5">{p.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result box */}
      <div className="bg-neutral-50 dark:bg-[#09090d] border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-center flex-wrap gap-1.5 font-mono text-sm font-bold">
          <span className={selectedA ? "text-amber-500" : "text-neutral-300 dark:text-neutral-700"}>
            {selectedA?.word ?? "?"}
          </span>
          <span className="text-neutral-400">−</span>
          <span className={selectedB ? "text-neutral-600 dark:text-neutral-400" : "text-neutral-300 dark:text-neutral-700"}>
            {selectedB?.word ?? "?"}
          </span>
          <span className="text-neutral-400">+</span>
          <span className={selectedC ? "text-sky-500" : "text-neutral-300 dark:text-neutral-700"}>
            {selectedC?.word ?? "?"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              resultWord
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "text-neutral-300 dark:text-neutral-700"
            }`}
          >
            {resultWord?.word ?? "?"}
          </span>
        </div>

        {resultSim !== null && resultWord && (
          <div className="flex items-center justify-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.max(0, resultSim)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              {resultSim}% match
            </span>
          </div>
        )}

        {solved && resultWord && (
          <p className="text-center text-[10px] text-emerald-600 dark:text-emerald-400">
            Camera flew to <span className="font-mono font-bold">{resultWord.word}</span>
          </p>
        )}

        <Btn
          primary
          disabled={!resultWord || isFlying}
          onClick={handleSolve}
          className="w-full text-xs py-2.5 flex items-center justify-center gap-1.5"
        >
          {isFlying ? "Flying to result..." : "Fly to result in 3D"}
        </Btn>
      </div>

      {/* Custom word inputs */}
      <div>
        <button
          onClick={() => setShowCustom(v => !v)}
          className="text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center gap-1.5 transition-colors"
        >
          {showCustom ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
          {showCustom ? "Hide" : "Try your own words"}
        </button>

        {showCustom && (
          <div className="mt-3 space-y-3">
            {[
              { label: "A", color: "text-amber-500", val: wordA, set: setWordA, sugg: suggestionsA, setSugg: setSuggestionsA },
              { label: "B  (subtract)", color: "text-neutral-500", val: wordB, set: setWordB, sugg: suggestionsB, setSugg: setSuggestionsB },
              { label: "C  (add)", color: "text-sky-500", val: wordC, set: setWordC, sugg: suggestionsC, setSugg: setSuggestionsC },
            ].map((f, i) => (
              <div key={i} className="relative">
                <label className={`text-[10px] font-bold uppercase tracking-wide block mb-1 ${f.color}`}>{f.label}</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-neutral-400" />
                  <input
                    type="text"
                    value={f.val}
                    onChange={e => handleInput(e.target.value, f.set, f.setSugg)}
                    className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg pl-8 pr-3 py-2 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    placeholder="Type a word..."
                  />
                </div>
                {f.sugg.length > 0 && (
                  <ul className="absolute z-30 w-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden shadow-xl">
                    {f.sugg.map(w => (
                      <li
                        key={w.word}
                        onClick={() => pickSugg(w, f.set, f.setSugg)}
                        className="px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer flex justify-between"
                      >
                        <span>{w.word}</span>
                        <span className="text-[9px] text-neutral-400">{w.cluster}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
              {wordData.length} words across {CLUSTERS.length} clusters
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div
        ref={containerRef}
        className={isFullscreen ? "fixed inset-0 z-50 flex flex-col bg-neutral-50 dark:bg-[#07070a]" : "lg:col-span-2"}
      >
        <Panel className={`relative p-0 overflow-hidden bg-white dark:bg-[#07070a] ${isFullscreen ? "flex-1" : ""}`}>
          {/* HUD */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-start justify-between pointer-events-none">
            <div className="flex flex-wrap gap-1.5 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                Semantic Space
              </div>
              <button
                onClick={() => setIsFullscreen(v => !v)}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIs3DMode(v => !v)}
                className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {is3DMode ? "2D" : "3D"}
              </button>
              <button
                onClick={handleReset}
                title="Reset view"
                className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[9px] font-mono text-neutral-500 bg-neutral-100/80 dark:bg-neutral-950/80 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 shadow pointer-events-none">
              Drag · Scroll
            </span>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full block cursor-grab active:cursor-grabbing select-none"
            style={{ height: isFullscreen ? "100vh" : "460px" }}
          />

          {/* Overlay label elements */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden font-mono text-[10px]">
            <div ref={hoverLabelRef} className="absolute pointer-events-none" style={{ display: "none" }} />

            {/* A / −B / +C / Result pinned labels */}
            <div ref={labelARef} className="absolute pointer-events-none px-2 py-1 bg-amber-500/90 text-white rounded border border-amber-400 font-bold shadow-lg shadow-amber-500/20" style={{ display: "none" }} />
            <div ref={labelBRef} className="absolute pointer-events-none px-2 py-1 bg-neutral-700/90 text-neutral-100 rounded border border-neutral-500 font-bold shadow" style={{ display: "none" }} />
            <div ref={labelCRef} className="absolute pointer-events-none px-2 py-1 bg-sky-500/90 text-white rounded border border-sky-400 font-bold shadow-lg shadow-sky-500/20" style={{ display: "none" }} />
            <div ref={labelResultRef} className="absolute pointer-events-none px-2.5 py-1.5 bg-emerald-500/95 text-white rounded border-2 border-emerald-300 font-bold shadow-lg shadow-emerald-500/30 text-[10px]" style={{ display: "none" }} />

            {/* Floating cluster name labels — projected from 3D centroids */}
            {CLUSTERS.map((c, i) => (
              <div
                key={c.name}
                ref={el => { clusterDivsRef.current[i] = el; }}
                className="absolute pointer-events-none text-[9px] font-bold uppercase tracking-widest whitespace-nowrap"
                style={{ display: "none", color: c.color, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}
              >
                {c.name}
              </div>
            ))}
          </div>

          {isFlying && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full border border-cyan-500/30 animate-pulse">
                Flying to result...
              </div>
            </div>
          )}

          {/* Floating controls panel in fullscreen mode */}
          {isFullscreen && (
            <div className="absolute top-14 right-4 z-20 w-72 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto pointer-events-auto">
              {sidePanel}
            </div>
          )}
        </Panel>
      </div>

      {!isFullscreen && (
        <Panel className="border-neutral-200 dark:border-neutral-800 p-4">
          {sidePanel}
        </Panel>
      )}
    </div>
  );
}
