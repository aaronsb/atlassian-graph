# atlassian-graph

A 3D visualizer for Atlassian's federated GraphQL schema, with an interactive query workbench. Longer term, a **design surface for minting focused MCP servers** from a curated set of queries — see [issue #1](https://github.com/aaronsb/atlassian-graph/issues/1) for the selective factory plan.

## Status

Exploratory but functional. The explorer renders 25,464 types / 65,408 edges (capped to the top 500 by connectivity for display), indexes them in memory for sub-10ms lookups, and supports a real query → parse → highlight → run → save loop.

The previous generation of this repo was an MCP server that auto-generated thousands of tools by introspection. That experiment was removed because the tool wall was unusable; see git history if you want the archaeology.

## Setup

```bash
npm install
cp .env.example .env
# fill in ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN
# get a token: https://id.atlassian.com/manage-profile/security/api-tokens
```

## Usage

```bash
./graph fetch     # cache the introspection schema (~62MB, gitignored)
./graph dev       # run API (:4000) + Vite UI (:5173) together, Ctrl+C stops both
./graph api       # API only, for headless curl / tool use
./graph help
```

`dev` auto-fetches the schema on first run and auto-installs explorer deps if missing.

## Architecture

```
graph                         CLI — fetch | dev | api | help
fetch-introspection.js        One-shot schema fetcher
schema-index.js               In-memory schema index: byName, fieldIndex, byReturnType,
                              outgoingByType, connectionMap, entry-point BFS, etc.
explorer-server.js            Express API on :4000, backed by schema-index
explorer/                     Vite + React + React Three Fiber frontend on :5173
├── src/hooks/                useSchemaGraph, useTypeDetails — API fetchers
├── src/scene/                Nodes, Edges, Graph3D, useForceSim — the 3D scene
├── src/Sidebar.jsx           Type details panel
├── src/QueryPanel.jsx        Query workbench (parse, highlight, run, save)
└── src/App.jsx               Composition
introspection-schema.json     Cached schema (gitignored)
specs/                        Saved query specs — the input to the MCP factory
```

## API reference (port 4000)

Claude-friendly introspection — everything answers in ~10ms from in-memory indices. All `GET` unless noted.

| Endpoint | Purpose |
|---|---|
| `/api/type/:name` | Full type info: kind, description, category, fields, interfaces, `connectionOf` if it's a Relay Connection, `wrappedBy` if a node type |
| `/api/field/:type/:field` | Single field detail (args, return type, description) |
| `/api/search?q=&kind=&limit=` | Fuzzy match across type names, field names, and field descriptions |
| `/api/categories` · `/api/category/:name` | Semantic groupings (core_products, project_work, ai_intelligence, …) |
| `/api/neighbors/:type?depth=&direction=out\|in\|both` | Types reachable in N hops |
| `/api/producers/:type` | Every field in the schema that returns this type (reverse index) |
| `/api/consumers/:type` | Every field that takes this type as an argument |
| `/api/entry-points/:type?from=Query&maxHops=2` | BFS from a root type — finds all paths including namespace traversals like `Query.jira → JiraQuery.issueByKey` |
| `/api/path?from=&to=` | Shortest field-chain between two types |
| `/api/stats` | Type counts, degree distribution, most-connected types |
| `/api/graph?cap=&kinds=&includeRelay=` | Pre-filtered nodes + edges for the viz |
| `POST /api/query` | Live GraphQL proxy. Accepts `{query, variables, operationName}`, auth is added server-side. Returns the upstream response with `elapsed` attached. |
| `POST /api/parse-query` | Schema-aware parse. Returns `{ok, operations, touchpoints}` where touchpoints are `{parentType, field, returns}` triples walked through the selection set. |
| `/api/query-log` | Recent POST /api/query trace (in-memory ring buffer, 50 entries) |
| `/api/specs` · `GET/POST/DELETE /api/specs/:name[/queries]` | Spec file CRUD |

## The workbench workflow

1. **Explore** — open the 3D scene, hover/click types, read the sidebar
2. **Write** — drop a GraphQL query into the workbench at the bottom
3. **Highlight** — as you type, the API parses the query and the viz lights up the types and field-edges involved (touchpoints)
4. **Run** — click Run to execute through the live proxy and see real results
5. **Save** — name the query and the spec it belongs to, click Save — the spec file is written to `specs/<name>.json`

A saved spec is the input to the selective MCP factory ([issue #1](https://github.com/aaronsb/atlassian-graph/issues/1)). The factory mints a standalone MCP server where each saved query becomes one focused tool.

## License

Not yet chosen.
