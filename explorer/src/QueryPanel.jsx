import { useCallback, useEffect, useState } from 'react';

const styles = {
  container: {
    position: 'fixed', left: 0, right: 380, bottom: 0,
    background: '#13131c', borderTop: '1px solid #26263a',
    color: '#d7d7e0', fontSize: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    zIndex: 6,
    display: 'flex', flexDirection: 'column',
    transition: 'height 180ms ease',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 14px', borderBottom: '1px solid #26263a',
    fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
    cursor: 'pointer', userSelect: 'none',
  },
  body: {
    flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
    overflow: 'hidden',
  },
  editor: {
    display: 'flex', flexDirection: 'column',
    borderRight: '1px solid #26263a',
  },
  textarea: {
    flex: 1, background: '#0a0a0f', color: '#d7d7e0',
    border: 'none', padding: '10px 14px',
    fontFamily: '"SF Mono", Menlo, monospace', fontSize: 11,
    resize: 'none', outline: 'none',
  },
  controls: {
    display: 'flex', gap: 8, padding: '8px 14px',
    borderTop: '1px solid #26263a',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  button: {
    background: '#26263a', color: '#d7d7e0',
    border: '1px solid #3a3a52',
    padding: '4px 12px', borderRadius: 3,
    fontSize: 11, cursor: 'pointer',
  },
  buttonPrimary: {
    background: '#7aa2f7', color: '#000', borderColor: '#7aa2f7',
    fontWeight: 600,
  },
  buttonDisabled: {
    opacity: 0.4, cursor: 'not-allowed',
  },
  input: {
    background: '#0a0a0f', color: '#d7d7e0',
    border: '1px solid #26263a', borderRadius: 3,
    padding: '4px 8px', fontSize: 11,
    fontFamily: '"SF Mono", Menlo, monospace',
    outline: 'none',
    width: 110,
  },
  divider: {
    width: 1, height: 18, background: '#26263a', margin: '0 4px',
  },
  status: {
    color: '#7a7a92', fontSize: 10, marginLeft: 'auto',
  },
  statusOk: { color: '#94d82d' },
  statusErr: { color: '#ff6b9d' },
  results: {
    overflowY: 'auto', padding: '10px 14px',
  },
  sectionHeader: {
    fontSize: 10, color: '#7a7a92', textTransform: 'uppercase',
    letterSpacing: '0.5px', margin: '0 0 6px',
  },
  touchpoint: {
    fontFamily: '"SF Mono", Menlo, monospace', fontSize: 11,
    padding: '3px 0',
    color: '#d7d7e0',
  },
  arrow: { color: '#7a7a92' },
  returnTy: { color: '#7aa2f7' },
  errBox: {
    background: 'rgba(255,107,157,0.1)', border: '1px solid #ff6b9d',
    color: '#ff6b9d', padding: 8, borderRadius: 3, fontSize: 11,
    fontFamily: '"SF Mono", Menlo, monospace',
    marginBottom: 8,
  },
  resultPre: {
    fontFamily: '"SF Mono", Menlo, monospace', fontSize: 10,
    background: '#0a0a0f', padding: 8, borderRadius: 3,
    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: 200, overflowY: 'auto',
  },
};

const PLACEHOLDER = `# Try a query — touchpoints will populate as you type.
query GetIssue($key: String!, $cloudId: ID!) {
  jira {
    issueByKey(key: $key, cloudId: $cloudId) {
      id
      webUrl
    }
  }
}`;

export function QueryPanel({ onTouchpointsChange }) {
  const [query, setQuery] = useState(PLACEHOLDER);
  const [collapsed, setCollapsed] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [specName, setSpecName] = useState('');
  const [queryName, setQueryName] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);

  // Debounced auto-parse
  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query.trim()) {
        setParseResult(null);
        return;
      }
      fetch('/api/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
        .then(r => r.json())
        .then(setParseResult)
        .catch(err => setParseResult({ ok: false, error: err.message, touchpoints: [] }));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  // Push touchpoints upward whenever they change
  useEffect(() => {
    if (!onTouchpointsChange) return;
    if (parseResult && parseResult.ok) {
      onTouchpointsChange(parseResult.touchpoints);
    } else {
      onTouchpointsChange([]);
    }
  }, [parseResult, onTouchpointsChange]);

  const saveToSpec = useCallback(async () => {
    if (!specName.trim() || !queryName.trim()) {
      setSaveStatus({ ok: false, msg: 'spec name and query name required' });
      return;
    }
    setSaveStatus({ ok: null, msg: 'saving…' });
    try {
      const r = await fetch(`/api/specs/${encodeURIComponent(specName.trim())}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryName: queryName.trim(), query, variables: {} }),
      });
      const data = await r.json();
      if (!r.ok) {
        setSaveStatus({ ok: false, msg: data.error || 'save failed' });
        return;
      }
      const verb = data.replaced ? 'replaced' : 'added';
      setSaveStatus({
        ok: true,
        msg: `${verb} · ${specName}.json now has ${data.spec.queries.length} quer${data.spec.queries.length === 1 ? 'y' : 'ies'}`,
      });
    } catch (err) {
      setSaveStatus({ ok: false, msg: err.message });
    }
  }, [specName, queryName, query]);

  const runQuery = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const r = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: {} }),
      });
      const data = await r.json();
      setRunResult(data);
    } catch (err) {
      setRunResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  }, [query]);

  const touchpoints = parseResult?.touchpoints || [];
  const parseError = parseResult && !parseResult.ok ? parseResult.error : null;

  if (collapsed) {
    return (
      <div style={{ ...styles.container, height: 32 }}>
        <div style={styles.header} onClick={() => setCollapsed(false)}>
          <span>QUERY WORKBENCH</span>
          <span style={{ color: '#7a7a92' }}>▲ expand</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, height: 320 }}>
      <div style={styles.header} onClick={() => setCollapsed(true)}>
        <span>QUERY WORKBENCH {touchpoints.length > 0 && <span style={{ color: '#7a7a92' }}>· {touchpoints.length} touchpoints</span>}</span>
        <span style={{ color: '#7a7a92' }}>▼ collapse</span>
      </div>
      <div style={styles.body}>
        <div style={styles.editor}>
          <textarea
            style={styles.textarea}
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
          />
          <div style={styles.controls}>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary, ...(running ? styles.buttonDisabled : {}) }}
              onClick={runQuery}
              disabled={running}
            >
              {running ? 'Running…' : 'Run'}
            </button>
            <span style={{ color: '#7a7a92', fontSize: 10 }}>
              {parseError ? '✗ syntax error' : parseResult?.ok ? '✓ parsed' : '…'}
            </span>
            <span style={styles.divider} />
            <input
              style={styles.input}
              placeholder="spec name"
              value={specName}
              onChange={e => setSpecName(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="query name"
              value={queryName}
              onChange={e => setQueryName(e.target.value)}
            />
            <button
              style={{ ...styles.button, ...((!specName.trim() || !queryName.trim() || !parseResult?.ok) ? styles.buttonDisabled : {}) }}
              onClick={saveToSpec}
              disabled={!specName.trim() || !queryName.trim() || !parseResult?.ok}
            >
              + Save
            </button>
            {saveStatus && (
              <span style={{
                ...styles.status,
                ...(saveStatus.ok === true ? styles.statusOk : saveStatus.ok === false ? styles.statusErr : {}),
              }}>
                {saveStatus.msg}
              </span>
            )}
          </div>
        </div>
        <div style={styles.results}>
          {parseError && <div style={styles.errBox}>{parseError}</div>}
          {touchpoints.length > 0 && (
            <>
              <div style={styles.sectionHeader}>Touchpoints ({touchpoints.length})</div>
              {touchpoints.map(t => (
                <div key={`${t.parentType}.${t.field}`} style={styles.touchpoint}>
                  {t.parentType}<span style={styles.arrow}>.</span>{t.field}
                  {t.returns && <> <span style={styles.arrow}>→</span> <span style={styles.returnTy}>{t.returns}</span></>}
                </div>
              ))}
            </>
          )}
          {runResult && (
            <>
              <div style={{ ...styles.sectionHeader, marginTop: 12 }}>
                Result {runResult.elapsed != null && `· ${runResult.elapsed}ms`}
                {runResult.errors && ` · ${runResult.errors.length} error(s)`}
              </div>
              <pre style={styles.resultPre}>
                {JSON.stringify(runResult.errors || runResult.data || runResult, null, 2)}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
