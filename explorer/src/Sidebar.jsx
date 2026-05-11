import { useTypeDetails, renderTypeRef, unwrapTypeRef } from './hooks/useTypeDetails.js';
import { usePalette } from './scene/palette.jsx';

const SIDEBAR_WIDTH = 380;
const SIDEBAR_COLLAPSED_WIDTH = 32;

const styles = {
  container: {
    position: 'fixed', top: 0, bottom: 0, right: 0,
    background: '#13131c', borderLeft: '1px solid #26263a',
    boxSizing: 'border-box',
    fontSize: 13,
    color: '#d7d7e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    zIndex: 5,
    display: 'flex', flexDirection: 'column',
  },
  body: {
    flex: 1, overflowY: 'auto', padding: 16,
  },
  collapseHandle: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: SIDEBAR_COLLAPSED_WIDTH, height: 60,
    cursor: 'pointer', userSelect: 'none',
    color: '#7a7a92', fontSize: 11, letterSpacing: '0.3px',
    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    borderBottom: '1px solid #26263a',
  },
  collapseToggle: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', borderBottom: '1px solid #26263a',
    fontSize: 11, color: '#7a7a92',
    cursor: 'pointer', userSelect: 'none',
  },
  empty: { color: '#7a7a92', fontSize: 12, fontStyle: 'italic', marginTop: 20 },
  h2: { fontSize: 16, margin: '0 0 6px', wordBreak: 'break-all' },
  kind: {
    display: 'inline-block', fontSize: 10, color: '#7a7a92',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 8,
  },
  catBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 3,
    fontSize: 10, marginBottom: 12, color: '#000', fontWeight: 600,
  },
  desc: { color: '#7a7a92', fontSize: 12, lineHeight: 1.5, margin: '0 0 14px' },
  sectionHeader: {
    fontSize: 11, color: '#7a7a92', textTransform: 'uppercase',
    letterSpacing: '0.5px', margin: '18px 0 6px',
  },
  field: { padding: '6px 0', borderBottom: '1px solid #26263a' },
  fieldLast: { padding: '6px 0' },
  fieldName: { color: '#d7d7e0', fontWeight: 500 },
  fieldType: {
    color: '#7aa2f7', fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: 11, marginTop: 2,
  },
  fieldTypeLink: { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' },
  fieldDesc: { color: '#7a7a92', fontSize: 11, marginTop: 3 },
  args: { color: '#a18072', fontSize: 10, marginTop: 2, fontFamily: '"SF Mono", Menlo, monospace' },
};

function stripAuthBlurb(desc) {
  if (!desc) return '';
  const idx = desc.indexOf('|Authentication Category');
  return (idx === -1 ? desc : desc.slice(0, idx)).trim();
}

function FieldRow({ field, isLast, knownTypes, onNavigate }) {
  const returnTypeName = unwrapTypeRef(field.type);
  const isLinked = returnTypeName && knownTypes.has(returnTypeName);
  return (
    <div style={isLast ? styles.fieldLast : styles.field}>
      <div style={styles.fieldName}>{field.name}</div>
      <div
        style={{ ...styles.fieldType, ...(isLinked ? styles.fieldTypeLink : {}) }}
        onClick={isLinked ? () => onNavigate(returnTypeName) : undefined}
      >
        {renderTypeRef(field.type)}
      </div>
      {field.args && field.args.length > 0 && (
        <div style={styles.args}>
          ({field.args.map(a => `${a.name}: ${renderTypeRef(a.type)}`).join(', ')})
        </div>
      )}
      {stripAuthBlurb(field.description) && (
        <div style={styles.fieldDesc}>{stripAuthBlurb(field.description)}</div>
      )}
    </div>
  );
}

export function Sidebar({ selectedId, onNavigate, knownTypes, collapsed, setCollapsed }) {
  const { colorFor } = usePalette();
  const { loading, error, data } = useTypeDetails(selectedId);

  if (collapsed) {
    return (
      <aside style={{ ...styles.container, width: SIDEBAR_COLLAPSED_WIDTH }}>
        <div style={styles.collapseHandle} onClick={() => setCollapsed(false)} title="Expand inspector">
          ▲ INSPECTOR {selectedId ? `· ${selectedId}` : ''}
        </div>
      </aside>
    );
  }

  const fullStyle = { ...styles.container, width: SIDEBAR_WIDTH };
  const header = (
    <div style={styles.collapseToggle} onClick={() => setCollapsed(true)}>
      <span>INSPECTOR</span>
      <span>▶ collapse</span>
    </div>
  );

  if (!selectedId) {
    return (
      <aside style={fullStyle}>
        {header}
        <div style={{ ...styles.body }}>
          <div style={styles.empty}>
            Click a node to inspect its fields, arguments, and relationships.
          </div>
        </div>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside style={fullStyle}>
        {header}
        <div style={{ ...styles.body }}><div style={styles.empty}>Loading {selectedId}…</div></div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside style={fullStyle}>
        {header}
        <div style={{ ...styles.body }}><div style={{ ...styles.empty, color: '#ff6b9d' }}>Error: {error}</div></div>
      </aside>
    );
  }

  if (!data) return <aside style={fullStyle}>{header}</aside>;

  const category = data.category || 'uncategorized';
  const color = colorFor(category);
  const visibleDesc = stripAuthBlurb(data.description);
  const fields = data.fields || [];
  const inputFields = data.inputFields || [];

  return (
    <aside style={fullStyle}>
      {header}
      <div style={styles.body}>
      <span style={styles.kind}>{data.kind}</span>
      <h2 style={styles.h2}>{data.name}</h2>
      <span style={{ ...styles.catBadge, background: color }}>{category}</span>
      {visibleDesc && <p style={styles.desc}>{visibleDesc}</p>}
      <div style={{ color: '#7a7a92', fontSize: 11 }}>
        degree: {data.degree}
        {data.interfaces && data.interfaces.length > 0 && (
          <> · implements {data.interfaces.map(i => i.name).join(', ')}</>
        )}
      </div>

      {fields.length > 0 && (
        <>
          <div style={styles.sectionHeader}>Fields ({fields.length})</div>
          {fields.map((f, i) => (
            <FieldRow
              key={f.name}
              field={f}
              isLast={i === fields.length - 1}
              knownTypes={knownTypes}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}

      {inputFields.length > 0 && (
        <>
          <div style={styles.sectionHeader}>Input Fields ({inputFields.length})</div>
          {inputFields.map((f, i) => (
            <FieldRow
              key={f.name}
              field={f}
              isLast={i === inputFields.length - 1}
              knownTypes={knownTypes}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}

      {data.enumValues && data.enumValues.length > 0 && (
        <>
          <div style={styles.sectionHeader}>Enum Values ({data.enumValues.length})</div>
          {data.enumValues.map(v => (
            <div key={v.name} style={styles.field}>
              <div style={styles.fieldName}>{v.name}</div>
              {stripAuthBlurb(v.description) && (
                <div style={styles.fieldDesc}>{stripAuthBlurb(v.description)}</div>
              )}
            </div>
          ))}
        </>
      )}
      </div>
    </aside>
  );
}

export const sidebarWidthFor = (collapsed) => collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
