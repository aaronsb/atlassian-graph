import { useEffect, useMemo } from 'react';
import { Html, OrbitControls } from '@react-three/drei';
import { Nodes } from './Nodes.jsx';
import { Edges } from './Edges.jsx';
import { useForceSim } from './useForceSim.js';
import { useGpuForceSim, gpuSimSupported } from './useGpuForceSim.js';

// Module-scope choice — satisfies hooks rules (stable hook identity across renders).
const useSim = gpuSimSupported ? useGpuForceSim : useForceSim;

// Viewport-space selection marker: constant pixel size regardless of zoom or
// depth. Four corner brackets + a soft center ring, rendered via <Html> so
// the DOM does the compositing and the caret is crisp at any camera distance.
function CaretMarker({ positionsRef, index }) {
  if (index == null || index < 0) return null;
  const positions = positionsRef.current;
  if (!positions) return null;
  const pos = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  const corner = {
    position: 'absolute',
    width: 10,
    height: 10,
    borderColor: '#ffffff',
    borderStyle: 'solid',
    filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.9)) drop-shadow(0 0 18px rgba(255,255,255,0.5))',
  };
  return (
    <Html position={pos} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        <div style={{ ...corner, top: 0,    left: 0,    borderWidth: '2px 0 0 2px' }} />
        <div style={{ ...corner, top: 0,    right: 0,   borderWidth: '2px 2px 0 0' }} />
        <div style={{ ...corner, bottom: 0, left: 0,    borderWidth: '0 0 2px 2px' }} />
        <div style={{ ...corner, bottom: 0, right: 0,   borderWidth: '0 2px 2px 0' }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 22, height: 22,
          transform: 'translate(-50%, -50%)',
          border: '1px solid rgba(255,255,255,0.85)',
          borderRadius: '50%',
          boxShadow: '0 0 10px rgba(255,255,255,0.6), inset 0 0 6px rgba(255,255,255,0.25)',
        }} />
      </div>
    </Html>
  );
}

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

export function Graph3D({ nodes, edges, selectedId, hoveredId, onSelect, onHover, onHide, hiddenIds, touchpoints, simRef }) {
  const sim = useSim(nodes, edges, { hiddenIds });

  // Expose the sim controls to callers outside the Canvas tree. useForceSim has
  // to live inside Canvas (it calls useFrame), so the App HUD can't call its
  // return value directly — it reads from this ref.
  useEffect(() => {
    if (simRef) simRef.current = { reheat: sim.reheat, freeze: sim.freeze, alpha: sim.alpha };
  }, [simRef, sim.reheat, sim.freeze, sim.alpha]);

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
        hiddenIds={hiddenIds}
      />
      <Nodes
        nodes={nodes}
        positionsRef={sim.positionsRef}
        dirtyRef={sim.dirtyRef}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelect}
        onHover={onHover}
        onHide={onHide}
        hiddenIds={hiddenIds}
        highlightedTypes={highlightedTypes}
      />
      {selectedId && selectedIdx != null && (
        <>
          <CaretMarker positionsRef={sim.positionsRef} index={selectedIdx} />
          <Label name={selectedId} positionsRef={sim.positionsRef} index={selectedIdx} variant="selected" />
        </>
      )}
      {hoveredId && hoveredId !== selectedId && hoveredIdx != null && (
        <Label name={hoveredId} positionsRef={sim.positionsRef} index={hoveredIdx} variant="hover" />
      )}
      <OrbitControls enableDamping dampingFactor={0.08} rotateSpeed={0.6} />
    </>
  );
}
