import { usePalette } from '../scene/palette.jsx';

export function RampPicker() {
  const { ramps, activeRampId, setActiveRampId } = usePalette();
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
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Color ramp</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ramps.map(r => {
          const isActive = r.id === activeRampId;
          return (
            <div
              key={r.id}
              onClick={() => setActiveRampId(r.id)}
              title={`Apply ${r.label}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 6px', borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid ' + (isActive ? '#7aa2f7' : 'transparent'),
                background: isActive ? 'rgba(122,162,247,0.08)' : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#26263a'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                width: 90,
                fontFamily: 'SF Mono, Menlo, monospace',
                fontSize: 10,
                color: isActive ? '#d7d7e0' : '#9098b0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {r.label}
              </span>
              <div style={{
                flex: 1, height: 12, borderRadius: 2,
                background: r.gradientCss,
                border: '1px solid rgba(255,255,255,0.08)',
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
