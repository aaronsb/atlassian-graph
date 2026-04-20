import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colorFor } from './categoryColors.js';

export function Edges({ nodes, edges, positionsRef, highlightedEdges, hiddenIds }) {
  const geomRef = useRef();
  const invalidate = useThree(state => state.invalidate);

  const { geometry, material, indexPairs, edgeRecords } = useMemo(() => {
    const nodeIndex = new Map();
    for (let i = 0; i < nodes.length; i++) nodeIndex.set(nodes[i].name, i);

    const usable = edges.filter(e => nodeIndex.has(e.from) && nodeIndex.has(e.to));
    const posArr = new Float32Array(usable.length * 6);
    const colArr = new Float32Array(usable.length * 6);
    const pairs = new Uint32Array(usable.length * 2);
    const records = usable;

    for (let i = 0; i < usable.length; i++) {
      const e = usable[i];
      const si = nodeIndex.get(e.from);
      const ti = nodeIndex.get(e.to);
      pairs[i * 2] = si;
      pairs[i * 2 + 1] = ti;
    }

    const geom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    const colAttr = new THREE.BufferAttribute(colArr, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('color', colAttr);

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    return { geometry: geom, material: mat, indexPairs: pairs, edgeRecords: records };
  }, [nodes, edges]);

  // Dispose the previous geometry/material pair when inputs change or we unmount.
  // No-op during the common case (nodes/edges load once), but prevents a GPU
  // leak once the cap control re-fetches the graph with a different node count.
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const colAttr = geometry.getAttribute('color');
    if (!colAttr) return;
    const arr = colAttr.array;
    const sc = new THREE.Color();
    const tc = new THREE.Color();
    // Every edge renders at its palette color (well, its endpoints'). The
    // material's opacity attenuates from there; no per-edge brightness
    // multipliers, same principle as the node color effect.
    for (let i = 0; i < edgeRecords.length; i++) {
      const si = indexPairs[i * 2];
      const ti = indexPairs[i * 2 + 1];
      sc.set(colorFor(nodes[si].category));
      tc.set(colorFor(nodes[ti].category));
      arr[i * 6]     = sc.r;
      arr[i * 6 + 1] = sc.g;
      arr[i * 6 + 2] = sc.b;
      arr[i * 6 + 3] = tc.r;
      arr[i * 6 + 4] = tc.g;
      arr[i * 6 + 5] = tc.b;
    }
    colAttr.needsUpdate = true;
    invalidate();
  }, [geometry, edgeRecords, indexPairs, nodes, invalidate]);

  useFrame(() => {
    const positions = positionsRef.current;
    if (!positions || !geomRef.current) return;
    const posAttr = geomRef.current.geometry.getAttribute('position');
    const arr = posAttr.array;
    const pairCount = indexPairs.length / 2;
    const hasHidden = hiddenIds && hiddenIds.size > 0;
    for (let i = 0; i < pairCount; i++) {
      const si = indexPairs[i * 2];
      const ti = indexPairs[i * 2 + 1];
      const sHidden = hasHidden && hiddenIds.has(nodes[si].name);
      const tHidden = hasHidden && hiddenIds.has(nodes[ti].name);
      if (sHidden || tHidden) {
        // Collapse both endpoints to the same point — renders as zero-length
        // (invisible) without rebuilding geometry on every hide.
        const keepIdx = sHidden ? ti : si;
        const k3 = keepIdx * 3;
        arr[i * 6]     = positions[k3];
        arr[i * 6 + 1] = positions[k3 + 1];
        arr[i * 6 + 2] = positions[k3 + 2];
        arr[i * 6 + 3] = positions[k3];
        arr[i * 6 + 4] = positions[k3 + 1];
        arr[i * 6 + 5] = positions[k3 + 2];
        continue;
      }
      arr[i * 6]     = positions[si * 3];
      arr[i * 6 + 1] = positions[si * 3 + 1];
      arr[i * 6 + 2] = positions[si * 3 + 2];
      arr[i * 6 + 3] = positions[ti * 3];
      arr[i * 6 + 4] = positions[ti * 3 + 1];
      arr[i * 6 + 5] = positions[ti * 3 + 2];
    }
    posAttr.needsUpdate = true;
  });

  return <lineSegments ref={geomRef} geometry={geometry} material={material} />;
}
