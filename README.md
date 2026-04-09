# Atlassian Graph MCP

A proof-of-concept Model Context Protocol (MCP) server that introspects Atlassian's federated GraphQL API and dynamically generates tools from the discovered schema.

## Status

Exploratory. The core idea — runtime schema introspection driving dynamic tool generation — works and has been useful for navigating Atlassian's ~388-field GraphQL surface. The surrounding code is rough.

## Core idea

Atlassian's GraphQL gateway federates across Jira, Confluence, Compass, Teams, Townsquare, Identity, and more. Hand-writing MCP tools for each field doesn't scale and breaks every time they ship a new one. Instead:

1. **Introspect** the schema at startup to discover every available field.
2. **Categorize** fields into semantic groups (core products, search, identity, AI, admin, etc.) via regex patterns.
3. **Generate** verb:noun MCP tools (`search-jira`, `get-confluence-page`, `list-projects`, …) by mapping GraphQL field signatures to verbs.
4. **Execute** against the live API without lying about the underlying system — if Jira still uses JQL under the covers, we call it JQL.

See `CLAUDE.md` for the architecture layers and `TOOL_CLASSES.md` for the tool-class model.

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your Atlassian email and API token
# get a token: https://id.atlassian.com/manage-profile/security/api-tokens
npm start
```

To wire it into an MCP client, see `inspector-config.example.json` for a reference config.

## Layout

```
index.js                      MCP server entry (stdio transport)
src/
  schema-introspector.js      Runtime GraphQL introspection
  field-categories.json       Regex patterns for semantic grouping
  dynamic-tool-generator.js   Verb:noun tool generation
  verb-mappings.json          Field-signature → verb rules
  graphql-client.js           Authenticated GraphQL execution
  site-config.js              Multi-site / cloud-id handling
  tool-class-manager.js       Tool-class enablement
  tool-classes.json
  tool-hierarchy.json
  relationship-mapper.js      Field-to-field relationship graph
```

## Design principles

- **No magic.** If it's JQL, we call it JQL. If it's CQL, we call it CQL. Don't argue with GraphQL validation errors — respect them.
- **Graph-first where it fits, honest where it doesn't.** Wrap legacy REST-in-GraphQL as graph operations only when it isn't misleading.
- **Pattern-driven.** Schema changes shouldn't require code changes; refine `field-categories.json` and `verb-mappings.json` instead.

## License

Not yet chosen.
