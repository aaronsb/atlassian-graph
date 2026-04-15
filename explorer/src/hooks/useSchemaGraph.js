import { useEffect, useState } from 'react';

export function useSchemaGraph({ kinds, includeRelay, cap } = {}) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    nodes: null,
    edges: null,
    byName: null,
    meta: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (kinds) params.set('kinds', kinds);
    if (includeRelay) params.set('includeRelay', 'true');
    if (cap != null) params.set('cap', String(cap));
    const url = '/api/graph' + (params.toString() ? '?' + params : '');

    setState(s => ({ ...s, loading: true, error: null }));

    fetch(url, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const byName = new Map(data.nodes.map(n => [n.name, n]));
        setState({
          loading: false,
          error: null,
          nodes: data.nodes,
          edges: data.edges,
          byName,
          meta: data.meta,
        });
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setState(s => ({ ...s, loading: false, error: err.message }));
      });

    return () => controller.abort();
  }, [kinds, includeRelay, cap]);

  return state;
}
