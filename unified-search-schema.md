# Unified Search Schema for All Atlassian Products

## Overview

Atlassian provides a unified search API through the `search` field that can query across all products (Jira, Confluence, Trello, etc.) using a single GraphQL query.

## Key Components

### 1. Main Search Field
- **Field**: `search`
- **Type**: `SearchQueryAPI`
- **Description**: Entry point for searching across multiple Atlassian products

### 2. Search Filters Structure

```graphql
input SearchFilterInput {
  entities: [String!]!      # Product types to search (e.g., ["jira:issue", "confluence:page"])
  locations: [String!]!     # Cloud IDs or workspace ARIs
  commonFilters: SearchCommonFilter
  confluenceFilters: SearchConfluenceFilter
  jiraFilters: SearchJiraFilter
  mercuryFilters: SearchMercuryFilter
  trelloFilters: SearchTrelloFilter
  externalFilters: SearchExternalFilter
  thirdPartyFilters: SearchThirdPartyFilter
}
```

### 3. Entity Types (ATI Strings)

Common entity types for the `entities` filter:
- **Jira**: `jira:issue`, `jira:board`, `jira:project`
- **Confluence**: `confluence:page`, `confluence:blogpost`, `confluence:space`
- **Trello**: `trello:board`, `trello:card`
- **Bitbucket**: `bitbucket:repository`, `bitbucket:project`
- **Opsgenie**: `opsgenie:incident`, `opsgenie:alert`

## Complete Unified Search Query

```graphql
query UnifiedSearch(
  $query: String!
  $entities: [String!]!
  $cloudId: String!
  $first: Int
) {
  search {
    search(
      query: $query
      filters: {
        entities: $entities
        locations: [$cloudId]
      }
      experience: "AGG"
      first: $first
      enableHighlighting: true
    ) {
      edges {
        node {
          __typename
          ... on JiraIssue {
            id
            key
            summary
            status {
              name
            }
            assignee {
              displayName
            }
            project {
              key
              name
            }
          }
          ... on ConfluencePage {
            id
            title
            space {
              key
              name
            }
          }
          ... on ConfluenceBlogPost {
            id
            title
            space {
              key
              name
            }
          }
          ... on TrelloCard {
            id
            name
            board {
              name
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
}
```

## Usage Examples

### 1. Search Across All Products
```graphql
{
  "query": "goals objectives OKR",
  "entities": ["jira:issue", "confluence:page", "confluence:blogpost"],
  "cloudId": "your-cloud-id",
  "first": 20
}
```

### 2. Jira-Only Search
```graphql
{
  "query": "bug priority:high",
  "entities": ["jira:issue"],
  "cloudId": "your-cloud-id",
  "first": 10
}
```

### 3. Confluence-Only Search
```graphql
{
  "query": "documentation",
  "entities": ["confluence:page", "confluence:blogpost"],
  "cloudId": "your-cloud-id",
  "first": 15
}
```

## Product-Specific Search Fields

While the unified search is powerful, each product also has its own search field:

1. **Confluence**: `confluence_search` (uses CQL)
2. **Jira**: Search through `jira` field with JQL
3. **Knowledge Base**: `knowledgeBase_searchArticles`
4. **NLP Search**: `nlpSearch` (natural language search)
5. **Help Articles**: `helpObjectStore_searchArticles`

## Best Practices

1. **Use Unified Search** when you need results from multiple products
2. **Use Product-Specific Search** when you need advanced filtering with CQL/JQL
3. **Entity Types** must match exactly (e.g., "jira:issue" not "jira:issues")
4. **Experience Parameter** should be set to "AGG" for Atlassian GraphQL Gateway
5. **Enable Highlighting** for better search result visualization

## Error Handling

Common errors and solutions:
- **Invalid entity type**: Check exact ATI string format
- **Missing cloud ID**: Ensure locations array includes valid cloud IDs
- **Type mismatch**: Verify fragment types match the actual returned types