import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATEGORIES = {
  core_products:      { label: 'Core Products',        patterns: [/^Jira/, /^Confluence/, /^Compass/, /^Bitbucket/, /^Opsgenie/, /^Trello/] },
  identity_user:      { label: 'Identity & User',      patterns: [/^User/, /^Tenant/, /^Identity/, /^AuthenticationContext/, /^Account/] },
  search_discovery:   { label: 'Search & Discovery',   patterns: [/Search/, /^Nlp/, /^Suggest/, /^Discover/] },
  development_devops: { label: 'Development / DevOps', patterns: [/^DevOps/, /^Dev[A-Z]/, /^Code/, /^Dvcs/, /^Repository/, /^PullRequest/, /^Build/, /^Deployment/, /^Pipeline/] },
  project_work:       { label: 'Project & Work',       patterns: [/^Project/, /^Board/, /^Sprint/, /^Roadmap/, /^Epic/, /^Backlog/] },
  content_knowledge:  { label: 'Content & Knowledge',  patterns: [/^Page/, /^Space/, /^KnowledgeBase/, /^Template/, /^Content/, /^Article/] },
  ai_intelligence:    { label: 'AI & Intelligence',    patterns: [/^AgentAI/, /^AgentStudio/, /^Devai/, /^Convoai/, /^Intent/, /^VirtualAgent/, /^Ai[A-Z]/, /AIConfig/, /^Nlp/] },
  apps_marketplace:   { label: 'Apps & Marketplace',   patterns: [/^Marketplace/, /^Ecosystem/, /^Extension/, /^Plugin/, /^Forge/] },
  feeds_activity:     { label: 'Feeds & Activity',     patterns: [/Feed$/, /^Activity/, /^Activities/, /^Notification/, /^Social/] },
  analytics_insights: { label: 'Analytics & Insights', patterns: [/^AVP/, /^Polaris/, /^Mercury/, /^Insights/, /^ContentAnalytics/, /Analytics$/, /Metrics$/, /^Loom/] },
  collaboration:      { label: 'Collaboration',        patterns: [/^Comment/, /^Collab/, /^Stakeholder/, /^Mention/, /^Reaction/] },
  administration:     { label: 'Administration',       patterns: [/^Admin/, /^Settings/, /^Organization/, /^SiteSettings/, /^OrgPolicy/, /^Classification/, /^Audit/] },
  specialized_tools:  { label: 'Specialized Tools',    patterns: [/^Radar/, /^Shepherd/, /^Playbook/, /^Glance/, /^Catchup/, /^AssetsDM/, /^Townsquare/, /^Goal/] },
  support_help:       { label: 'Support & Help',       patterns: [/^Help/, /^CustomerSupport/, /^CustomerService/, /^JsmChat/, /^Spf/] },
  meta_system:        { label: 'Meta / System',        patterns: [/^Echo$/, /^Diagnostics/, /^Sandbox/, /^Node$/, /^PageInfo$/, /Connection$/, /Edge$/] },
};

const CATEGORY_ORDER = [
  'core_products', 'project_work', 'content_knowledge', 'identity_user',
  'search_discovery', 'development_devops', 'ai_intelligence', 'collaboration',
  'analytics_insights', 'apps_marketplace', 'feeds_activity', 'administration',
  'specialized_tools', 'support_help', 'meta_system', 'uncategorized',
];

function categorize(name) {
  for (const [cat, info] of Object.entries(CATEGORIES)) {
    for (const re of info.patterns) if (re.test(name)) return cat;
  }
  return 'uncategorized';
}

function unwrap(typeRef) {
  while (typeRef && typeRef.ofType) typeRef = typeRef.ofType;
  return typeRef ? typeRef.name : null;
}

function renderTypeRef(typeRef) {
  if (!typeRef) return '?';
  if (typeRef.kind === 'NON_NULL') return renderTypeRef(typeRef.ofType) + '!';
  if (typeRef.kind === 'LIST') return '[' + renderTypeRef(typeRef.ofType) + ']';
  return typeRef.name || '?';
}

function isRelayScaffold(name) {
  return /Connection$/.test(name) || /Edge$/.test(name) || name === 'PageInfo';
}

export function createIndex(schemaData) {
  const schema = schemaData.__schema || (schemaData.data && schemaData.data.__schema);
  if (!schema) throw new Error('Invalid schema format: missing __schema');

  const byName = new Map();
  const fieldIndex = new Map();
  const byReturnType = new Map();
  const byArgType = new Map();
  const categoryIndex = new Map();
  const edges = [];

  for (const t of schema.types) {
    if (t.name.startsWith('__')) continue;
    byName.set(t.name, t);

    const cat = categorize(t.name);
    if (!categoryIndex.has(cat)) categoryIndex.set(cat, []);
    categoryIndex.get(cat).push(t.name);

    for (const f of t.fields || []) {
      fieldIndex.set(`${t.name}.${f.name}`, { parent: t.name, ...f });

      const returnTypeName = unwrap(f.type);
      if (returnTypeName) {
        if (!byReturnType.has(returnTypeName)) byReturnType.set(returnTypeName, []);
        byReturnType.get(returnTypeName).push({ parent: t.name, field: f.name });

        if (returnTypeName !== t.name) {
          edges.push({
            from: t.name,
            field: f.name,
            args: (f.args || []).map(a => ({ name: a.name, type: renderTypeRef(a.type) })),
            to: returnTypeName,
          });
        }
      }

      for (const a of f.args || []) {
        const argTypeName = unwrap(a.type);
        if (!argTypeName) continue;
        if (!byArgType.has(argTypeName)) byArgType.set(argTypeName, []);
        byArgType.get(argTypeName).push({ parent: t.name, field: f.name, arg: a.name });
      }
    }

    for (const f of t.inputFields || []) {
      const argTypeName = unwrap(f.type);
      if (!argTypeName) continue;
      if (!byArgType.has(argTypeName)) byArgType.set(argTypeName, []);
      byArgType.get(argTypeName).push({ parent: t.name, field: f.name, arg: null });
    }
  }

  const degrees = new Map();
  const outgoingByType = new Map();
  for (const e of edges) {
    degrees.set(e.from, (degrees.get(e.from) || 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) || 0) + 1);
    if (!outgoingByType.has(e.from)) outgoingByType.set(e.from, []);
    outgoingByType.get(e.from).push(e);
  }

  // Relay Connection detection: A Connection has edges → [Edge], Edge has node → T.
  // We expose the underlying T for any *Connection type so callers don't have to
  // guess the traversal pattern. Also build a reverse map from node type to
  // Connection so a node type can advertise "wrapped by these connections".
  const connectionMap = new Map();
  const edgeTypeMap = new Map();
  const connectionsForNode = new Map();
  for (const t of byName.values()) {
    if (!/Connection$/.test(t.name)) continue;
    const edgesField = (t.fields || []).find(f => f.name === 'edges');
    if (!edgesField) continue;
    const edgeTypeName = unwrap(edgesField.type);
    if (!edgeTypeName) continue;
    const edgeType = byName.get(edgeTypeName);
    if (!edgeType) continue;
    const nodeField = (edgeType.fields || []).find(f => f.name === 'node');
    if (!nodeField) continue;
    const nodeTypeName = unwrap(nodeField.type);
    if (!nodeTypeName) continue;
    const info = { nodeType: nodeTypeName, edgeType: edgeTypeName, traverse: 'edges.node' };
    connectionMap.set(t.name, info);
    edgeTypeMap.set(edgeTypeName, { connectionType: t.name, nodeType: nodeTypeName });
    if (!connectionsForNode.has(nodeTypeName)) connectionsForNode.set(nodeTypeName, []);
    connectionsForNode.get(nodeTypeName).push(t.name);
  }

  return {
    schema,
    byName,
    fieldIndex,
    byReturnType,
    byArgType,
    categoryIndex,
    edges,
    degrees,

    queryTypeName: schema.queryType?.name || 'Query',
    mutationTypeName: schema.mutationType?.name || null,
    subscriptionTypeName: schema.subscriptionType?.name || null,

    getType(name) {
      return byName.get(name) || null;
    },

    getField(typeName, fieldName) {
      return fieldIndex.get(`${typeName}.${fieldName}`) || null;
    },

    getProducers(typeName) {
      return byReturnType.get(typeName) || [];
    },

    getConsumers(typeName) {
      return byArgType.get(typeName) || [];
    },

    getDegree(typeName) {
      return degrees.get(typeName) || 0;
    },

    getCategory(typeName) {
      return categorize(typeName);
    },

    getConnectionInfo(typeName) {
      return connectionMap.get(typeName) || null;
    },

    getEdgeInfo(typeName) {
      return edgeTypeMap.get(typeName) || null;
    },

    getConnectionsForNode(typeName) {
      return connectionsForNode.get(typeName) || [];
    },

    getCategoryInfo(cat) {
      return CATEGORIES[cat] || (cat === 'uncategorized' ? { label: 'Uncategorized', patterns: [] } : null);
    },

    categoryOrder: CATEGORY_ORDER,

    getNeighbors(typeName, { depth = 1, direction = 'out' } = {}) {
      const visited = new Set([typeName]);
      const frontier = [typeName];
      const result = [];
      for (let d = 0; d < depth; d++) {
        const next = [];
        for (const cur of frontier) {
          const outgoing = direction === 'in' ? [] :
            (outgoingByType.get(cur) || []).map(e => ({ hop: d + 1, from: cur, field: e.field, to: e.to, direction: 'out' }));
          const incoming = direction === 'out' ? [] :
            (byReturnType.get(cur) || []).map(p => ({ hop: d + 1, from: p.parent, field: p.field, to: cur, direction: 'in' }));
          for (const step of [...outgoing, ...incoming]) {
            const other = step.direction === 'out' ? step.to : step.from;
            if (!visited.has(other)) {
              visited.add(other);
              result.push(step);
              next.push(other);
            }
          }
        }
        frontier.length = 0;
        frontier.push(...next);
      }
      return result;
    },

    findEntryPoints(target, { from = 'Query', maxHops = 2, maxResults = 100 } = {}) {
      if (!byName.has(target) || !byName.has(from)) return [];
      const results = [];
      const queue = [{ type: from, path: [], visited: new Set([from]) }];
      while (queue.length && results.length < maxResults) {
        const { type, path, visited } = queue.shift();
        if (path.length >= maxHops) continue;
        const out = outgoingByType.get(type) || [];
        for (const e of out) {
          const step = { parent: type, field: e.field, to: e.to };
          const newPath = [...path, step];
          if (e.to === target) {
            results.push({ path: newPath, hops: newPath.length });
            if (results.length >= maxResults) break;
            continue;
          }
          if (visited.has(e.to)) continue;
          if (path.length + 1 >= maxHops) continue;
          const newVisited = new Set(visited);
          newVisited.add(e.to);
          queue.push({ type: e.to, path: newPath, visited: newVisited });
        }
      }
      results.sort((a, b) => a.hops - b.hops);
      return results;
    },

    shortestPath(fromType, toType) {
      if (fromType === toType) return { steps: [] };
      const prev = new Map();
      const visited = new Set([fromType]);
      const queue = [fromType];
      while (queue.length) {
        const cur = queue.shift();
        if (cur === toType) break;
        const out = outgoingByType.get(cur) || [];
        for (const e of out) {
          if (visited.has(e.to)) continue;
          visited.add(e.to);
          prev.set(e.to, { from: e.from, field: e.field, to: e.to });
          queue.push(e.to);
        }
      }
      if (!visited.has(toType)) return null;
      const steps = [];
      let cursor = toType;
      while (cursor !== fromType) {
        const step = prev.get(cursor);
        if (!step) return null;
        steps.unshift(step);
        cursor = step.from;
      }
      return { steps };
    },
  };
}

let cachedIndex = null;
let cachedPath = null;

export async function loadIndex(path) {
  const schemaPath = path || join(__dirname, 'introspection-schema.json');
  if (cachedIndex && cachedPath === schemaPath) return cachedIndex;
  const raw = await fs.readFile(schemaPath, 'utf-8');
  const data = JSON.parse(raw);
  cachedIndex = createIndex(data);
  cachedPath = schemaPath;
  return cachedIndex;
}

export { categorize, unwrap, renderTypeRef, isRelayScaffold, CATEGORIES, CATEGORY_ORDER };
