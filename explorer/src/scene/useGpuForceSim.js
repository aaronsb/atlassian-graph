import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { seedSpherePositions } from './positions.js';

const DEFAULTS = {
  repulsion: 120,
  attraction: 0.04,
  damping: 0.93,
  dt: 0.55,
  centerGravity: 0.004,
  maxForce: 40,
  alphaDecay: 0.0228,
  alphaMin: 0.001,
  alphaInitial: 1.0,
};

// Capability detection. Computed once at module load so the Graph3D dispatcher
// can pick a hook at module scope (hooks rules require a stable choice).
// Requires WebGL2 (dynamic loop bounds) and float color-buffer rendering.
export const gpuSimSupported = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const hasFloatRT = !!gl.getExtension('EXT_color_buffer_float');
    canvas.width = canvas.height = 0;
    return hasFloatRT;
  } catch {
    return false;
  }
})();

// Fragment shader bodies. `resolution`, `texturePosition`, `textureVelocity`
// are injected by GPUComputationRenderer. MAX_NODES / MAX_NEIGHBORS are
// prepended as #defines per-graph so the loop bounds stay compile-time.

const velShaderBody = /* glsl */ `
uniform float alpha;
uniform float repulsion;
uniform float attraction;
uniform float damping;
uniform float centerGravity;
uniform float maxForce;
uniform int nodeCount;
uniform sampler2D neighborOffsetCount;
uniform sampler2D neighborList;
uniform vec2 neighborRes;

vec2 idxToUV(int idx, vec2 res) {
  float fx = mod(float(idx), res.x);
  float fy = floor(float(idx) / res.x);
  return (vec2(fx, fy) + 0.5) / res;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  int myIdx = int(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x));
  if (myIdx >= nodeCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  vec3 force = vec3(0.0);

  // Repulsion: O(N) per fragment, O(N^2) total but parallelized across texels.
  for (int j = 0; j < MAX_NODES; j++) {
    if (j >= nodeCount) break;
    if (j == myIdx) continue;
    vec2 juv = idxToUV(j, resolution);
    vec3 pj = texture2D(texturePosition, juv).xyz;
    vec3 d = pos - pj;
    float d2 = max(dot(d, d), 0.01);
    float dist = sqrt(d2);
    force += (d / dist) * (repulsion / d2);
  }

  // Edge attraction via neighbor CSR.
  vec4 meta = texture2D(neighborOffsetCount, uv);
  int off = int(meta.r + 0.5);
  int cnt = int(meta.g + 0.5);
  for (int k = 0; k < MAX_NEIGHBORS; k++) {
    if (k >= cnt) break;
    int ni = off + k;
    vec2 nuv = idxToUV(ni, neighborRes);
    int neighborIdx = int(texture2D(neighborList, nuv).r + 0.5);
    vec2 puv = idxToUV(neighborIdx, resolution);
    vec3 pn = texture2D(texturePosition, puv).xyz;
    vec3 d = pn - pos;
    force += d * attraction;
  }

  // Center gravity.
  force -= pos * centerGravity;

  // Scale by alpha, cap magnitude.
  force *= alpha;
  float m = length(force);
  if (m > maxForce) force *= (maxForce / m);

  vec3 newVel = (vel + force) * damping;
  gl_FragColor = vec4(newVel, 1.0);
}
`;

const posShaderBody = /* glsl */ `
uniform float dt;
uniform int nodeCount;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  int myIdx = int(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x));
  vec3 pos = texture2D(texturePosition, uv).xyz;
  if (myIdx >= nodeCount) {
    gl_FragColor = vec4(pos, 1.0);
    return;
  }
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  gl_FragColor = vec4(pos + vel * dt, 1.0);
}
`;

function buildNeighborCSR(nodes, edges) {
  const N = nodes.length;
  const nameIndex = new Map();
  for (let i = 0; i < N; i++) nameIndex.set(nodes[i].name, i);
  const adj = Array.from({ length: N }, () => []);
  for (const e of edges) {
    const a = nameIndex.get(e.from);
    const b = nameIndex.get(e.to);
    if (a == null || b == null) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  const offsets = new Uint32Array(N);
  const counts = new Uint32Array(N);
  let total = 0;
  let maxNeighbors = 0;
  for (let i = 0; i < N; i++) {
    offsets[i] = total;
    counts[i] = adj[i].length;
    total += adj[i].length;
    if (adj[i].length > maxNeighbors) maxNeighbors = adj[i].length;
  }
  const flat = new Uint32Array(Math.max(1, total));
  let p = 0;
  for (let i = 0; i < N; i++) {
    for (const n of adj[i]) flat[p++] = n;
  }
  return { offsets, counts, flat, total, maxNeighbors };
}

export function useGpuForceSim(nodes, edges, params = {}) {
  const cfg = { ...DEFAULTS, ...params };
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const nodeCount = nodes.length;

  const positionsRef = useRef(null);
  const dirtyRef = useRef(false);
  const alphaRef = useRef(cfg.alphaInitial);
  const [alphaDisplay, setAlphaDisplay] = useState(cfg.alphaInitial);
  const frameCounterRef = useRef(0);
  const gpuStateRef = useRef(null);

  useEffect(() => {
    if (nodeCount === 0) {
      positionsRef.current = new Float32Array(0);
      gpuStateRef.current = null;
      return;
    }

    const texSize = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
    const texW = texSize;
    const texH = texSize;
    const totalTexels = texW * texH;

    const seed = seedSpherePositions(nodeCount, Math.max(120, Math.cbrt(nodeCount) * 15));
    const posOut = new Float32Array(nodeCount * 3);
    posOut.set(seed);
    positionsRef.current = posOut;

    const gpuCompute = new GPUComputationRenderer(texW, texH, gl);
    const posInit = gpuCompute.createTexture();
    const velInit = gpuCompute.createTexture();
    const posData = posInit.image.data;
    const velData = velInit.image.data;
    posData.fill(0);
    velData.fill(0);
    for (let i = 0; i < nodeCount; i++) {
      posData[i * 4]     = seed[i * 3];
      posData[i * 4 + 1] = seed[i * 3 + 1];
      posData[i * 4 + 2] = seed[i * 3 + 2];
      posData[i * 4 + 3] = 1.0;
    }

    const { offsets, counts, flat, total, maxNeighbors } = buildNeighborCSR(nodes, edges);

    const neighborW = Math.max(1, Math.min(2048, total));
    const neighborH = Math.max(1, Math.ceil(total / neighborW));
    const neighborData = new Float32Array(neighborW * neighborH * 4);
    for (let i = 0; i < total; i++) neighborData[i * 4] = flat[i];
    const neighborTex = new THREE.DataTexture(
      neighborData, neighborW, neighborH, THREE.RGBAFormat, THREE.FloatType
    );
    neighborTex.minFilter = THREE.NearestFilter;
    neighborTex.magFilter = THREE.NearestFilter;
    neighborTex.needsUpdate = true;

    const ocData = new Float32Array(totalTexels * 4);
    for (let i = 0; i < nodeCount; i++) {
      ocData[i * 4]     = offsets[i];
      ocData[i * 4 + 1] = counts[i];
    }
    const offsetCountTex = new THREE.DataTexture(
      ocData, texW, texH, THREE.RGBAFormat, THREE.FloatType
    );
    offsetCountTex.minFilter = THREE.NearestFilter;
    offsetCountTex.magFilter = THREE.NearestFilter;
    offsetCountTex.needsUpdate = true;

    // #defines for static loop bounds — cheap to recompile per graph load.
    const defines =
      `#define MAX_NODES ${nodeCount}\n` +
      `#define MAX_NEIGHBORS ${Math.max(1, maxNeighbors)}\n`;
    const velShader = defines + velShaderBody;
    const posShader = defines + posShaderBody;

    const velVar = gpuCompute.addVariable('textureVelocity', velShader, velInit);
    const posVar = gpuCompute.addVariable('texturePosition', posShader, posInit);
    gpuCompute.setVariableDependencies(velVar, [velVar, posVar]);
    gpuCompute.setVariableDependencies(posVar, [velVar, posVar]);

    const vU = velVar.material.uniforms;
    vU.alpha = { value: cfg.alphaInitial };
    vU.repulsion = { value: cfg.repulsion };
    vU.attraction = { value: cfg.attraction };
    vU.damping = { value: cfg.damping };
    vU.centerGravity = { value: cfg.centerGravity };
    vU.maxForce = { value: cfg.maxForce };
    vU.nodeCount = { value: nodeCount };
    vU.neighborOffsetCount = { value: offsetCountTex };
    vU.neighborList = { value: neighborTex };
    vU.neighborRes = { value: new THREE.Vector2(neighborW, neighborH) };

    const pU = posVar.material.uniforms;
    pU.dt = { value: cfg.dt };
    pU.nodeCount = { value: nodeCount };

    const err = gpuCompute.init();
    if (err) {
      console.error('[useGpuForceSim] GPUComputationRenderer init failed:', err);
      gpuCompute.dispose();
      offsetCountTex.dispose();
      neighborTex.dispose();
      gpuStateRef.current = null;
      return;
    }

    // Zero texture used for freeze — renders across both velocity RTs to reset.
    const zeroData = new Float32Array(totalTexels * 4);
    const zeroTex = new THREE.DataTexture(
      zeroData, texW, texH, THREE.RGBAFormat, THREE.FloatType
    );
    zeroTex.minFilter = THREE.NearestFilter;
    zeroTex.magFilter = THREE.NearestFilter;
    zeroTex.needsUpdate = true;

    const readbackBuf = new Float32Array(totalTexels * 4);

    alphaRef.current = cfg.alphaInitial;
    setAlphaDisplay(cfg.alphaInitial);
    dirtyRef.current = true;
    frameCounterRef.current = 0;

    gpuStateRef.current = {
      gpuCompute, posVar, velVar, readbackBuf,
      texW, texH, N: nodeCount,
      offsetCountTex, neighborTex, zeroTex,
    };

    return () => {
      gpuCompute.dispose();
      offsetCountTex.dispose();
      neighborTex.dispose();
      zeroTex.dispose();
      gpuStateRef.current = null;
    };
  }, [nodes, edges, nodeCount, gl]);

  useFrame(() => {
    const s = gpuStateRef.current;
    if (!s) return;
    const alpha = alphaRef.current;
    if (alpha < cfg.alphaMin) {
      dirtyRef.current = false;
      return;
    }
    invalidate();

    s.velVar.material.uniforms.alpha.value = alpha;

    // Compute frame N, then read back frame N-1 from the alternate RT. This
    // keeps CPU and GPU overlapped — the readback no longer stalls the pipeline
    // on the just-written texture. One-frame lag is imperceptible.
    s.gpuCompute.compute();

    const rt = s.gpuCompute.getAlternateRenderTarget(s.posVar);
    gl.readRenderTargetPixels(rt, 0, 0, s.texW, s.texH, s.readbackBuf);

    const out = positionsRef.current;
    const buf = s.readbackBuf;
    for (let i = 0; i < s.N; i++) {
      out[i * 3]     = buf[i * 4];
      out[i * 3 + 1] = buf[i * 4 + 1];
      out[i * 3 + 2] = buf[i * 4 + 2];
    }

    alphaRef.current = alpha * (1 - cfg.alphaDecay);
    dirtyRef.current = true;

    frameCounterRef.current++;
    if (frameCounterRef.current % 10 === 0) setAlphaDisplay(alphaRef.current);
  });

  const reheat = useCallback(() => {
    alphaRef.current = cfg.alphaInitial;
    setAlphaDisplay(cfg.alphaInitial);
    dirtyRef.current = true;
    invalidate();
  }, [cfg.alphaInitial, invalidate]);

  const freeze = useCallback(() => {
    alphaRef.current = 0;
    setAlphaDisplay(0);
    // Match the CPU hook: zero velocities so resumes start cold, not coasting.
    const s = gpuStateRef.current;
    if (s) {
      s.gpuCompute.renderTexture(s.zeroTex, s.velVar.renderTargets[0]);
      s.gpuCompute.renderTexture(s.zeroTex, s.velVar.renderTargets[1]);
    }
    dirtyRef.current = false;
    invalidate();
  }, [invalidate]);

  return { positionsRef, dirtyRef, alpha: alphaDisplay, reheat, freeze };
}
