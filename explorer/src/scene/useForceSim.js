import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
  alphaSimmer: 0.08,
  dampingSimmer: 0.70,
  centerGravitySimmer: 0.03,
  velStopSimmer: 0.3,
};

export function useForceSim(nodes, edges, params = {}) {
  const { hiddenIds, ...tuning } = params;
  const cfg = { ...DEFAULTS, ...tuning };
  const nodeCount = nodes.length;
  const invalidate = useThree(state => state.invalidate);

  const positionsRef = useRef(null);
  const velocitiesRef = useRef(null);
  const edgeIndicesRef = useRef(null);
  const alphaRef = useRef(cfg.alphaInitial);
  const [alphaDisplay, setAlphaDisplay] = useState(cfg.alphaInitial);
  const dirtyRef = useRef(false);
  const frameCounterRef = useRef(0);
  const simmerRef = useRef(false);

  useMemo(() => {
    positionsRef.current = seedSpherePositions(nodeCount, Math.max(120, Math.cbrt(nodeCount) * 15));
    velocitiesRef.current = new Float32Array(nodeCount * 3);
    alphaRef.current = cfg.alphaInitial;
    setAlphaDisplay(cfg.alphaInitial);
    dirtyRef.current = true;
  }, [nodeCount]);

  useEffect(() => {
    const nameIndex = new Map();
    for (let i = 0; i < nodeCount; i++) nameIndex.set(nodes[i].name, i);
    const usable = edges.filter(e => nameIndex.has(e.from) && nameIndex.has(e.to));
    const arr = new Uint32Array(usable.length * 2);
    for (let i = 0; i < usable.length; i++) {
      arr[i * 2]     = nameIndex.get(usable[i].from);
      arr[i * 2 + 1] = nameIndex.get(usable[i].to);
    }
    edgeIndicesRef.current = arr;
  }, [nodes, edges, nodeCount]);

  useFrame(() => {
    const alpha = alphaRef.current;
    if (alpha < cfg.alphaMin) {
      dirtyRef.current = false;
      return;
    }
    // Demand-mode render loop: keep pumping frames while the sim is active.
    invalidate();

    const positions = positionsRef.current;
    const velocities = velocitiesRef.current;
    const edgeIdx = edgeIndicesRef.current;
    if (!positions || !velocities || !edgeIdx) return;

    const N = nodeCount;
    const { repulsion, attraction, dt, maxForce } = cfg;
    const damping = simmerRef.current ? cfg.dampingSimmer : cfg.damping;
    const centerGravity = simmerRef.current ? cfg.centerGravitySimmer : cfg.centerGravity;
    const velStop = simmerRef.current ? cfg.velStopSimmer : 0;

    const forces = new Float32Array(N * 3);
    const hasHidden = hiddenIds && hiddenIds.size > 0;
    const isHidden = hasHidden
      ? (i) => hiddenIds.has(nodes[i].name)
      : () => false;

    for (let i = 0; i < N; i++) {
      if (isHidden(i)) continue;
      const ix3 = i * 3;
      const xi = positions[ix3], yi = positions[ix3 + 1], zi = positions[ix3 + 2];
      for (let j = i + 1; j < N; j++) {
        if (isHidden(j)) continue;
        const jx3 = j * 3;
        const dx = xi - positions[jx3];
        const dy = yi - positions[jx3 + 1];
        const dz = zi - positions[jx3 + 2];
        let dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 < 0.01) dist2 = 0.01;
        const dist = Math.sqrt(dist2);
        const f = repulsion / dist2;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        const fz = (dz / dist) * f;
        forces[ix3]     += fx;
        forces[ix3 + 1] += fy;
        forces[ix3 + 2] += fz;
        forces[jx3]     -= fx;
        forces[jx3 + 1] -= fy;
        forces[jx3 + 2] -= fz;
      }
      forces[ix3]     -= xi * centerGravity;
      forces[ix3 + 1] -= yi * centerGravity;
      forces[ix3 + 2] -= zi * centerGravity;
    }

    const eLen = edgeIdx.length;
    for (let e = 0; e < eLen; e += 2) {
      const a = edgeIdx[e];
      const b = edgeIdx[e + 1];
      if (isHidden(a) || isHidden(b)) continue;
      const ax = a * 3, bx = b * 3;
      const dx = positions[bx]     - positions[ax];
      const dy = positions[bx + 1] - positions[ax + 1];
      const dz = positions[bx + 2] - positions[ax + 2];
      forces[ax]     += dx * attraction;
      forces[ax + 1] += dy * attraction;
      forces[ax + 2] += dz * attraction;
      forces[bx]     -= dx * attraction;
      forces[bx + 1] -= dy * attraction;
      forces[bx + 2] -= dz * attraction;
    }

    for (let i = 0; i < N; i++) {
      if (isHidden(i)) continue;
      const ix3 = i * 3;
      // Cap raw force first, then scale by alpha — mirrors the GPU shader so
      // alpha actually scales dynamics for high-degree nodes too.
      let fx = forces[ix3];
      let fy = forces[ix3 + 1];
      let fz = forces[ix3 + 2];
      const mag = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (mag > maxForce) {
        const s = maxForce / mag;
        fx *= s; fy *= s; fz *= s;
      }
      fx *= alpha; fy *= alpha; fz *= alpha;
      let nvx = (velocities[ix3]     + fx) * damping;
      let nvy = (velocities[ix3 + 1] + fy) * damping;
      let nvz = (velocities[ix3 + 2] + fz) * damping;
      // Static-friction-style clamp (see GPU shader). Kills low-amplitude
      // spring oscillations rather than letting them decay asymptotically.
      if (velStop > 0) {
        const vm2 = nvx * nvx + nvy * nvy + nvz * nvz;
        if (vm2 < velStop * velStop) { nvx = 0; nvy = 0; nvz = 0; }
      }
      velocities[ix3]     = nvx;
      velocities[ix3 + 1] = nvy;
      velocities[ix3 + 2] = nvz;
      positions[ix3]     += velocities[ix3]     * dt;
      positions[ix3 + 1] += velocities[ix3 + 1] * dt;
      positions[ix3 + 2] += velocities[ix3 + 2] * dt;
    }

    // Same decay as GPU hook; simmer floors alpha above alphaMin so the sim
    // never stops via the early-return.
    const decayed = alpha * (1 - cfg.alphaDecay);
    alphaRef.current = simmerRef.current ? Math.max(cfg.alphaSimmer, decayed) : decayed;
    dirtyRef.current = true;

    frameCounterRef.current++;
    if (frameCounterRef.current % 10 === 0) {
      setAlphaDisplay(alphaRef.current);
    }
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
    simmerRef.current = false;
    // zero velocities so resumes start cold, not coasting
    const vel = velocitiesRef.current;
    if (vel) vel.fill(0);
    dirtyRef.current = false;
    invalidate();
  }, [invalidate]);

  const simmer = useCallback(on => {
    simmerRef.current = on;
    if (on) {
      if (alphaRef.current < cfg.alphaSimmer) {
        alphaRef.current = cfg.alphaSimmer;
        setAlphaDisplay(cfg.alphaSimmer);
      }
      dirtyRef.current = true;
      invalidate();
    }
  }, [cfg.alphaSimmer, invalidate]);

  return { positionsRef, dirtyRef, alpha: alphaDisplay, reheat, freeze, simmer };
}
