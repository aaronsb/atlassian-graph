import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSchemaGraph } from './hooks/useSchemaGraph.js';
import { Graph3D } from './scene/Graph3D.jsx';
import { Sidebar } from './Sidebar.jsx';
import { QueryPanel } from './QueryPanel.jsx';
import { HUD } from './panels/HUD.jsx';
import { HiddenPanel } from './panels/HiddenPanel.jsx';
import { PhysicsPanel } from './panels/PhysicsPanel.jsx';
import { RampPicker } from './panels/RampPicker.jsx';

export default function App() {
  const [cap, setCap] = useState(500);
  const graph = useSchemaGraph({ cap });
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [touchpoints, setTouchpoints] = useState([]);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [simmering, setSimmering] = useState(false);
  const [physics, setPhysics] = useState({
    repulsion: 120,
    attraction: 0.04,
    centerGravity: 0.004,
  });
  const simRef = useRef({ reheat: () => {}, freeze: () => {}, simmer: () => {}, alpha: 1 });

  const knownTypes = useMemo(
    () => new Set(graph.nodes ? graph.nodes.map(n => n.name) : []),
    [graph.nodes]
  );

  const handleTouchpoints = useCallback(tps => setTouchpoints(tps), []);
  const handleReheat = useCallback(() => simRef.current.reheat?.(), []);
  const handleFreeze = useCallback(() => {
    setSimmering(false);
    simRef.current.freeze?.();
  }, []);
  const handleSimmer = useCallback(() => {
    setSimmering(prev => {
      const next = !prev;
      simRef.current.simmer?.(next);
      return next;
    });
  }, []);
  // After any visibility change, kick the sim so the layout can re-settle
  // around the new set of participating nodes.
  const handleHide = useCallback(id => {
    setHiddenIds(s => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
    simRef.current.reheat?.();
  }, []);
  const handleUnhide = useCallback(id => {
    setHiddenIds(s => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    simRef.current.reheat?.();
  }, []);
  const handleUnhideAll = useCallback(() => {
    setHiddenIds(new Set());
    simRef.current.reheat?.();
  }, []);

  // Clear selection when the cap changes and the previously-selected node is
  // pruned out of the scene — prevents a ghost selection in the HUD.
  useEffect(() => {
    if (selectedId && knownTypes.size > 0 && !knownTypes.has(selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, knownTypes]);

  // Clear selection/hover if the target gets hidden — otherwise the HUD shows
  // a "selected:" for something the user just asked to make invisible.
  useEffect(() => {
    if (selectedId && hiddenIds.has(selectedId)) setSelectedId(null);
    if (hoveredId && hiddenIds.has(hoveredId)) setHoveredId(null);
  }, [selectedId, hoveredId, hiddenIds]);

  // Drop stale entries if the graph reloads and a hidden name no longer exists.
  useEffect(() => {
    if (hiddenIds.size === 0 || knownTypes.size === 0) return;
    let changed = false;
    const next = new Set();
    for (const id of hiddenIds) {
      if (knownTypes.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setHiddenIds(next);
  }, [hiddenIds, knownTypes]);

  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <HUD
          graph={graph}
          selectedId={selectedId}
          hoveredId={hoveredId}
          touchpoints={touchpoints}
          knownTypes={knownTypes}
          cap={cap}
          setCap={setCap}
          onReheat={handleReheat}
          onFreeze={handleFreeze}
          onSimmer={handleSimmer}
          simmering={simmering}
        />
        <HiddenPanel
          hiddenIds={hiddenIds}
          nodes={graph.nodes}
          onUnhide={handleUnhide}
          onUnhideAll={handleUnhideAll}
        />
        <PhysicsPanel physics={physics} setPhysics={setPhysics} />
        <RampPicker />
      </div>
      <div
        style={{ position: 'fixed', top: 0, bottom: 320, left: 0, right: 380 }}
        onContextMenu={e => e.preventDefault()}
      >
        <Canvas frameloop="demand" flat camera={{ position: [0, 0, 300], fov: 55, far: 10000 }}>
          {graph.nodes && (
            <Graph3D
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
              onHide={handleHide}
              hiddenIds={hiddenIds}
              touchpoints={touchpoints}
              simRef={simRef}
              physics={physics}
            />
          )}
        </Canvas>
      </div>
      <Sidebar
        selectedId={selectedId}
        onNavigate={setSelectedId}
        knownTypes={knownTypes}
      />
      <QueryPanel onTouchpointsChange={handleTouchpoints} />
    </>
  );
}
