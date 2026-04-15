import { useEffect, useMemo } from 'react';
import { Html, OrbitControls } from '@react-three/drei';
import { Nodes } from './Nodes.jsx';
import { Edges } from './Edges.jsx';
import { useForceSim } from './useForceSim.js';

function Label({ name, positionsRef, index, variant }) {
  if (index == null || index < 0) return null;
  const positions = positionsRef.current;
  if (!positions) return null;
  const pos = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  const styleFor = variant === 'selected'
    ? { background: 'rgba(10,10,15,0.95)', border: '1px solid #7aa2f7', color: '#d7d7e0' }
    : { background: 'rgba(10,10,15,0.85)', border: '1px solid #26263a', color: '#d7d7e0' };
  return (
    <Html position={pos} center distanceFactor={140} style={{ pointerEvents: 'none' }}>
      <div style={{
        ...styleFor,
        padding: '3px 8px',
        borderRadius: 3,
        fontSize: 11,
        fontFamily: 'SF Mono, Menlo, monospace',
        whiteSpace: 'nowrap',
        transform: 'translate(0, -140%)',
      }}>
        {name}
      </div>
    </Html>
  );
}

export function Graph3D({ nodes, edges, selectedId, hoveredId, onSelect, onHover, touchpoints, simRef }) {
  const sim = useForceSim(nodes, edges);

  // Expose the sim controls to callers outside the Canvas tree. useForceSim has
  // to live inside Canvas (it calls useFrame), so the App HUD can't call its
  // return value directly — it reads from this ref.
  useEffect(() => {
    if (simRef) simRef.current = { reheat: sim.reheat, alpha: sim.alpha };
  }, [simRef, sim.reheat, sim.alpha]);

  const nameIndex = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < nodes.length; i++) m.set(nodes[i].name, i);
    return m;
  }, [nodes]);

  const highlightedTypes = useMemo(() => {
    const set = new Set();
    if (touchpoints) {
      for (const t of touchpoints) {
        if (t.parentType) set.add(t.parentType);
        if (t.returns) set.add(t.returns);
      }
    }
    return set;
  }, [touchpoints]);

  const highlightedEdges = useMemo(() => {
    const set = new Set();
    if (touchpoints) {
      for (const t of touchpoints) {
        if (t.parentType && t.field && t.returns) {
          set.add(`${t.parentType}\x01${t.field}\x01${t.returns}`);
        }
      }
    }
    return set;
  }, [touchpoints]);

  const selectedIdx = selectedId ? nameIndex.get(selectedId) : null;
  const hoveredIdx = hoveredId ? nameIndex.get(hoveredId) : null;

  return (
    <>
      <color attach="background" args={['#0a0a0f']} />
      <ambientLight intensity={0.5} />
      <Edges
        nodes={nodes}
        edges={edges}
        positionsRef={sim.positionsRef}
        highlightedEdges={highlightedEdges}
      />
      <Nodes
        nodes={nodes}
        positionsRef={sim.positionsRef}
        dirtyRef={sim.dirtyRef}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelect}
        onHover={onHover}
        highlightedTypes={highlightedTypes}
      />
      {selectedId && selectedIdx != null && (
        <Label name={selectedId} positionsRef={sim.positionsRef} index={selectedIdx} variant="selected" />
      )}
      {hoveredId && hoveredId !== selectedId && hoveredIdx != null && (
        <Label name={hoveredId} positionsRef={sim.positionsRef} index={hoveredIdx} variant="hover" />
      )}
      <OrbitControls enableDamping dampingFactor={0.08} rotateSpeed={0.6} />
    </>
  );
}
