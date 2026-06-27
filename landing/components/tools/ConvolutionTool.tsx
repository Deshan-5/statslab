"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Field, Panel, Btn , useRegisterToolState } from "@/components/tools/shared/ui";
import { Maximize2, Minimize2, BrainCircuit, RotateCcw, Settings } from "lucide-react";

const IMAGE_URL = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=80";

const PRESETS: Record<string, number[]> = {
  "Edge Detection": [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  "Sharpen": [0, -1, 0, -1, 5, -1, 0, -1, 0],
  "Box Blur": [0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111],
  "Emboss": [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  "Identity": [0, 0, 0, 0, 1, 0, 0, 0, 0]
};

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D tDiffuse;
uniform float uKernel[9];
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
    vec2 step = 1.0 / uResolution;
    vec3 color = vec3(0.0);
    int k = 0;
    
    // A standard 3x3 convolution loop
    for(int y = 1; y >= -1; y--) {
        for(int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) * step;
            vec3 texColor = texture2D(tDiffuse, vUv + offset).rgb;
            
            // Note: GLSL arrays must be indexed with constant expressions in WebGL1, 
            // but we can unroll or do this if we are careful. 
            // In WebGL1, dynamically indexing an array in a loop is often forbidden.
            // Let's manually unroll to be perfectly safe across all browsers.
            
            float weight = 0.0;
            if (k == 0) weight = uKernel[0];
            else if (k == 1) weight = uKernel[1];
            else if (k == 2) weight = uKernel[2];
            else if (k == 3) weight = uKernel[3];
            else if (k == 4) weight = uKernel[4];
            else if (k == 5) weight = uKernel[5];
            else if (k == 6) weight = uKernel[6];
            else if (k == 7) weight = uKernel[7];
            else if (k == 8) weight = uKernel[8];
            
            color += texColor * weight;
            k++;
        }
    }
    
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export default function ConvolutionTool() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [matrix, setMatrix] = useState<number[]>([...PRESETS["Edge Detection"]]);
  const [dark, setDark] = useState(false);
  
  // Refs for 3D objects we need to update
  const uniformsRef = useRef<{ uKernel: { value: number[] }, uResolution: { value: THREE.Vector2 }, tDiffuse: { value: THREE.Texture | null } }>({
    uKernel: { value: matrix },
    uResolution: { value: new THREE.Vector2(400, 400) },
    tDiffuse: { value: null }
  });
  
  const kernelGroupRef = useRef<THREE.Group | null>(null);
  const downBeamsRef = useRef<THREE.LineSegments | null>(null);
  const upBeamRef = useRef<THREE.Line | null>(null);

  useRegisterToolState("image-convolution", { matrix }, { matrix: setMatrix });
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(document.documentElement.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);

  // Update uniforms when matrix changes
  useEffect(() => {
    if (uniformsRef.current) {
      uniformsRef.current.uKernel.value = matrix.map(v => Number.isNaN(v) ? 0 : v);
    }
  }, [matrix]);

  // Force canvas resize when fullscreen toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? "#07070a" : "#f9fafb");
    
    // Add grid helpers for aesthetics
    const gridHelper = new THREE.GridHelper(20, 40, dark ? 0x333344 : 0xdddddd, dark ? 0x222233 : 0xeeeeee);
    gridHelper.position.y = -1.5;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 5, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 20;

    // Load texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("Anonymous");
    
    // Create materials
    const planeGeo = new THREE.PlaneGeometry(5, 5);
    
    const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const topMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: uniformsRef.current,
      side: THREE.DoubleSide
    });

    const bottomPlane = new THREE.Mesh(planeGeo, baseMaterial);
    bottomPlane.rotation.x = -Math.PI / 2;
    bottomPlane.position.y = -1;
    scene.add(bottomPlane);

    const topPlane = new THREE.Mesh(planeGeo, topMaterial);
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.y = 1;
    scene.add(topPlane);
    
    textureLoader.load(IMAGE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      baseMaterial.map = tex;
      baseMaterial.color.set(0xffffff);
      baseMaterial.needsUpdate = true;
      
      uniformsRef.current.tDiffuse.value = tex;
      uniformsRef.current.uResolution.value.set(tex.image.width, tex.image.height);
    });

    // Create the sliding kernel window (3x3 grid)
    const kernelGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    
    for (let i = 0; i < 9; i++) {
      const px = (i % 3 - 1) * 0.2;
      const pz = (Math.floor(i / 3) - 1) * 0.2;
      
      const cube = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8 })
      );
      cube.position.set(px, 0, pz);
      kernelGroup.add(cube);
    }
    scene.add(kernelGroup);
    kernelGroupRef.current = kernelGroup;

    // Create Downward Beams (9 lines)
    const downLineGeo = new THREE.BufferGeometry();
    const downPositions = new Float32Array(9 * 2 * 3); // 9 lines * 2 points * xyz
    downLineGeo.setAttribute('position', new THREE.BufferAttribute(downPositions, 3));
    const downLines = new THREE.LineSegments(downLineGeo, new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.3 }));
    scene.add(downLines);
    downBeamsRef.current = downLines;

    // Create Upward Beam (1 line)
    const upLineGeo = new THREE.BufferGeometry();
    const upPositions = new Float32Array(2 * 3);
    upLineGeo.setAttribute('position', new THREE.BufferAttribute(upPositions, 3));
    const upLine = new THREE.Line(upLineGeo, new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 }));
    scene.add(upLine);
    upBeamRef.current = upLine;

    // Add connecting corner posts between planes to show the "volume"
    const postMat = new THREE.LineDashedMaterial({ color: dark ? 0x444455 : 0xcccccc, dashSize: 0.1, gapSize: 0.1 });
    const cornerOffsets = [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]];
    cornerOffsets.forEach(([cx, cz]) => {
      const pGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, -1, cz),
        new THREE.Vector3(cx, 1, cz)
      ]);
      const post = new THREE.Line(pGeo, postMat);
      post.computeLineDistances();
      scene.add(post);
    });

    let animFrame = 0;
    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;

      controls.update();

      // Animate the kernel sweeping over the image
      if (kernelGroupRef.current && downBeamsRef.current && upBeamRef.current) {
        // Lissajous curve for smooth, sweeping area coverage
        const kx = Math.sin(time * 0.8) * 2.0;
        const kz = Math.sin(time * 1.3) * 2.0;
        
        kernelGroupRef.current.position.set(kx, 0, kz);
        kernelGroupRef.current.rotation.y = Math.sin(time * 0.2) * 0.1; // slight wobble
        
        // Update Downward beams
        const dp = downBeamsRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < 9; i++) {
          const px = (i % 3 - 1) * 0.2;
          const pz = (Math.floor(i / 3) - 1) * 0.2;
          
          // Apply group rotation to local offsets
          const localVec = new THREE.Vector3(px, 0, pz);
          localVec.applyEuler(kernelGroupRef.current.rotation);
          
          const worldX = kx + localVec.x;
          const worldZ = kz + localVec.z;
          
          // Point 1: Kernel cube center
          dp[i * 6 + 0] = worldX;
          dp[i * 6 + 1] = 0;
          dp[i * 6 + 2] = worldZ;
          
          // Point 2: Bottom plane
          dp[i * 6 + 3] = worldX;
          dp[i * 6 + 4] = -1;
          dp[i * 6 + 5] = worldZ;
        }
        downBeamsRef.current.geometry.attributes.position.needsUpdate = true;

        // Update Upward beam
        const up = upBeamRef.current.geometry.attributes.position.array as Float32Array;
        up[0] = kx; up[1] = 0; up[2] = kz;
        up[3] = kx; up[4] = 1; up[5] = kz;
        upBeamRef.current.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      planeGeo.dispose();
      baseMaterial.dispose();
      topMaterial.dispose();
      boxGeo.dispose();
      edgesGeo.dispose();
      downLineGeo.dispose();
      upLineGeo.dispose();
    };
  }, [dark]);

  const updateMatrixValue = (index: number, valStr: string) => {
    const val = parseFloat(valStr);
    const newM = [...matrix];
    newM[index] = Number.isNaN(val) ? 0 : val;
    setMatrix(newM);
  };

  return (
    <div className={isFullscreen ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
      <div className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-50 dark:bg-[#07070a] p-4 flex flex-col h-screen" : "lg:col-span-2 space-y-6"}>
        <Panel className={`relative overflow-hidden p-0 bg-white dark:bg-[#08080b] border-neutral-200 dark:border-neutral-800 ${isFullscreen ? "h-full flex flex-col" : ""}`}>
          <div className="absolute top-4 left-4 right-4 z-10 flex items-start justify-between gap-3 pointer-events-none">
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 shadow-lg">
                <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
                <h3 className="text-xs uppercase tracking-wider text-neutral-800 dark:text-indigo-400 font-bold">
                  CNN Layer Viewer
                </h3>
              </div>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white/90 hover:bg-neutral-100 dark:bg-neutral-900/90 dark:hover:bg-neutral-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all shadow-lg pointer-events-auto"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-500" /> : <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>
          <div ref={containerRef} className={`w-full ${isFullscreen ? "flex-1 h-full" : "h-[600px]"} cursor-move`} />
        </Panel>
      </div>

      {!isFullscreen && (
        <div className="space-y-6">
          <Panel className="space-y-6">
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Settings className="w-3 h-3" />
                Live Matrix Weights
              </div>
              
              <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-900 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800">
                {matrix.map((val, i) => (
                  <input
                    key={i}
                    type="number"
                    step="0.1"
                    value={val}
                    onChange={(e) => updateMatrixValue(i, e.target.value)}
                    className={`aspect-square w-full text-center bg-white dark:bg-[#111] rounded-lg text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-colors ${val < 0 ? 'text-red-500 dark:text-red-400' : val > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-500'}`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                {Object.keys(PRESETS).map(key => (
                  <button
                    key={key}
                    onClick={() => setMatrix([...PRESETS[key]])}
                    className="px-2 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors shadow-sm"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30 p-3.5 space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed shadow-sm">
              <div className="font-bold text-neutral-700 dark:text-neutral-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3 text-indigo-500" />
                How to Read This
              </div>
              <p>
                <strong>The Bottom Plane</strong> is your original image. The <strong>Top Plane</strong> is the resulting "Feature Map".
              </p>
              <p>
                The floating grid is the <strong>Kernel</strong>. It mathematically slides over the image, multiplying the pixels underneath it by your custom weights to calculate a single new pixel on the top plane.
              </p>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
