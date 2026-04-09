# Atlassian GraphQL MCP Tool Classes

## Overview

This MCP server implements a hierarchical tool classification system aligned with Atlassian's System of Work philosophy. Instead of exposing 500+ raw GraphQL fields as individual tools, we organize them into manageable classes that can be toggled on/off via environment variables.

## Tool Classes

### 1. FOUNDATIONAL (Enabled by Default)
**Description**: Core teamwork tools - Jira, Confluence, Loom, and Rovo  
**ENV Variable**: `ENABLE_FOUNDATIONAL_TOOLS=true`  
**Key Tools**:
- `get-jira` - Access Jira instance
- `search-core-products` - Search across products using CQL
- `get-issues-by-ids` - Retrieve Jira issues
- `get-confluence` - Access Confluence instance

### 2. AI_INTELLIGENCE (Enabled by Default)
**Description**: Atlassian Intelligence, Rovo agents, and AI-powered features  
**ENV Variable**: `ENABLE_AI_INTELLIGENCE=true`  
**Key Tools**:
- `search-agent-studio-get-agents` - Find AI agents
- `get-virtual-agent` - Access virtual assistant
- `search-devai-autodev-jobs-for-issue` - Dev AI automation

### 3. SPECIALIZED_SOLUTIONS (Enabled by Default)
**Description**: IT Service Management, DevOps, Analytics  
**ENV Variable**: `ENABLE_SPECIALIZED_SOLUTIONS=true`  
**Key Tools**:
- `get-jsm-chat` - Jira Service Management chat
- `get-dev-ops` - DevOps integrations
- `get-compass` - Component catalog

### 4. TEAMWORK_GRAPH (Enabled by Default)
**Description**: Cross-product search, analytics, and data connectivity  
**ENV Variable**: `ENABLE_TEAMWORK_GRAPH=true`  
**Key Tools**:
- `search-search-discovery` - Unified search
- `search-nlp-search` - Natural language search
- `get-insights` - Analytics and insights

### 5. MARKETPLACE_ECOSYSTEM (Disabled by Default)
**Description**: Third-party apps, Forge platform, and ecosystem tools  
**ENV Variable**: `ENABLE_MARKETPLACE_ECOSYSTEM=false`  
**Key Tools**:
- `search-apps` - Find marketplace apps
- `get-ecosystem` - Ecosystem information

### 6. ADMINISTRATION (Disabled by Default)
**Description**: Org policies, site settings, and security controls  
**ENV Variable**: `ENABLE_ADMINISTRATION=false`  
**Key Tools**:
- `get-organization` - Organization settings
- `get-site-settings` - Site configuration

### 7. COLLABORATION (Enabled by Default)
**Description**: Loom videos, comments, and team collaboration features  
**ENV Variable**: `ENABLE_COLLABORATION=true`  
**Key Tools**:
- `get-loom-video` - Access Loom videos
- `search-comments` - Search discussions
- `get-collab-draft` - Collaborative drafts

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Tool Class Configuration
ENABLE_FOUNDATIONAL_TOOLS=true
ENABLE_AI_INTELLIGENCE=true
ENABLE_SPECIALIZED_SOLUTIONS=true
ENABLE_TEAMWORK_GRAPH=true
ENABLE_MARKETPLACE_ECOSYSTEM=false
ENABLE_ADMINISTRATION=false
ENABLE_COLLABORATION=true

# Tool Generation Limits
MAX_TOOLS_PER_CLASS=15
TOTAL_MAX_TOOLS=50
```

### Tool Class Management

Use the `tool-classes` MCP tool to manage classes:

```javascript
// List all tool classes
await mcp.call('tool-classes', { action: 'list' })

// Check current status
await mcp.call('tool-classes', { action: 'status' })

// Get enable/disable instructions
await mcp.call('tool-classes', { 
  action: 'enable', 
  className: 'MARKETPLACE_ECOSYSTEM' 
})
```

## Architecture

The tool class system has three layers:

1. **Schema Introspection**: Discovers all 388+ GraphQL fields at startup
2. **Dynamic Tool Generation**: Creates verb:noun tools from schema
3. **Class-Based Filtering**: Reduces tools to configured subset

### Benefits

- **Manageable Tool Count**: From 500+ to ~30-50 tools
- **Aligned with Atlassian**: Follows System of Work philosophy
- **Configurable**: Enable/disable entire product areas
- **Dynamic Expansion**: Can access any tool on-demand if needed

### File Structure

```
src/
├── tool-classes.json          # Tool class definitions
├── tool-class-manager.js      # Filtering and management logic
├── dynamic-tool-generator.js  # Modified to use class filtering
└── tool-hierarchy.json        # Alternative hierarchical mapping
```

## Usage Examples

### Basic Jira Operations (FOUNDATIONAL)
```javascript
// Get Jira project
await mcp.call('get-project-by-id-or-key', { idOrKey: 'PROJ-123' })

// Search issues
await mcp.call('search-core-products', { 
  cql: 'project = PROJ AND status = Open' 
})
```

### AI Features (AI_INTELLIGENCE)
```javascript
// Find AI agents
await mcp.call('search-agent-studio-get-agents', { 
  input: { query: 'code review' } 
})

// Get issue summary from AI
await mcp.call('get-agent-a-i-summarize-issue', { 
  issueId: 'PROJ-123' 
})
```

### Cross-Product Search (TEAMWORK_GRAPH)
```javascript
// Natural language search
await mcp.call('search-nlp-search', { 
  query: 'security vulnerabilities last week',
  locations: ['jira', 'confluence'] 
})
```

## Future Enhancements

1. **Subcategory Filtering**: Further refine tools within classes
2. **User Profiles**: Pre-configured class sets for different roles
3. **Runtime Toggle**: Change enabled classes without restart
4. **Smart Suggestions**: Recommend tools based on usage patterns