import { usePalette } from '../scene/palette.jsx';

export function HiddenPanel({ hiddenIds, nodes, onUnhide, onUnhideAll }) {
  const { colorFor } = usePalette();
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
