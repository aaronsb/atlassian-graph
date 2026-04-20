import { useMemo } from 'react';
import { gpuSimSupported } from '../scene/useGpuForceSim.js';

const CAP_PRESETS = [250, 500, 1000, 2000, 5000];
const CAP_MAX = 99999; // effectively "all" — more than the total filtered nodes

export function HUD({ graph, selectedId, hoveredId, touchpoints, knownTypes, cap, setCap, onReheat, onFreeze, onSimmer, simmering }) {
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
      background: 'rgba(19,19,28,0.9)',
      border: '1px solid #26263a',
      padding: '10px 14px',
      borderRadius: 4,
      backdropFilter: 'blur(6px)',
      fontSize: 12,
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

      {/* Always render this row at a fixed height so hovering doesn't
          flicker the HUD vertically. Width grows naturally with the text. */}
      <div style={{
        color: '#d7d7e0',
        fontSize: 11,
        marginTop: 6,
        fontFamily: 'SF Mono, Menlo, monospace',
        height: 14,
        lineHeight: '14px',
      }}>
        {selectedId ? `selected: ${selectedId}`
         : hoveredId ? `hover: ${hoveredId}`
         : '\u00A0'}
      </div>

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
            onClick={onSimmer}
            style={{
              background: simmering ? '#ff922b' : '#26263a',
              color: simmering ? '#000' : '#d7d7e0',
              border: '1px solid ' + (simmering ? '#ff922b' : '#3a3a52'),
              padding: '2px 8px', borderRadius: 2,
              fontSize: 10, cursor: 'pointer',
              fontWeight: simmering ? 600 : 400,
            }}
            title={simmering ? 'Simmering — click to stop' : 'Simmer — keep the sim running at a steady low alpha'}
          >
            ♨ simmer
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
