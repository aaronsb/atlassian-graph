import { useEffect, useState } from 'react';

export function useTypeDetails(typeName) {
  const [state, setState] = useState({ loading: false, error: null, data: null });

  useEffect(() => {
    if (!typeName) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null }));
    fetch(`/api/type/${encodeURIComponent(typeName)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setState({ loading: false, error: null, data }))
      .catch(err => {
        if (err.name === 'AbortError') return;
        setState({ loading: false, error: err.message, data: null });
      });
    return () => controller.abort();
  }, [typeName]);

  return state;
}

export function renderTypeRef(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return renderTypeRef(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + renderTypeRef(t.ofType) + ']';
  return t.name || '?';
}

export function unwrapTypeRef(t) {
  while (t && t.ofType) t = t.ofType;
  return t ? t.name : null;
}
