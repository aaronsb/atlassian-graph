# Atlassian GraphQL MCP Server - Development Rules

## Core Philosophy: "Respect Atlassian's Reality"

**NO MAGIC** - If it's JQL under the hood, we call it JQL. If it's CQL, we call it CQL. Never assume field names or argue with GraphQL validation errors.

## Architecture Overview

This MCP server uses a **layered dynamic approach** to handle Atlassian's complex, federated GraphQL API:

### Layer 1: Schema Introspection System
- **File**: `src/schema-introspector.js`
- **Purpose**: Performs GraphQL introspection at startup to discover all 388+ available fields
- **Output**: Categorized schema tree with constructor templates for each field

### Layer 2: Static Categorization
- **File**: `src/field-categories.json` 
- **Purpose**: 15 predefined categories with regex patterns to group GraphQL fields
- **Categories**: core_products, search_discovery, identity_user, project_work, content_knowledge, ai_intelligence, apps_marketplace, feeds_activity, analytics_insights, collaboration, administration, specialized_tools, support_help, meta_system, uncategorized
- **Gap Detection**: "uncategorized" catch-all ensures no fields are missed

### Layer 3: Dynamic Tool Generation
- **File**: `src/dynamic-tool-generator.js`
- **Config**: `src/verb-mappings.json`
- **Purpose**: Generates verb:noun MCP tools dynamically from categorized fields
- **Verbs**: search, get, list, create, update, delete
- **Pattern**: Maps GraphQL field signatures to appropriate verbs using pattern matching

### Layer 4: Query Construction
- **Purpose**: Each generated tool includes query builders that construct proper GraphQL
- **Features**: Handles arguments, variables, pagination, operation names, cloud IDs
- **Reality Check**: Uses actual field arguments and types, not assumptions

## Key Files and Their Roles

```
src/
├── schema-introspector.js     # Layer 1: GraphQL introspection
├── field-categories.json      # Layer 2: Static categorization patterns  
├── dynamic-tool-generator.js  # Layer 3: Verb:noun tool generation
├── verb-mappings.json         # Layer 3: Verb mapping configuration
├── graphql-client.js          # GraphQL execution with auth
└── index.js                   # Main MCP server integration
```

## Development Workflow

1. **Server Startup**:
   - Introspects GraphQL schema → discovers fields
   - Categorizes fields using patterns → builds tree
   - Generates tools using verb mappings → creates verb:noun tools
   - Exposes tools via MCP + schema tree as resources

2. **Tool Usage**:
   - User calls generated tool (e.g., `search-confluence`)
   - Tool uses query builder to construct GraphQL with proper arguments
   - Executes against Atlassian API respecting federation requirements
   - Returns results without fighting GraphQL validation

3. **Schema Evolution**:
   - System automatically adapts when Atlassian adds/removes fields
   - No manual tool updates needed - everything is pattern-driven
   - Gap detection catches new fields that don't match existing patterns

## Critical Implementation Details

### GraphQL Requirements
- **Operation Names**: Always required by Atlassian's gateway
- **Cloud IDs**: Required for multi-tenant routing (Confluence, Jira, etc.)
- **Federation**: Different products use different query languages (CQL, JQL)
- **Pagination**: Respect GraphQL Connection patterns

### Tool Generation Rules
- **Max Tools**: 10 per category to avoid overwhelming users
- **Verb Priority**: search, get, list, create, update, delete
- **Pattern Matching**: Field names, arguments, return types determine verb mapping
- **Noun Extraction**: Clean field names to create intuitive tool names

### Authentication
- **Environment Variables**: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN
- **Method**: Basic auth with base64 encoding
- **Scopes**: Different fields require different OAuth scopes

## Testing Strategy

Use the introspection tools to understand what's available:
- `schema-explore` tool with actions: categories, category, field, search
- Resources: `atlassian://schema/tree`, `atlassian://schema/categories`
- Test queries with known patterns before building complex tools

## Jira-Specific Notes

Yes, Jira is fully supported! The system discovers 20+ Jira fields including:
- `jira` - Main Jira query entry point
- `jira_issuesByIds` - Issue lookup
- `jira_projectByIdOrKey` - Project access
- Plus many specialized fields for boards, fields, search views

Generated tools will include: `search-jira`, `get-jira-issues`, `list-jira-projects`, etc.

## Debugging

1. **Check introspection**: Use `schema-explore` to see discovered fields
2. **Verify patterns**: Look at verb-mappings.json for generation rules  
3. **Test GraphQL**: Use `query` tool to test raw GraphQL before tool generation
4. **Check logs**: Server logs show introspection and generation progress

## Future Evolution

- **Pattern Refinement**: Improve verb-mappings.json based on usage
- **New Categories**: Add field-categories.json entries for new product areas
- **Advanced Tools**: Build verb:noun:verb patterns for complex operations
- **Performance**: Cache introspection results for faster startup