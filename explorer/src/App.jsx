import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSchemaGraph } from './hooks/useSchemaGraph.js';
import { Graph3D } from './scene/Graph3D.jsx';
import { gpuSimSupported } from './scene/useGpuForceSim.js';
import { colorFor } from './scene/categoryColors.js';
import { Sidebar } from './Sidebar.jsx';
import { QueryPanel } from './QueryPanel.jsx';

const CAP_PRESETS = [250, 500, 1000, 2000, 5000];
const CAP_MAX = 99999; // effectively "all" — more than the total filtered nodes

function HUD({ graph, selectedId, hoveredId, touchpoints, knownTypes, cap, setCap, onReheat, onFreeze }) {
  const offScene = useMemo(() => {
    if (!touchpoints || !knownTypes || knownTypes.size === 0) return 0;
    let n = 0;
    for (const t of touchpoints) {
      const parentIn = !t.parentType || knownTypes.has(t.parentType);
      const returnIn = !t.returns || knownTypes.has(t.returns);
      if (!parentIn || !returnIn) n++;
    }
    return n;
  }, [touchpoints, knownTypes]);

  return (
    <div style={{
      position: 'fixed', top: 12, left: 12,
      background: 'rgba(19,19,28,0.9)',
      border: '1px solid #26263a',
      padding: '10px 14px',
      borderRadius: 4,
      backdropFilter: 'blur(6px)',
      fontSize: 12,
      zIndex: 10,
      minWidth: 240,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Atlassian Graph Explorer</span>
        <span
          title={gpuSimSupported ? 'Force sim running on GPU' : 'Force sim running on CPU (WebGL2 float RT unavailable)'}
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 2,
            background: gpuSimSupported ? '#1d3a1d' : '#3a1d1d',
            color: gpuSimSupported ? '#8ee68e' : '#ffa8a8',
            border: '1px solid ' + (gpuSimSupported ? '#2f5a2f' : '#5a2f2f'),
            fontFamily: 'SF Mono, Menlo, monospace',
            letterSpacing: 0.3,
          }}
        >
          {gpuSimSupported ? 'GPU' : 'CPU'}
        </span>
      </div>
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
        <div style={{ color: '#d7d7e0', fontSize: 11, marginTop: 6, fontFamily: 'SF Mono, Menlo, monospace' }}>
          {selectedId && <>selected: {selectedId}</>}
          {!selectedId && hoveredId && <>hover: {hoveredId}</>}
        </div>
      )}

      {touchpoints && touchpoints.length > 0 && (
        <div style={{ color: '#7aa2f7', fontSize: 11, marginTop: 6 }}>
          {touchpoints.length} query touchpoints
          {offScene > 0 && (
            <span style={{ color: '#ffd43b', marginLeft: 6 }}>
              ({offScene} not in scene)
            </span>
          )}
        </div>
      )}

      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: '1px solid #26263a',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <label style={{ color: '#7a7a92', fontSize: 10 }}>cap</label>
        <input
          type="number"
          value={cap}
          min={50}
          max={14000}
          step={100}
          onChange={e => setCap(Math.max(50, Math.min(14000, parseInt(e.target.value, 10) || 500)))}
          style={{
            width: 70, background: '#0a0a0f', color: '#d7d7e0',
            border: '1px solid #26263a', borderRadius: 3,
            padding: '3px 6px', fontSize: 11,
            fontFamily: 'SF Mono, Menlo, monospace', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {CAP_PRESETS.map(n => (
            <button
              key={n}
              onClick={() => setCap(n)}
              style={{
                background: cap === n ? '#7aa2f7' : '#26263a',
                color: cap === n ? '#000' : '#d7d7e0',
                border: '1px solid ' + (cap === n ? '#7aa2f7' : '#3a3a52'),
                padding: '2px 6px', borderRadius: 2,
                fontSize: 10, cursor: 'pointer',
                fontWeight: cap === n ? 600 : 400,
              }}
            >
              {n >= 1000 ? `${n / 1000}k` : n}
            </button>
          ))}
          <button
            onClick={() => setCap(CAP_MAX)}
            title={gpuSimSupported
              ? 'Load all available types.'
              : 'Load all available types. Expensive — the CPU force sim crawls past a few thousand nodes.'}
            style={{
              background: cap === CAP_MAX ? '#ffa8a8' : '#26263a',
              color: cap === CAP_MAX ? '#000' : '#ffa8a8',
              border: '1px solid ' + (cap === CAP_MAX ? '#ffa8a8' : '#3a3a52'),
              padding: '2px 6px', borderRadius: 2,
              fontSize: 10, cursor: 'pointer',
              fontWeight: cap === CAP_MAX ? 600 : 400,
            }}
          >
            ⚠ max
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={onReheat}
            style={{
              background: '#26263a', color: '#d7d7e0',
              border: '1px solid #3a3a52',
              padding: '2px 8px', borderRadius: 2,
              fontSize: 10, cursor: 'pointer',
            }}
            title="Reheat the force simulation"
          >
            ↻ reheat
          </button>
          <button
            onClick={onFreeze}
            style={{
              background: '#26263a', color: '#d7d7e0',
              border: '1px solid #3a3a52',
              padding: '2px 8px', borderRadius: 2,
              fontSize: 10, cursor: 'pointer',
            }}
            title="Freeze the simulation in place"
          >
            ❄ freeze
          </button>
        </div>
      </div>

      {cap > 2000 && !gpuSimSupported && (
        <div style={{ color: '#ffa8a8', fontSize: 10, marginTop: 6 }}>
          CPU sim gets slow past ~2000 nodes.
        </div>
      )}
    </div>
  );
}

function HiddenPanel({ hiddenIds, nodes, onUnhide, onUnhideAll }) {
  if (hiddenIds.size === 0) return null;
  const byName = new Map();
  if (nodes) for (const n of nodes) byName.set(n.name, n);
  const sorted = Array.from(hiddenIds).sort();

  return (
    <div style={{
      background: 'rgba(19,19,28,0.9)',
      border: '1px solid #26263a',
      padding: '10px 14px',
      borderRadius: 4,
      backdropFilter: 'blur(6px)',
      fontSize: 12,
      minWidth: 240,
      maxWidth: 300,
      maxHeight: 280,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ fontWeight: 600 }}>Hidden ({hiddenIds.size})</span>
        <button
          onClick={onUnhideAll}
          style={{
            background: '#26263a', color: '#d7d7e0',
            border: '1px solid #3a3a52',
            padding: '2px 8px', borderRadius: 2,
            fontSize: 10, cursor: 'pointer',
          }}
          title="Restore every hidden node"
        >
          unhide all
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map(name => {
          const node = byName.get(name);
          const swatch = node ? colorFor(node.category) : '#94a3b8';
          return (
            <div
              key={name}
              onClick={() => onUnhide(name)}
              title="Click to unhide"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 6px', borderRadius: 2, cursor: 'pointer',
                fontFamily: 'SF Mono, Menlo, monospace', fontSize: 11,
                color: '#d7d7e0',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#26263a')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: swatch, flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [cap, setCap] = useState(500);
  const graph = useSchemaGraph({ cap });
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [touchpoints, setTouchpoints] = useState([]);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const simRef = useRef({ reheat: () => {}, freeze: () => {}, alpha: 1 });

  const knownTypes = useMemo(
    () => new Set(graph.nodes ? graph.nodes.map(n => n.name) : []),
    [graph.nodes]
  );

  const handleTouchpoints = useCallback(tps => setTouchpoints(tps), []);
  const handleReheat = useCallback(() => simRef.current.reheat?.(), []);
  const handleFreeze = useCallback(() => simRef.current.freeze?.(), []);
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
        />
        <HiddenPanel
          hiddenIds={hiddenIds}
          nodes={graph.nodes}
          onUnhide={handleUnhide}
          onUnhideAll={handleUnhideAll}
        />
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
