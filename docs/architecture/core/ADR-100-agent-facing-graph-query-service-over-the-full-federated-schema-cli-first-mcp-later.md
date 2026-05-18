---
status: Draft
date: 2026-05-18
deciders:
  - aaronsb
  - claude
related: []
---

# ADR-100: Agent-facing graph query service over the full federated schema (CLI-first, MCP later)

## Context

Atlassian shipped two things worth contrasting:

- **teamworkgraph.com** — a marketing visualization of the Teamwork Graph. It is a *lossy projection* of the federated GraphQL schema: an instance-level ego-network re-centerable on any object, one hop at a time, with unlabeled edges and no way to introspect the ontology. The published TWG ontology is illustrative prose (small connector/direct-object type lists), with no schema-introspection endpoint.
- **twg-cli** — agent-callable surfaces (Cypher, direct-object-by-ARI, search) over that same projection.

This repo already introspects the *entire* pre-projection federated GraphQL schema — 25,464 types / 65,408 edges — via an in-memory index (`schema-index.js`) exposed over HTTP (`explorer-server.js`, port 4000) and currently consumed only by a React/R3F SPA.

We want an **agent** (not just the SPA) to query the full federated graph through a small abstracted interface. Two failure modes bound the design:

1. The previous repo generation auto-generated thousands of `verb:noun` MCP tools by introspection — "the tool wall was unusable" (README). Lesson: a few abstracted primitives beat thousands of generated tools. twg-cli embodies the same lesson (a handful of primitives, agent composes).
2. teamworkgraph.com's curated subgraph is the wrong target — it is lossy and not introspectable. We want the whole graph, not the curated view.

## Decision

Build a small agent-facing graph query **service**, exposing ~4 abstracted primitives over the full federated schema:

- `search` — fuzzy match across type/field names and descriptions
- `get_type` — full type detail (fields, kind, category, relay/connection info)
- `traverse` — unified graph navigation (subsumes the existing `neighbors`, `entry_points`, `path`), parameterized by `strategy=breadth|depth`, `max_depth`, `direction=out|in|both`, `filter=<kind/category>`, optional `to=<target>`
- `run_query` — execute GraphQL against the live tenant via the existing proxy

**Layering** (this is the load-bearing decision):

- `explorer-server.js` **is the core/service** — owns the in-memory index, the new `traverse` endpoint, and the `run_query` safety boundary.
- A **TypeScript CLI is the first thin client** — argv → HTTP → formatted output. No JS→TS port of the index; the HTTP boundary at `:4000` is the seam.
- An **MCP server is a later thin client** — same service, a different entry point (stdio + tool schemas instead of argv). Promotion is a new entry-point file, not a refactor.

**Approachability mechanism — progressive disclosure.** The schema graph is cyclic and brutally high fan-out. `traverse` must not return raw depth-N subgraphs. It returns the frontier **summarized**, with hard caps and explicit truncation + cycle-elision signals, so the agent iteratively deepens where it cares and gets cheap aggregate signal everywhere else. Concrete contract:

```
traverse({ from: "JiraQuery", strategy: "breadth", max_depth: 2,
           direction: "out", filter: { category: "project_work" } })
→ {
    expanded: [ { type, depth, via: "<parentType>.<field>" }, ... ],   // capped at node_limit (default 50)
    frontier: {                       // NOT expanded — aggregate signal only
      total: 340,
      by_kind:     { OBJECT: 210, "*Connection": 95, ENUM: 35 },
      by_category: { project_work: 120, ai_intelligence: 40, ... },
      sample: [ "JiraSprint", "JiraBoard", ... ]   // first N type names, capped
    },
    truncated: true,                  // node_limit hit; frontier has more
    elided_cycles: [ "JiraQuery", ... ]   // already-visited, not re-walked
  }
```

The agent reads `frontier` (cheap, bounded) and decides whether to call `traverse` again from a chosen node — iterative deepening, not a subgraph dump. `path` behavior is `traverse` with `to` set: it returns the field-chain in `expanded` and omits `frontier`.

**Safety boundary lives in the core, never the frontend.** `run_query` is gated by an operation-type parser in `explorer-server.js` (the existing `POST /api/parse-query` already classifies operations). The policy, decided here (not left as a hint):

- **v1: mutations are out of scope.** The core parse-gate rejects any operation whose type is not `query` (also rejects `subscription`) with an actionable error. `run_query` is read-only, full stop.
- The opt-in mechanism for a future mutation path is **a server-side environment variable** (`GRAPH_ALLOW_MUTATIONS`, default unset) **plus a distinct tool/endpoint name** (`run_mutation`) — never a flag on `run_query` and never a CLI/MCP-side toggle. Both conditions required. This is deferred to a future ADR; v1 does not implement `run_mutation`.

Placing this gate in the CLI would mean the MCP promotion silently ships without it; the core is the only enforcement point that every frontend inherits.

## Consequences

### Positive

- An agent gets an approachable, introspectable interface over the *entire* federated graph — structurally more than twg-cli or teamworkgraph.com offer.
- Surface stays tiny (~4 tools), directly avoiding the prior tool-wall failure.
- The safety boundary is enforced once, in the core, for every current and future frontend (CLI, MCP, GUI).
- MCP promotion is additive (a new entry point), not a rewrite — the payoff of doing CLI-first.
- This is the *generic* sibling of the selective MCP factory (issue #1): the factory mints concern-scoped servers; this is one standing graph-reasoning service.

### Negative

- CLI and MCP both require the `:4000` server process running; there is no embeddable core in v1.
- Introduces a TypeScript toolchain into a JavaScript repo (new package, lockfile, build).
- `run_query` against a live tenant means owning schema-drift and a real read/write trust boundary on a moving API.
- Frontier-summarization is more design and implementation work than naive traversal.

### Neutral

- The TWG/ARI dual-layer comparison (coverage overlay, projection-gap-as-live-query) is **demoted to an optional later overlay**, not the spine — honest to the narrowed "entire graph, not curated subgraph" scope.
- Warrants its own GitHub issue, distinct from issue #1.
- Lockfile-hygiene (exact versions on the `run_query` path) and auth/injection-prevention ways apply to the new package.

## Alternatives Considered

- **Wrap/clone teamworkgraph.com's curated ego-graph view.** Rejected: lossy projection, no introspection, no differentiator; explicitly not the desired target.
- **Wrap twg-cli as a subprocess.** Rejected for this scope: twg-cli only sees the projection; we want the full federated graph, and wrapping inherits its beta churn.
- **Auto-generate one MCP tool per schema entity** (the prior repo generation). Rejected: already attempted and removed — "the tool wall was unusable."
- **Build MCP-first.** Rejected: a CLI validates the primitive ergonomics cheaply in a shell; MCP then becomes a thin adapter. Lower risk, same core.
- **Extract a shared core library consumed by server + CLI + MCP.** Deferred, not rejected: premature abstraction; the HTTP boundary is an adequate v1 seam. Revisit if an embeddable (no-server) core is required.
