import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildClientSchema, parse, visit, TypeInfo, visitWithTypeInfo, getNamedType } from 'graphql';
import fs from 'fs/promises';
import { loadIndex } from './schema-index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.EXPLORER_PORT || 4000;

let index;
let clientSchema;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/config', (req, res) => {
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !apiToken) {
    return res.status(500).json({ error: 'Missing ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN in .env' });
  }
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  res.json({
    endpoint: 'https://api.atlassian.com/graphql',
    auth,
    accountId: process.env.ATLASSIAN_ACCOUNT_ID || '',
  });
});

app.get('/api/schema', (req, res) => {
  res.sendFile(join(__dirname, 'introspection-schema.json'));
});

app.get('/api/type/:name', (req, res) => {
  const t = index.getType(req.params.name);
  if (!t) return res.status(404).json({ error: `Type not found: ${req.params.name}` });
  const connectionOf = index.getConnectionInfo(t.name);
  const edgeOf = index.getEdgeInfo(t.name);
  const wrappedBy = index.getConnectionsForNode(t.name);
  res.json({
    name: t.name,
    kind: t.kind,
    description: t.description,
    category: index.getCategory(t.name),
    degree: index.getDegree(t.name),
    interfaces: t.interfaces || [],
    fields: t.fields || [],
    inputFields: t.inputFields || [],
    enumValues: t.enumValues || [],
    possibleTypes: t.possibleTypes || [],
    connectionOf: connectionOf || undefined,
    edgeOf: edgeOf || undefined,
    wrappedBy: wrappedBy.length > 0 ? wrappedBy : undefined,
  });
});

app.get('/api/field/:type/:field', (req, res) => {
  const f = index.getField(req.params.type, req.params.field);
  if (!f) return res.status(404).json({ error: `Field not found: ${req.params.type}.${req.params.field}` });
  res.json(f);
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase();
  const kind = (req.query.kind || '').toString().toUpperCase();
  const limit = parseInt(req.query.limit || '50', 10);
  const includeDescriptions = req.query.descriptions !== 'false';
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });

  const typeMatches = [];
  for (const [name, t] of index.byName) {
    if (kind && t.kind !== kind) continue;
    if (name.toLowerCase().includes(q)) {
      typeMatches.push({ name, kind: t.kind, category: index.getCategory(name), degree: index.getDegree(name) });
      if (typeMatches.length >= limit) break;
    }
  }

  const fieldMatches = [];
  for (const [, f] of index.fieldIndex) {
    if (f.name.toLowerCase().includes(q)) {
      fieldMatches.push({ parent: f.parent, field: f.name, returns: renderReturn(f.type) });
      if (fieldMatches.length >= limit) break;
    }
  }

  let descriptionMatches = [];
  if (includeDescriptions) {
    for (const [, f] of index.fieldIndex) {
      if (descriptionMatches.length >= limit) break;
      if (!f.description) continue;
      if (f.name.toLowerCase().includes(q)) continue; // already in fieldMatches
      const desc = f.description.toLowerCase();
      const idx = desc.indexOf(q);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 40);
      const end = Math.min(f.description.length, idx + q.length + 40);
      const snippet = (start > 0 ? '…' : '') + f.description.slice(start, end).trim() + (end < f.description.length ? '…' : '');
      descriptionMatches.push({
        parent: f.parent,
        field: f.name,
        returns: renderReturn(f.type),
        snippet,
      });
    }
  }

  res.json({ types: typeMatches, fields: fieldMatches, descriptions: descriptionMatches });
});

app.get('/api/categories', (req, res) => {
  const out = [];
  for (const cat of index.categoryOrder) {
    const arr = index.categoryIndex.get(cat);
    if (!arr || !arr.length) continue;
    const info = index.getCategoryInfo(cat);
    out.push({ id: cat, label: info?.label || cat, count: arr.length });
  }
  res.json(out);
});

app.get('/api/neighbors/:type', (req, res) => {
  const t = index.getType(req.params.type);
  if (!t) return res.status(404).json({ error: `Type not found: ${req.params.type}` });
  const depth = Math.min(parseInt(req.query.depth || '1', 10) || 1, 4);
  const direction = (req.query.direction || 'out').toString();
  if (!['out', 'in', 'both'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be out|in|both' });
  }
  const steps = index.getNeighbors(req.params.type, { depth, direction });
  res.json({ root: req.params.type, depth, direction, count: steps.length, steps });
});

app.get('/api/producers/:type', (req, res) => {
  const t = index.getType(req.params.type);
  if (!t) return res.status(404).json({ error: `Type not found: ${req.params.type}` });
  const producers = index.getProducers(req.params.type);
  res.json({
    type: req.params.type,
    count: producers.length,
    producers: producers.map(p => ({
      parent: p.parent,
      field: p.field,
      parentCategory: index.getCategory(p.parent),
    })),
  });
});

app.get('/api/consumers/:type', (req, res) => {
  const t = index.getType(req.params.type);
  if (!t) return res.status(404).json({ error: `Type not found: ${req.params.type}` });
  const consumers = index.getConsumers(req.params.type);
  res.json({
    type: req.params.type,
    count: consumers.length,
    consumers: consumers.map(c => ({
      parent: c.parent,
      field: c.field,
      arg: c.arg,
      parentCategory: index.getCategory(c.parent),
    })),
  });
});

app.get('/api/graph', (req, res) => {
  const kindsParam = (req.query.kinds || 'OBJECT,INTERFACE,UNION').toString();
  const allowedKinds = new Set(kindsParam.split(',').map(s => s.trim().toUpperCase()));
  const includeRelay = req.query.includeRelay === 'true';
  const cap = req.query.cap ? parseInt(req.query.cap, 10) : null;

  const isRelay = name => /Connection$/.test(name) || /Edge$/.test(name) || name === 'PageInfo';

  const nodeSet = new Set();
  const nodes = [];
  for (const [name, t] of index.byName) {
    if (name.startsWith('__')) continue;
    if (!allowedKinds.has(t.kind)) continue;
    if (!includeRelay && isRelay(name)) continue;
    nodes.push({
      name,
      kind: t.kind,
      category: index.getCategory(name),
      degree: index.getDegree(name),
    });
    nodeSet.add(name);
  }

  nodes.sort((a, b) => b.degree - a.degree);
  let kept = nodes;
  if (cap && Number.isFinite(cap)) {
    kept = nodes.slice(0, cap);
    nodeSet.clear();
    for (const n of kept) nodeSet.add(n.name);
  }

  const edges = [];
  const edgeSeen = new Set();
  for (const e of index.edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
    const key = e.from + '\x01' + e.field + '\x01' + e.to;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ from: e.from, field: e.field, to: e.to });
  }

  res.json({
    nodes: kept,
    edges,
    meta: {
      totalTypes: index.byName.size,
      keptTypes: kept.length,
      edgeCount: edges.length,
      kinds: [...allowedKinds],
      includeRelay,
      cap,
    },
  });
});

app.get('/api/stats', (req, res) => {
  const kinds = {};
  for (const [, t] of index.byName) {
    kinds[t.kind] = (kinds[t.kind] || 0) + 1;
  }
  const categories = {};
  for (const [cat, arr] of index.categoryIndex) {
    categories[cat] = arr.length;
  }
  const topConnected = [...index.degrees.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, degree]) => ({ name, degree, category: index.getCategory(name) }));
  res.json({
    types: index.byName.size,
    fields: index.fieldIndex.size,
    edges: index.edges.length,
    kinds,
    categories,
    topConnected,
    queryType: index.queryTypeName,
    mutationType: index.mutationTypeName,
    subscriptionType: index.subscriptionTypeName,
  });
});

app.get('/api/entry-points/:target', (req, res) => {
  const t = index.getType(req.params.target);
  if (!t) return res.status(404).json({ error: `Type not found: ${req.params.target}` });
  const from = (req.query.from || 'Query').toString();
  if (!index.getType(from)) return res.status(404).json({ error: `Root type not found: ${from}` });
  const maxHops = Math.min(parseInt(req.query.maxHops || '2', 10) || 2, 4);
  const maxResults = Math.min(parseInt(req.query.maxResults || '100', 10) || 100, 500);
  const paths = index.findEntryPoints(req.params.target, { from, maxHops, maxResults });
  res.json({
    target: req.params.target,
    from,
    maxHops,
    count: paths.length,
    paths,
  });
});

app.get('/api/path', (req, res) => {
  const from = (req.query.from || '').toString();
  const to = (req.query.to || '').toString();
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });
  if (!index.getType(from)) return res.status(404).json({ error: `Type not found: ${from}` });
  if (!index.getType(to)) return res.status(404).json({ error: `Type not found: ${to}` });
  const path = index.shortestPath(from, to);
  if (!path) return res.json({ from, to, found: false, steps: [] });
  res.json({ from, to, found: true, length: path.steps.length, steps: path.steps });
});

app.get('/api/category/:name', (req, res) => {
  const arr = index.categoryIndex.get(req.params.name);
  if (!arr) return res.status(404).json({ error: `Category not found: ${req.params.name}` });
  const info = index.getCategoryInfo(req.params.name);
  res.json({
    id: req.params.name,
    label: info?.label || req.params.name,
    types: arr.map(name => ({
      name,
      kind: index.getType(name)?.kind,
      degree: index.getDegree(name),
    })),
  });
});

const queryLog = [];
const QUERY_LOG_MAX = 50;

app.post('/api/parse-query', (req, res) => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query string' });
  }
  if (!clientSchema) {
    return res.status(503).json({ error: 'Schema not loaded yet' });
  }

  let document;
  try {
    document = parse(query);
  } catch (err) {
    return res.json({
      ok: false,
      error: err.message,
      operations: [],
      touchpoints: [],
    });
  }

  const operations = [];
  const touchpoints = [];
  const seenTouchpoints = new Set();
  const typeInfo = new TypeInfo(clientSchema);

  try {
    visit(document, visitWithTypeInfo(typeInfo, {
      OperationDefinition(node) {
        operations.push({
          name: node.name?.value || null,
          operation: node.operation,
        });
      },
      Field(node) {
        const parentType = typeInfo.getParentType();
        const fieldDef = typeInfo.getFieldDef();
        if (!parentType || !fieldDef) return;
        const returnNamed = getNamedType(typeInfo.getType());
        const key = `${parentType.name}.${fieldDef.name}`;
        if (seenTouchpoints.has(key)) return;
        seenTouchpoints.add(key);
        touchpoints.push({
          parentType: parentType.name,
          field: fieldDef.name,
          returns: returnNamed ? returnNamed.name : null,
        });
      },
    }));
  } catch (err) {
    return res.json({
      ok: false,
      error: err.message,
      operations,
      touchpoints,
    });
  }

  res.json({
    ok: true,
    operations,
    touchpoints,
    typeCount: new Set(touchpoints.flatMap(t => [t.parentType, t.returns].filter(Boolean))).size,
  });
});

app.post('/api/query', async (req, res) => {
  const { query, variables, operationName } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query string' });
  }
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !apiToken) {
    return res.status(500).json({ error: 'Missing ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN in .env' });
  }
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const started = Date.now();
  try {
    const upstream = await fetch('https://api.atlassian.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-ExperimentalApi': 'WorkManagementFields',
      },
      body: JSON.stringify({ query, variables: variables || {}, operationName: operationName || null }),
    });
    const elapsed = Date.now() - started;
    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    queryLog.unshift({
      ts: new Date().toISOString(),
      operationName: operationName || null,
      status: upstream.status,
      elapsed,
      query,
      variables: variables || {},
      hasErrors: !!(body && body.errors && body.errors.length),
    });
    if (queryLog.length > QUERY_LOG_MAX) queryLog.length = QUERY_LOG_MAX;

    res.status(upstream.status).json({ elapsed, ...body });
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
});

app.get('/api/query-log', (req, res) => {
  res.json({ count: queryLog.length, entries: queryLog });
});

const specsDir = join(__dirname, 'specs');

function safeSpecName(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return null;
  return name;
}

async function ensureSpecsDir() {
  await fs.mkdir(specsDir, { recursive: true });
}

app.get('/api/specs', async (req, res) => {
  try {
    await ensureSpecsDir();
    const files = await fs.readdir(specsDir);
    const specs = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(join(specsDir, f), 'utf-8');
        const data = JSON.parse(raw);
        specs.push({
          name: data.name || f.replace(/\.json$/, ''),
          description: data.description || '',
          queryCount: (data.queries || []).length,
          updatedAt: data.updatedAt || null,
        });
      } catch {}
    }
    res.json({ specs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/specs/:name', async (req, res) => {
  const name = safeSpecName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid spec name (use a-z, 0-9, _, -)' });
  try {
    const raw = await fs.readFile(join(specsDir, `${name}.json`), 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Spec not found' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/specs/:name/queries', async (req, res) => {
  const name = safeSpecName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid spec name (use a-z, 0-9, _, -)' });
  const { queryName, description, query, variables } = req.body || {};
  if (!queryName || !query) {
    return res.status(400).json({ error: 'queryName and query are required' });
  }
  try {
    await ensureSpecsDir();
    const path = join(specsDir, `${name}.json`);
    let spec;
    try {
      const raw = await fs.readFile(path, 'utf-8');
      spec = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      spec = { name, description: '', queries: [] };
    }
    if (!Array.isArray(spec.queries)) spec.queries = [];
    const existingIdx = spec.queries.findIndex(q => q.name === queryName);
    const entry = {
      name: queryName,
      description: description || '',
      query,
      variables: variables || {},
      updatedAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      spec.queries[existingIdx] = entry;
    } else {
      spec.queries.push(entry);
    }
    spec.updatedAt = entry.updatedAt;
    await fs.writeFile(path, JSON.stringify(spec, null, 2));
    res.json({ spec, replaced: existingIdx >= 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/specs/:name', async (req, res) => {
  const name = safeSpecName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid spec name' });
  try {
    await fs.unlink(join(specsDir, `${name}.json`));
    res.json({ deleted: name });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Spec not found' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'schema-graph.html'));
});

function renderReturn(typeRef) {
  if (!typeRef) return '?';
  if (typeRef.kind === 'NON_NULL') return renderReturn(typeRef.ofType) + '!';
  if (typeRef.kind === 'LIST') return '[' + renderReturn(typeRef.ofType) + ']';
  return typeRef.name || '?';
}

async function start() {
  console.log('Loading schema index…');
  const t0 = Date.now();
  index = await loadIndex();
  console.log(`Indexed ${index.byName.size} types, ${index.fieldIndex.size} fields, ${index.edges.length} edges in ${Date.now() - t0}ms`);

  // buildClientSchema wants { __schema: ... }, which is the shape our cached
  // introspection-schema.json already has at the top level.
  const raw = await fs.readFile(join(__dirname, 'introspection-schema.json'), 'utf-8');
  const data = JSON.parse(raw);
  clientSchema = buildClientSchema(data.data ? data.data : data);
  console.log('Built client schema for query parsing');

  app.listen(PORT, () => {
    console.log(`Explorer: http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop');
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
