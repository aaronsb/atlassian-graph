const DEFAULTS = { repulsion: 120, attraction: 0.04, centerGravity: 0.004 };

const ROWS = [
  { key: 'repulsion',     label: 'repulsion',   min: 0, max: 400,  step: 1,      hint: 'pushback between nodes' },
  { key: 'attraction',    label: 'attraction',  min: 0, max: 0.2,  step: 0.001,  hint: 'edge spring strength' },
  { key: 'centerGravity', label: 'gravity',     min: 0, max: 0.05, step: 0.0005, hint: 'pull toward center' },
];

export function PhysicsPanel({ physics, setPhysics }) {
  const set = (key, value) => setPhysics(p => ({ ...p, [key]: value }));
  const reset = () => setPhysics(DEFAULTS);

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
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ fontWeight: 600 }}>Physics</span>
        <button
          onClick={reset}
          style={{
            background: '#26263a', color: '#d7d7e0',
            border: '1px solid #3a3a52',
            padding: '2px 8px', borderRadius: 2,
            fontSize: 10, cursor: 'pointer',
          }}
          title="Reset physics parameters to their defaults"
        >
          reset
        </button>
      </div>
      {ROWS.map(r => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <label
            title={r.hint}
            style={{
              width: 72, color: '#9098b0', fontSize: 10,
              fontFamily: 'SF Mono, Menlo, monospace',
            }}
          >
            {r.label}
          </label>
          <input
            type="range"
            min={r.min}
            max={r.max}
            step={r.step}
            value={physics[r.key]}
            onChange={e => set(r.key, parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: '#7aa2f7' }}
          />
          <span style={{
            width: 54, textAlign: 'right',
            fontFamily: 'SF Mono, Menlo, monospace',
            fontSize: 10, color: '#d7d7e0',
          }}>
            {r.step < 1 ? physics[r.key].toFixed(r.step < 0.001 ? 4 : 3) : physics[r.key].toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}
