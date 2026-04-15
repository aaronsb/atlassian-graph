import { useCallback, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSchemaGraph } from './hooks/useSchemaGraph.js';
import { Graph3D } from './scene/Graph3D.jsx';
import { Sidebar } from './Sidebar.jsx';
import { QueryPanel } from './QueryPanel.jsx';

function HUD({ graph, selectedId, hoveredId, touchpointCount }) {
  return (
    <div style={{
      position: 'fixed', top: 12, left: 12,
      background: 'rgba(19,19,28,0.85)',
      border: '1px solid #26263a',
      padding: '10px 14px',
      borderRadius: 4,
      backdropFilter: 'blur(6px)',
      fontSize: 12,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Atlassian Graph Explorer</div>
      <div style={{ color: '#7a7a92', fontSize: 11 }}>
        {graph.loading && 'Loading graph…'}
        {graph.error && <span style={{ color: '#ff6b9d' }}>Error: {graph.error}</span>}
        {graph.nodes && (
          <>
            {graph.nodes.length.toLocaleString()} nodes ·{' '}
            {graph.edges.length.toLocaleString()} edges
          </>
        )}
      </div>
      {(selectedId || hoveredId) && (
        <div style={{ color: '#d7d7e0', fontSize: 11, marginTop: 4, fontFamily: 'SF Mono, Menlo, monospace' }}>
          {selectedId && <>selected: {selectedId}</>}
          {!selectedId && hoveredId && <>hover: {hoveredId}</>}
        </div>
      )}
      {touchpointCount > 0 && (
        <div style={{ color: '#7aa2f7', fontSize: 11, marginTop: 4 }}>
          {touchpointCount} query touchpoints
        </div>
      )}
    </div>
  );
}

export default function App() {
  const graph = useSchemaGraph({ cap: 500 });
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [touchpoints, setTouchpoints] = useState([]);

  const knownTypes = useMemo(
    () => new Set(graph.nodes ? graph.nodes.map(n => n.name) : []),
    [graph.nodes]
  );

  const handleTouchpoints = useCallback(tps => setTouchpoints(tps), []);

  return (
    <>
      <HUD
        graph={graph}
        selectedId={selectedId}
        hoveredId={hoveredId}
        touchpointCount={touchpoints.length}
      />
      <div style={{ position: 'fixed', top: 0, bottom: 320, left: 0, right: 380 }}>
        <Canvas camera={{ position: [0, 0, 300], fov: 55, far: 10000 }}>
          {graph.nodes && (
            <Graph3D
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
              touchpoints={touchpoints}
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
