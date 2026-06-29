"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Panel, Btn, Field, NumberInput, Select } from "@/components/tools/shared/ui";
import { Maximize2, Minimize2, Layers, Activity } from "lucide-react";

type Activation = "ReLU" | "Sigmoid" | "Tanh" | "Linear";

interface ArchLayer {
  name: string;
  neurons: number;
  activation: Activation;
}

interface EdgeMeshInfo {
  mesh: THREE.LineSegments;
  material: THREE.ShaderMaterial;
  layerAIndex: number;
  neuronsA: number;
  neuronsB: number;
  vertsPerEdge: number;
  highlightAttr: THREE.BufferAttribute;
}

const ACT_CYCLE: Activation[] = ["ReLU", "Sigmoid", "Tanh", "Linear"];
const ACT_COLOR: Record<Activation, string> = {
  ReLU: "#06b6d4",
  Sigmoid: "#f59e0b",
  Tanh: "#a855f7",
  Linear: "#94a3b8",
};

const PRESETS: Record<string, ArchLayer[]> = {
  "Simple Classifier": [
    { name: "Input", neurons: 4, activation: "Linear" },
    { name: "HL 1", neurons: 6, activation: "ReLU" },
    { name: "HL 2", neurons: 6, activation: "ReLU" },
    { name: "Output", neurons: 3, activation: "Sigmoid" },
  ],
  "Deep MLP": [
    { name: "Input", neurons: 8, activation: "Linear" },
    { name: "HL 1", neurons: 12, activation: "ReLU" },
    { name: "HL 2", neurons: 12, activation: "ReLU" },
    { name: "HL 3", neurons: 12, activation: "ReLU" },
    { name: "HL 4", neurons: 12, activation: "ReLU" },
    { name: "Output", neurons: 4, activation: "Sigmoid" },
  ],
  "Game-Agent Brain": [
    { name: "Input", neurons: 18, activation: "Linear" },
    { name: "HL 1", neurons: 24, activation: "ReLU" },
    { name: "HL 2", neurons: 20, activation: "ReLU" },
    { name: "HL 3", neurons: 20, activation: "ReLU" },
    { name: "HL 4", neurons: 18, activation: "ReLU" },
    { name: "HL 5", neurons: 18, activation: "ReLU" },
    { name: "HL 6", neurons: 16, activation: "ReLU" },
    { name: "HL 7", neurons: 16, activation: "ReLU" },
    { name: "HL 8", neurons: 14, activation: "ReLU" },
    { name: "HL 9", neurons: 14, activation: "ReLU" },
    { name: "HL 10", neurons: 12, activation: "ReLU" },
    { name: "Output", neurons: 6, activation: "Sigmoid" },
  ],
};

const MAX_NEURONS_PER_LAYER = 64;
const MAX_LAYERS = 14;
const EDGE_WARNING_THRESHOLD = 30000;

// Layout — neurons live inside a fixed-height "slab" frame, so the dot column
// can never overflow; spacing just tightens as neuron count grows.
const X_STEP = 2.4;
const SLAB_HALF_H = 1.5; // vertical half-extent of the dot column
const SLAB_HW = 0.36; // slab half width
const SLAB_TOP = SLAB_HALF_H + 0.32;
const SLAB_BOTTOM = -SLAB_HALF_H - 0.28;
const NEURON_R = 0.055;
const CURVE_DEPTH = 1.05; // how far ropes bow out in Z (builds the woven "lens")
const NEURON_LABEL_LIMIT = 40; // only annotate individual dots up to this many

// Theme-dependent render parameters. The woven look is additive glow on dark;
// on light we switch to normal blending with denser strokes so the ropes stay
// readable against a pale backdrop instead of washing out to grey.
const THEME = {
  dark: {
    bg: "#06060f",
    blending: THREE.AdditiveBlending,
    baseScale: 0.62,
    dimAlpha: 0.035,
    highlight: new THREE.Color(1, 1, 1),
    slab: new THREE.Color("#ffffff"),
    slabOpacity: 0.42,
    // hot white-cored glow travelling along the rope
    pulseWhite: new THREE.Color(1.0, 1.0, 1.0),
    pulseSat: 0.3,
    pulseAlpha: 0.7,
    // neuron-dot palette
    neuronRestTarget: new THREE.Color("#ffffff"),
    neuronRest: 0.18, // resting dots glow a touch brighter than their activation hue
    neuronDim: new THREE.Color("#070712"),
    neuronDimAmt: 0.85,
    neuronHotColor: new THREE.Color("#ffffff"),
  },
  light: {
    bg: "#f4f6fb",
    blending: THREE.NormalBlending,
    baseScale: 0.9,
    dimAlpha: 0.05,
    highlight: new THREE.Color("#0b1220"),
    slab: new THREE.Color("#94a3b8"),
    slabOpacity: 0.85,
    // on white we boost the rope's own colour into a vivid moving bead
    pulseWhite: new THREE.Color(0, 0, 0),
    pulseSat: 0.95,
    pulseAlpha: 0.7,
    neuronRestTarget: new THREE.Color("#0b1220"),
    neuronRest: 0.1,
    neuronDim: new THREE.Color("#cbd5e1"),
    neuronDimAmt: 0.8,
    neuronHotColor: new THREE.Color("#0b1220"),
  },
} as const;

const FLOW_SPEED = 0.32;

// Rope colours — vivid enough to stay distinct under additive glow on dark.
const POS_COLOR = new THREE.Color("#2ee06b");
const NEG_COLOR = new THREE.Color("#ff4d6d");

function pseudo(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // 0..1
}
function pseudoSigned(seed: number) {
  return pseudo(seed) * 2 - 1; // -1..1
}

function shortName(n: string) {
  if (/^hl/i.test(n)) return "H" + n.replace(/\D/g, "");
  return n.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "L";
}

function roundedRectLoop(hw: number, top: number, bottom: number, r: number) {
  const pts: number[] = [];
  const seg = 5;
  const arc = (cx: number, cy: number, start: number, end: number) => {
    for (let k = 0; k <= seg; k++) {
      const a = start + ((end - start) * k) / seg;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0);
    }
  };
  arc(hw - r, top - r, 0, Math.PI / 2);
  arc(-hw + r, top - r, Math.PI / 2, Math.PI);
  arc(-hw + r, bottom + r, Math.PI, Math.PI * 1.5);
  arc(hw - r, bottom + r, Math.PI * 1.5, Math.PI * 2);
  pts.push(pts[0], pts[1], pts[2]); // close
  return new Float32Array(pts);
}

const VERT_SHADER = `
  attribute vec3 aColor;
  attribute float aWeight;
  attribute float aHighlight;
  attribute float aT;
  varying vec3 vColor;
  varying float vWeight;
  varying float vHighlight;
  varying float vT;
  void main() {
    vColor = aColor;
    vWeight = aWeight;
    vHighlight = aHighlight;
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_SHADER = `
  varying vec3 vColor;
  varying float vWeight;
  varying float vHighlight;
  varying float vT;
  uniform float uHoverActive;
  uniform float uBaseScale;
  uniform float uDimAlpha;
  uniform vec3 uHighlightColor;
  // Flowing-signal uniforms
  uniform float uTime;
  uniform float uFlow;
  uniform float uSpeed;
  uniform float uPulseCount;
  uniform vec3 uPulseWhite;
  uniform float uPulseSat;
  uniform float uPulseAlpha;
  void main() {
    float baseAlpha = clamp(abs(vWeight), 0.08, 1.0) * uBaseScale;
    vec3 finalColor = mix(vColor, uHighlightColor, vHighlight);
    float alpha = mix(baseAlpha, 0.97, vHighlight);
    if (uHoverActive > 0.5) {
      alpha *= mix(uDimAlpha, 1.0, vHighlight);
    }

    // Travelling light pulses move along +X (input -> output) so the network
    // reads as alive: a band of brightness sweeps each connection in turn.
    float ph = fract(vT * uPulseCount - uTime * uSpeed);
    float pulse = exp(-pow((ph - 0.5) * 7.0, 2.0)) * uFlow;
    // brighter when the connection is highlighted/active, fainter on dim ones
    pulse *= mix(0.55, 1.0, clamp(abs(vWeight), 0.0, 1.0));
    if (uHoverActive > 0.5) pulse *= mix(0.15, 1.0, vHighlight);
    finalColor += pulse * (uPulseWhite + vColor * uPulseSat);
    alpha = clamp(alpha + pulse * uPulseAlpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export default function NeuralNetworkArchitectureView({
  dark,
  isFullscreen,
  onToggleFullscreen,
}: {
  dark: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const neuronLabelRefs = useRef<(HTMLDivElement | null)[]>([]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const layerMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const edgeMeshesRef = useRef<EdgeMeshInfo[]>([]);
  const slabLinesRef = useRef<THREE.LineLoop[]>([]);
  const neuronBaseColorsRef = useRef<THREE.Color[]>([]);
  const positionsRef = useRef<THREE.Vector3[][]>([]);
  const headerPositionsRef = useRef<THREE.Vector3[]>([]);
  const hoveredNeuronRef = useRef<{ layer: number; neuron: number } | null>(null);
  const hoveredLayerRef = useRef<number | null>(null);
  const focusedLayerRef = useRef<number | null>(null);
  const darkRef = useRef(dark);
  const clockRef = useRef(0);
  const flowRef = useRef(true);

  const [presetName, setPresetName] = useState("Simple Classifier");
  const [archConfig, setArchConfig] = useState<ArchLayer[]>(PRESETS["Simple Classifier"]);
  const [hoverInfo, setHoverInfo] = useState<{ layer: number; neuron: number } | null>(null);
  const [focusedLayer, setFocusedLayer] = useState<number | null>(null);
  const [edgeCount, setEdgeCount] = useState(0);
  const [flowOn, setFlowOn] = useState(true);

  const setFocus = useCallback((v: number | null) => {
    focusedLayerRef.current = v;
    setFocusedLayer(v);
  }, []);

  // Recolour the neuron dots based on the current hover/focus state: the
  // hovered dot goes hot-white, dots in directly-connected layers brighten,
  // and everything else fades back so the active path stands out.
  const recolorNeurons = useCallback(() => {
    const t = darkRef.current ? THEME.dark : THEME.light;
    const meshes = layerMeshesRef.current;
    const bases = neuronBaseColorsRef.current;
    if (!meshes.length || !bases.length) return;
    const hv = hoveredNeuronRef.current;
    const fl = hoveredLayerRef.current;
    const tmp = new THREE.Color();
    meshes.forEach((mesh, li) => {
      const base = bases[li];
      if (!base) return;
      for (let j = 0; j < mesh.count; j++) {
        if (hv) {
          if (li === hv.layer && j === hv.neuron) tmp.copy(t.neuronHotColor);
          else if (li === hv.layer - 1 || li === hv.layer + 1) tmp.copy(base).lerp(t.highlight, 0.55);
          else tmp.copy(base).lerp(t.neuronDim, t.neuronDimAmt);
        } else if (fl !== null) {
          if (li === fl) tmp.copy(base).lerp(t.highlight, 0.5);
          else if (li === fl - 1 || li === fl + 1) tmp.copy(base).lerp(t.highlight, 0.3);
          else tmp.copy(base).lerp(t.neuronDim, t.neuronDimAmt);
        } else {
          tmp.copy(base).lerp(t.neuronRestTarget, t.neuronRest);
        }
        mesh.setColorAt(j, tmp);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, []);

  const applyTheme = useCallback(() => {
    const t = darkRef.current ? THEME.dark : THEME.light;
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(t.bg);
    edgeMeshesRef.current.forEach((e) => {
      e.material.blending = t.blending;
      e.material.uniforms.uBaseScale.value = t.baseScale;
      e.material.uniforms.uDimAlpha.value = t.dimAlpha;
      (e.material.uniforms.uHighlightColor.value as THREE.Color).copy(t.highlight);
      (e.material.uniforms.uPulseWhite.value as THREE.Color).copy(t.pulseWhite);
      e.material.uniforms.uPulseSat.value = t.pulseSat;
      e.material.uniforms.uPulseAlpha.value = t.pulseAlpha;
      e.material.needsUpdate = true;
    });
    slabLinesRef.current.forEach((l) => {
      const m = l.material as THREE.LineBasicMaterial;
      m.color.copy(t.slab);
      m.opacity = t.slabOpacity;
    });
    recolorNeurons();
  }, [recolorNeurons]);

  const disposeScene = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    layerMeshesRef.current.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      group.remove(m);
    });
    edgeMeshesRef.current.forEach((e) => {
      e.mesh.geometry.dispose();
      e.material.dispose();
      group.remove(e.mesh);
    });
    slabLinesRef.current.forEach((l) => {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
      group.remove(l);
    });
    layerMeshesRef.current = [];
    edgeMeshesRef.current = [];
    slabLinesRef.current = [];
  }, []);

  const buildScene = useCallback(
    (config: ArchLayer[]) => {
      const group = groupRef.current;
      const camera = cameraRef.current;
      if (!group || !camera) return;

      disposeScene();
      hoveredNeuronRef.current = null;
      hoveredLayerRef.current = null;
      setHoverInfo(null);
      setFocus(null);

      const t = darkRef.current ? THEME.dark : THEME.light;
      const numLayers = config.length;
      const neuronGeo = new THREE.SphereGeometry(NEURON_R, 10, 10);

      const positions: THREE.Vector3[][] = [];
      const headerPositions: THREE.Vector3[] = [];
      const layerMeshes: THREE.InstancedMesh[] = [];
      const slabLines: THREE.LineLoop[] = [];
      const baseColors: THREE.Color[] = [];

      config.forEach((layer, i) => {
        const x = (i - (numLayers - 1) / 2) * X_STEP;
        const span = SLAB_HALF_H * 2;
        const ySpacing = layer.neurons > 1 ? span / (layer.neurons - 1) : 0;
        const y0 = layer.neurons > 1 ? -SLAB_HALF_H : 0;

        const mesh = new THREE.InstancedMesh(
          neuronGeo,
          new THREE.MeshBasicMaterial({ vertexColors: true }),
          layer.neurons,
        );
        mesh.userData.layerIndex = i;
        const color = new THREE.Color(ACT_COLOR[layer.activation]);
        baseColors.push(color.clone());
        const layerPositions: THREE.Vector3[] = [];
        const matrix = new THREE.Matrix4();
        for (let j = 0; j < layer.neurons; j++) {
          const y = y0 + j * ySpacing;
          matrix.makeTranslation(x, y, 0);
          mesh.setMatrixAt(j, matrix);
          mesh.setColorAt(j, color);
          layerPositions.push(new THREE.Vector3(x, y, 0));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        group.add(mesh);
        layerMeshes.push(mesh);
        positions.push(layerPositions);

        // Slab frame around the dot column.
        const slabGeo = new THREE.BufferGeometry();
        slabGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(roundedRectLoop(SLAB_HW, SLAB_TOP, SLAB_BOTTOM, 0.12), 3),
        );
        const slabMat = new THREE.LineBasicMaterial({
          color: t.slab.clone(),
          transparent: true,
          opacity: t.slabOpacity,
        });
        const slab = new THREE.LineLoop(slabGeo, slabMat);
        slab.position.x = x;
        group.add(slab);
        slabLines.push(slab);

        headerPositions.push(new THREE.Vector3(x, SLAB_TOP, 0));
      });

      const edgeMeshes: EdgeMeshInfo[] = [];
      let totalEdges = 0;
      const xMin = -((numLayers - 1) / 2) * X_STEP;
      const xRange = Math.max((numLayers - 1) * X_STEP, 1e-4);
      const cA = new THREE.Vector3();
      const cB = new THREE.Vector3();
      const p = new THREE.Vector3();
      const prev = new THREE.Vector3();

      for (let i = 0; i < numLayers - 1; i++) {
        const nA = config[i].neurons;
        const nB = config[i + 1].neurons;
        const edgeN = nA * nB;
        totalEdges += edgeN;

        // Adaptive rope resolution — keep vertex budget bounded for dense nets.
        const POINTS = edgeN > 6000 ? 5 : edgeN > 2000 ? 8 : edgeN > 600 ? 11 : 16;
        const segs = POINTS - 1;
        const vertsPerEdge = segs * 2;

        const posArr = new Float32Array(edgeN * vertsPerEdge * 3);
        const colorArr = new Float32Array(edgeN * vertsPerEdge * 3);
        const weightArr = new Float32Array(edgeN * vertsPerEdge);
        const highlightArr = new Float32Array(edgeN * vertsPerEdge);
        const tArr = new Float32Array(edgeN * vertsPerEdge);

        let vbase = 0;
        for (let ai = 0; ai < nA; ai++) {
          const pA = positions[i][ai];
          for (let bi = 0; bi < nB; bi++) {
            const pB = positions[i + 1][bi];
            const seed = i * 1e7 + ai * 1e4 + bi;
            const w = pseudoSigned(seed);
            const c = w >= 0 ? POS_COLOR : NEG_COLOR;

            // Rope curve: cubic bezier with a gravity sag (−Y) and a per-edge
            // Z bow so the bundle fans into a woven volumetric lens.
            const dy = pB.y - pA.y;
            const zBow = pseudoSigned(seed * 1.7 + 3.1) * CURVE_DEPTH;
            const zBow2 = pseudoSigned(seed * 2.3 + 7.7) * CURVE_DEPTH * 0.6;
            const sag = -(0.18 + 0.22 * Math.abs(dy)) * (0.6 + pseudo(seed * 0.9));
            cA.set(
              pA.x + (pB.x - pA.x) * 0.33,
              pA.y + dy * 0.33 + sag,
              zBow,
            );
            cB.set(
              pA.x + (pB.x - pA.x) * 0.66,
              pA.y + dy * 0.66 + sag,
              zBow2,
            );

            let seg = 0;
            for (let s = 0; s < POINTS; s++) {
              const tt = s / segs;
              const u = 1 - tt;
              // cubic bezier(pA, cA, cB, pB)
              p.set(
                u * u * u * pA.x + 3 * u * u * tt * cA.x + 3 * u * tt * tt * cB.x + tt * tt * tt * pB.x,
                u * u * u * pA.y + 3 * u * u * tt * cA.y + 3 * u * tt * tt * cB.y + tt * tt * tt * pB.y,
                u * u * u * pA.z + 3 * u * u * tt * cA.z + 3 * u * tt * tt * cB.z + tt * tt * tt * pB.z,
              );
              if (s > 0) {
                // segment prev -> p  (two verts)
                const vi = (vbase + seg * 2) * 3;
                posArr[vi] = prev.x; posArr[vi + 1] = prev.y; posArr[vi + 2] = prev.z;
                posArr[vi + 3] = p.x; posArr[vi + 4] = p.y; posArr[vi + 5] = p.z;
                colorArr[vi] = c.r; colorArr[vi + 1] = c.g; colorArr[vi + 2] = c.b;
                colorArr[vi + 3] = c.r; colorArr[vi + 4] = c.g; colorArr[vi + 5] = c.b;
                const wi = vbase + seg * 2;
                weightArr[wi] = w; weightArr[wi + 1] = w;
                tArr[wi] = (prev.x - xMin) / xRange;
                tArr[wi + 1] = (p.x - xMin) / xRange;
                seg++;
              }
              prev.copy(p);
            }
            vbase += vertsPerEdge;
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
        geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colorArr, 3));
        geo.setAttribute("aWeight", new THREE.Float32BufferAttribute(weightArr, 1));
        geo.setAttribute("aT", new THREE.Float32BufferAttribute(tArr, 1));
        const highlightAttr = new THREE.Float32BufferAttribute(highlightArr, 1);
        geo.setAttribute("aHighlight", highlightAttr);

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uHoverActive: { value: 0 },
            uBaseScale: { value: t.baseScale },
            uDimAlpha: { value: t.dimAlpha },
            uHighlightColor: { value: t.highlight.clone() },
            uTime: { value: 0 },
            uFlow: { value: flowRef.current ? 1 : 0 },
            uSpeed: { value: FLOW_SPEED },
            uPulseCount: { value: Math.max(numLayers - 1, 1) },
            uPulseWhite: { value: t.pulseWhite.clone() },
            uPulseSat: { value: t.pulseSat },
            uPulseAlpha: { value: t.pulseAlpha },
          },
          vertexShader: VERT_SHADER,
          fragmentShader: FRAG_SHADER,
          transparent: true,
          depthWrite: false,
          blending: t.blending,
        });

        const lines = new THREE.LineSegments(geo, material);
        group.add(lines);
        edgeMeshes.push({
          mesh: lines,
          material,
          layerAIndex: i,
          neuronsA: nA,
          neuronsB: nB,
          vertsPerEdge,
          highlightAttr,
        });
      }

      layerMeshesRef.current = layerMeshes;
      edgeMeshesRef.current = edgeMeshes;
      slabLinesRef.current = slabLines;
      neuronBaseColorsRef.current = baseColors;
      positionsRef.current = positions;
      headerPositionsRef.current = headerPositions;
      recolorNeurons();
      setEdgeCount(totalEdges);

      const totalWidth = (numLayers - 1) * X_STEP;
      const fitDist = Math.max(totalWidth * 0.72, SLAB_TOP * 2.4) + 3.6;
      camera.position.set(0, 0.2, fitDist);
      camera.lookAt(0, 0, 0);
      controlsRef.current?.target.set(0, 0, 0);
    },
    [disposeScene, setFocus, recolorNeurons],
  );

  const clearHover = useCallback(() => {
    if (!hoveredNeuronRef.current && hoveredLayerRef.current === null && focusedLayerRef.current === null) return;
    edgeMeshesRef.current.forEach((e) => {
      (e.highlightAttr.array as Float32Array).fill(0);
      e.highlightAttr.needsUpdate = true;
      e.material.uniforms.uHoverActive.value = 0;
    });
    hoveredNeuronRef.current = null;
    hoveredLayerRef.current = null;
    recolorNeurons();
    setHoverInfo(null);
    setFocus(null);
  }, [setFocus, recolorNeurons]);

  const applyHover = useCallback((layerIdx: number, neuronIdx: number) => {
    const cur = hoveredNeuronRef.current;
    if (cur && cur.layer === layerIdx && cur.neuron === neuronIdx) return;
    hoveredNeuronRef.current = { layer: layerIdx, neuron: neuronIdx };
    hoveredLayerRef.current = null;

    edgeMeshesRef.current.forEach((e) => {
      const arr = e.highlightAttr.array as Float32Array;
      arr.fill(0);
      const vpe = e.vertsPerEdge;
      if (e.layerAIndex === layerIdx - 1) {
        for (let a = 0; a < e.neuronsA; a++) {
          const base = (a * e.neuronsB + neuronIdx) * vpe;
          for (let k = 0; k < vpe; k++) arr[base + k] = 1;
        }
      }
      if (e.layerAIndex === layerIdx) {
        for (let b = 0; b < e.neuronsB; b++) {
          const base = (neuronIdx * e.neuronsB + b) * vpe;
          for (let k = 0; k < vpe; k++) arr[base + k] = 1;
        }
      }
      e.highlightAttr.needsUpdate = true;
      e.material.uniforms.uHoverActive.value = 1;
    });
    recolorNeurons();
    setHoverInfo({ layer: layerIdx, neuron: neuronIdx });
    setFocus(layerIdx);
  }, [setFocus, recolorNeurons]);

  const applyLayerHover = useCallback((layerIdx: number) => {
    if (hoveredLayerRef.current === layerIdx) return;
    hoveredNeuronRef.current = null;
    hoveredLayerRef.current = layerIdx;
    edgeMeshesRef.current.forEach((e) => {
      const arr = e.highlightAttr.array as Float32Array;
      const involved = e.layerAIndex === layerIdx - 1 || e.layerAIndex === layerIdx;
      arr.fill(involved ? 1 : 0);
      e.highlightAttr.needsUpdate = true;
      e.material.uniforms.uHoverActive.value = 1;
    });
    recolorNeurons();
    setHoverInfo(null);
    setFocus(layerIdx);
  }, [setFocus, recolorNeurons]);

  const updateLabelPositions = useCallback(() => {
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!camera || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const v = new THREE.Vector3();

    headerPositionsRef.current.forEach((pos, i) => {
      const el = labelRefs.current[i];
      if (!el) return;
      v.copy(pos).project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      el.style.display = v.z > 1 ? "none" : "block";
    });

    const fl = focusedLayerRef.current;
    if (fl !== null && positionsRef.current[fl]) {
      const col = positionsRef.current[fl];
      col.forEach((pos, j) => {
        const el = neuronLabelRefs.current[j];
        if (!el) return;
        v.copy(pos).project(camera);
        el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(10px, -50%)`;
        el.style.display = v.z > 1 ? "none" : "block";
      });
    }
  }, []);

  // Core WebGL init — runs once
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect0 = canvasRef.current.getBoundingClientRect();
    const width = Math.round(rect0.width) || 640;
    const height = Math.round(rect0.height) || 440;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color((darkRef.current ? THEME.dark : THEME.light).bg);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 0, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height, false); // don't overwrite the canvas CSS box
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.1 };
    const ndc = new THREE.Vector2();

    const handlePointerMove = (e: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(layerMeshesRef.current, false);
      if (hits.length > 0 && hits[0].instanceId !== undefined) {
        const mesh = hits[0].object as THREE.InstancedMesh;
        applyHover(mesh.userData.layerIndex as number, hits[0].instanceId as number);
      } else if (hoveredNeuronRef.current) {
        clearHover();
      }
    };
    const handlePointerLeave = () => clearHover();

    canvasRef.current.addEventListener("pointermove", handlePointerMove);
    canvasRef.current.addEventListener("pointerleave", handlePointerLeave);

    let animId = 0;
    let last = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clockRef.current += dt;
      if (flowRef.current) {
        const time = clockRef.current;
        edgeMeshesRef.current.forEach((e) => {
          e.material.uniforms.uTime.value = time;
        });
      }
      controls.update();
      updateLabelPositions();
      renderer.render(scene, camera);
    };
    requestAnimationFrame(animate);

    const handleResize = () => {
      if (!canvasRef.current || !rendererRef.current || !cameraRef.current) return;
      // Measure the canvas's own CSS-laid-out box (driven by w-full + the
      // 440px / fullscreen height), NOT the container — reading the container
      // and letting setSize rewrite the canvas style created a feedback loop
      // that ballooned the buffer to a tall, squished aspect.
      const rect = canvasRef.current.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === 0 || h === 0) return; // skip while the view is hidden
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false); // false = don't touch canvas CSS
    };
    window.addEventListener("resize", handleResize);
    // Fires when the tab becomes visible (display:none -> block) so the canvas
    // sizes correctly even though it mounts hidden behind the manifold view.
    const ro = new ResizeObserver(handleResize);
    ro.observe(canvasRef.current);
    const resizeTimer = setTimeout(handleResize, 60);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      canvasRef.current?.removeEventListener("pointermove", handlePointerMove);
      canvasRef.current?.removeEventListener("pointerleave", handlePointerLeave);
      disposeScene();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize when fullscreen toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!canvasRef.current || !rendererRef.current || !cameraRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Theme changes: recolour without rebuilding geometry (keeps camera framing).
  useEffect(() => {
    darkRef.current = dark;
    applyTheme();
  }, [dark, applyTheme]);

  // Signal-flow toggle
  useEffect(() => {
    flowRef.current = flowOn;
    edgeMeshesRef.current.forEach((e) => {
      e.material.uniforms.uFlow.value = flowOn ? 1 : 0;
    });
  }, [flowOn]);

  // Rebuild geometry whenever the architecture config changes (including initial mount)
  useEffect(() => {
    buildScene(archConfig);
  }, [archConfig, buildScene]);

  const updateLayerNeurons = (i: number, v: number) => {
    const clamped = Math.max(1, Math.min(MAX_NEURONS_PER_LAYER, Math.round(v) || 1));
    setArchConfig((prev) => prev.map((l, idx) => (idx === i ? { ...l, neurons: clamped } : l)));
  };
  const updateLayerActivation = (i: number, act: Activation) => {
    setArchConfig((prev) => prev.map((l, idx) => (idx === i ? { ...l, activation: act } : l)));
  };
  const removeLayer = (i: number) => {
    setArchConfig((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  };
  const addLayer = () => {
    setArchConfig((prev) => {
      if (prev.length >= MAX_LAYERS) return prev;
      const insertIdx = prev.length - 1;
      const newLayer: ArchLayer = { name: `HL ${prev.length - 1}`, neurons: 8, activation: "ReLU" };
      return [...prev.slice(0, insertIdx), newLayer, ...prev.slice(insertIdx)];
    });
  };
  const cycleActivation = (i: number) => {
    setArchConfig((prev) => {
      const next = [...prev];
      const cur = next[i].activation;
      const nextAct = ACT_CYCLE[(ACT_CYCLE.indexOf(cur) + 1) % ACT_CYCLE.length];
      next[i] = { ...next[i], activation: nextAct };
      return next;
    });
  };

  const renderConfigPanel = () => (
    <>
      <Field label="Preset" value={presetName}>
        <Select
          label=""
          value={presetName}
          onChange={(v) => {
            setPresetName(v);
            setArchConfig(PRESETS[v]);
          }}
          options={Object.keys(PRESETS).map((k) => ({ label: k, value: k }))}
        />
      </Field>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {archConfig.map((layer, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-12 shrink-0 truncate text-neutral-500 dark:text-neutral-400">{layer.name}</span>
            <div className="w-20 shrink-0">
              <NumberInput label="" value={layer.neurons} min={1} max={MAX_NEURONS_PER_LAYER} step={1} onChange={(v) => updateLayerNeurons(i, v)} />
            </div>
            <div className="flex-1">
              <Select
                label=""
                value={layer.activation}
                onChange={(v) => updateLayerActivation(i, v as Activation)}
                options={ACT_CYCLE.map((a) => ({ label: a, value: a }))}
              />
            </div>
            <button
              onClick={() => removeLayer(i)}
              disabled={archConfig.length <= 2}
              className="text-neutral-400 hover:text-red-500 disabled:opacity-30 disabled:pointer-events-none px-1"
              aria-label="Remove layer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <Btn onClick={addLayer} disabled={archConfig.length >= MAX_LAYERS} className="text-xs">
        + Add Layer
      </Btn>

      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
        Total connections: {edgeCount.toLocaleString()}
      </div>
      {edgeCount > EDGE_WARNING_THRESHOLD && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400">
          High connection count may slow down low-end devices — consider reducing neurons per layer.
        </div>
      )}
    </>
  );

  const focusedNeurons = focusedLayer !== null ? archConfig[focusedLayer]?.neurons ?? 0 : 0;
  const showNeuronLabels = focusedLayer !== null && focusedNeurons <= NEURON_LABEL_LIMIT;

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div
        ref={containerRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#05050a] p-4 flex flex-col h-screen"
            : "lg:col-span-2 space-y-4"
        }
      >
        <Panel
          className={`relative p-0 overflow-hidden bg-white dark:bg-[#05050a] border-neutral-200 dark:border-neutral-800 flex-1 flex flex-col ${isFullscreen ? "h-full" : ""}`}
        >
          <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-cyan-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-cyan-400 font-bold">
                  Network Architecture
                </h3>
              </div>
              <button
                onClick={onToggleFullscreen}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-500" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
              <button
                onClick={() => setFlowOn((v) => !v)}
                className={`backdrop-blur-md px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto ${
                  flowOn
                    ? "bg-cyan-500/15 border-cyan-400 dark:border-cyan-500/60 text-cyan-700 dark:text-cyan-300"
                    : "bg-white/90 dark:bg-neutral-900/90 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Signal Flow {flowOn ? "On" : "Off"}
              </button>
            </div>
            <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[10px] shadow-lg pointer-events-auto font-mono text-neutral-500 dark:text-neutral-400">
              Connections: <span className="text-neutral-800 dark:text-white font-bold">{edgeCount.toLocaleString()}</span>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full block select-none cursor-grab active:cursor-grabbing flex-1"
            style={{ height: isFullscreen ? "100%" : "440px" }}
          />

          {/* Slab header tabs — sit atop each layer's frame */}
          {archConfig.map((layer, i) => {
            const active = focusedLayer === i;
            return (
              <div
                key={i}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                onPointerEnter={() => applyLayerHover(i)}
                onPointerLeave={() => clearHover()}
                onClick={() => cycleActivation(i)}
                className={`absolute z-10 pointer-events-auto select-none cursor-pointer backdrop-blur-md rounded-t-md rounded-b-sm px-2 py-1 text-[10px] font-mono shadow-md whitespace-nowrap transition-colors border ${
                  active
                    ? "bg-cyan-50/95 dark:bg-cyan-950/80 border-cyan-400 dark:border-cyan-500/60"
                    : "bg-white/90 dark:bg-neutral-900/90 border-neutral-200 dark:border-neutral-700/80"
                }`}
                style={{ position: "absolute", left: 0, top: 0 }}
              >
                <div className="font-bold text-neutral-700 dark:text-neutral-100">{layer.name}</div>
                <div className="text-neutral-500 dark:text-neutral-400">Neurons: {layer.neurons}</div>
                <div style={{ color: ACT_COLOR[layer.activation] }} className="font-semibold">
                  {layer.activation} (click)
                </div>
              </div>
            );
          })}

          {/* Per-neuron labels — revealed for the focused layer only */}
          {showNeuronLabels &&
            Array.from({ length: focusedNeurons }).map((_, j) => (
              <div
                key={j}
                ref={(el) => {
                  neuronLabelRefs.current[j] = el;
                }}
                className="absolute z-10 pointer-events-none select-none text-[9px] font-mono text-neutral-500 dark:text-neutral-300/90 whitespace-nowrap"
                style={{ position: "absolute", left: 0, top: 0 }}
              >
                {shortName(archConfig[focusedLayer!].name)}.{j + 1}
              </div>
            ))}

          {hoverInfo && (
            <div className="absolute bottom-4 left-4 z-20 bg-neutral-900/90 text-white text-[10px] font-mono px-3 py-2 rounded-lg shadow-lg pointer-events-none">
              {archConfig[hoverInfo.layer]?.name} · neuron #{hoverInfo.neuron + 1}
            </div>
          )}

          {isFullscreen && (
            <div className="absolute top-4 right-4 z-30 w-80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 p-4 rounded-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pointer-events-auto">
              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">Architecture controls</span>
                <button onClick={onToggleFullscreen} className="text-[10px] text-cyan-500 hover:underline">
                  Exit FS
                </button>
              </div>
              {renderConfigPanel()}
            </div>
          )}
        </Panel>
      </div>

      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="space-y-4 border-neutral-200 dark:border-neutral-800">{renderConfigPanel()}</Panel>
        </div>
      )}
    </div>
  );
}
