import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { colorFor } from './categoryColors.js';

export function Edges({ nodes, edges, positionsRef, highlightedEdges }) {
  const geomRef = useRef();

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

  useEffect(() => {
    const colAttr = geometry.getAttribute('color');
    if (!colAttr) return;
    const arr = colAttr.array;
    const sc = new THREE.Color();
    const tc = new THREE.Color();
    const hasHighlight = highlightedEdges && highlightedEdges.size > 0;
    const baseDim = 0.25;
    const dim = hasHighlight ? 0.06 : baseDim;
    const bright = 1.6;

    for (let i = 0; i < edgeRecords.length; i++) {
      const e = edgeRecords[i];
      const key = `${e.from}\x01${e.field}\x01${e.to}`;
      const isHighlighted = hasHighlight && highlightedEdges.has(key);
      const mul = isHighlighted ? bright : dim;
      const si = indexPairs[i * 2];
      const ti = indexPairs[i * 2 + 1];
      sc.set(colorFor(nodes[si].category));
      tc.set(colorFor(nodes[ti].category));
      arr[i * 6]     = sc.r * mul;
      arr[i * 6 + 1] = sc.g * mul;
      arr[i * 6 + 2] = sc.b * mul;
      arr[i * 6 + 3] = tc.r * mul;
      arr[i * 6 + 4] = tc.g * mul;
      arr[i * 6 + 5] = tc.b * mul;
    }
    colAttr.needsUpdate = true;
  }, [geometry, edgeRecords, indexPairs, highlightedEdges, nodes]);

  useFrame(() => {
    const positions = positionsRef.current;
    if (!positions || !geomRef.current) return;
    const posAttr = geomRef.current.geometry.getAttribute('position');
    const arr = posAttr.array;
    const pairCount = indexPairs.length / 2;
    for (let i = 0; i < pairCount; i++) {
      const si = indexPairs[i * 2];
      const ti = indexPairs[i * 2 + 1];
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
