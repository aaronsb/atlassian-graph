import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { colorFor } from './categoryColors.js';

const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpColor = new THREE.Color();

export function Nodes({ nodes, positionsRef, dirtyRef, selectedId, hoveredId, onSelect, onHover, onHide, hiddenIds, highlightedTypes }) {
  const meshRef = useRef();
  const invalidate = useThree(state => state.invalidate);

  const scales = useMemo(() => {
    const out = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      out[i] = 0.8 + Math.sqrt(nodes[i].degree || 1) * 0.3;
    }
    return out;
  }, [nodes]);

  useFrame(() => {
    if (!meshRef.current) return;
    const positions = positionsRef.current;
    if (!positions) return;
    const mesh = meshRef.current;
    const hasHighlight = highlightedTypes && highlightedTypes.size > 0;
    const hasHidden = hiddenIds && hiddenIds.size > 0;
    for (let i = 0; i < nodes.length; i++) {
      tmpPos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      if (hasHidden && hiddenIds.has(nodes[i].name)) {
        // Zero scale collapses the icosahedron to a point — invisible and
        // not pickable, while leaving the physics index untouched.
        tmpScale.setScalar(0);
      } else {
        const boost = hasHighlight && highlightedTypes.has(nodes[i].name) ? 1.8 : 1.0;
        tmpScale.setScalar(scales[i] * boost);
      }
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    // Every node renders at its palette hex. Selection is signalled by the
    // screen-space caret overlay, hover by the label — colors never change.
    for (let i = 0; i < nodes.length; i++) {
      tmpColor.set(colorFor(nodes[i].category));
      mesh.setColorAt(i, tmpColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [nodes, invalidate]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, nodes.length]}
      onPointerOver={e => {
        e.stopPropagation();
        if (e.instanceId == null) return;
        const name = nodes[e.instanceId].name;
        if (hiddenIds && hiddenIds.has(name)) return;
        onHover?.(name);
      }}
      onPointerOut={e => {
        e.stopPropagation();
        onHover?.(null);
      }}
      onClick={e => {
        e.stopPropagation();
        if (e.instanceId == null) return;
        const name = nodes[e.instanceId].name;
        if (hiddenIds && hiddenIds.has(name)) return;
        // Clicking the already-selected node clears selection (toggle).
        onSelect?.(selectedId === name ? null : name);
      }}
      onContextMenu={e => {
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        if (e.instanceId == null) return;
        const name = nodes[e.instanceId].name;
        if (hiddenIds && hiddenIds.has(name)) return;
        onHide?.(name);
      }}
    >
      <icosahedronGeometry args={[1, 1]} />
      {/* vertexColors=false is intentional: per-instance colors come from
          setColorAt/instanceColor, which three injects via the USE_INSTANCING_COLOR
          shader chunk independent of the vertexColors flag. Switching to a
          lit material (MeshStandardMaterial, etc.) silently breaks this. */}
      <meshBasicMaterial vertexColors={false} />
    </instancedMesh>
  );
}
