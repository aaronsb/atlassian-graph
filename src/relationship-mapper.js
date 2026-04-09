/**
 * Relationship Mapper - Generates Mermaid diagrams of Atlassian relationships
 * Creates visual maps of people, projects, content, and their connections
 */

class RelationshipMapper {
    constructor(graphqlClient, siteConfig) {
        this.graphqlClient = graphqlClient;
        this.siteConfig = siteConfig;
        this.relationships = new Map();
        this.entities = new Map();
    }

    /**
     * Generate a complete relationship diagram and save to file
     */
    async generateRelationshipDiagram(outputPath = './relationships.md') {
        console.log('🔍 Discovering relationships...');
        
        // Clear previous data
        this.relationships.clear();
        this.entities.clear();

        // Discover entities and relationships
        await this.discoverUsers();
        await this.discoverSpaces();
        await this.discoverContent();
        await this.discoverProjects();

        // Generate Mermaid diagram
        const mermaidDiagram = this.generateMermaidDiagram();
        
        // Create markdown file with diagram
        const markdownContent = this.createMarkdownFile(mermaidDiagram);
        
        // Write to file
        const fs = await import('fs');
        fs.writeFileSync(outputPath, markdownContent);
        
        console.log(`📊 Relationship diagram generated: ${outputPath}`);
        return {
            diagramPath: outputPath,
            entityCount: this.entities.size,
            relationshipCount: this.relationships.size,
            entities: Array.from(this.entities.keys()),
            relationships: Array.from(this.relationships.entries())
        };
    }

    /**
     * Discover users in the system by searching for people mentions and known names
     */
    async discoverUsers() {
        try {
            // Search for content mentioning known users
            const knownUsers = ['aaron bockelie', 'ted henry', 'scott mcdonald', 'clayton chancey'];
            
            for (const userName of knownUsers) {
                const query = `query DiscoverUserMentions($cloudId: ID, $cql: String!) {
                    confluence_search(cloudId: $cloudId, cql: $cql) {
                        edges {
                            node {
                                ... on ConfluenceSearchResponse {
                                    title
                                    url
                                    excerpt
                                }
                            }
                        }
                    }
                }`;

                const result = await this.graphqlClient.query(query, {
                    cloudId: this.siteConfig.getCurrentCloudId(),
                    cql: `text ~ "${userName}"`
                });

                console.log(`Search results for ${userName}:`, JSON.stringify(result, null, 2));

                // Add the user as an entity
                this.addEntity(userName, 'user', {
                    searchTerm: userName
                });

                // Add content that mentions this user
                if (result.confluence_search?.edges) {
                    console.log(`Found ${result.confluence_search.edges.length} search results for ${userName}`);
                    for (const edge of result.confluence_search.edges) {
                        const node = edge.node;
                        if (node?.title && node.title.length < 80) {
                            this.addEntity(node.title, 'content', {
                                url: node.url,
                                excerpt: node.excerpt,
                                mentionsUser: userName
                            });
                            
                            // Create relationship
                            this.addRelationship(userName, node.title, 'mentioned_in');
                            console.log(`Added relationship: ${userName} mentioned_in ${node.title}`);
                        }
                    }
                } else {
                    console.log(`No search edges found for ${userName}`);
                    
                    // Try alternative search approach using different query
                    try {
                        const altQuery = `query SearchContent($cloudId: ID, $cql: String!) {
                            confluence_coreProducts(cloudId: $cloudId, cql: $cql, first: 5) {
                                edges {
                                    node {
                                        ... on ConfluenceContent {
                                            title
                                            webLink
                                            excerpt
                                            createdBy {
                                                displayName
                                            }
                                            space {
                                                name
                                                key
                                            }
                                        }
                                    }
                                }
                            }
                        }`;
                        
                        const altResult = await this.graphqlClient.query(altQuery, {
                            cloudId: this.siteConfig.getCurrentCloudId(),
                            cql: `text ~ "${userName}"`
                        });
                        
                        console.log(`Alternative search results for ${userName}:`, JSON.stringify(altResult, null, 2));
                        
                        if (altResult.confluence_coreProducts?.edges) {
                            for (const edge of altResult.confluence_coreProducts.edges) {
                                const node = edge.node;
                                if (node?.title) {
                                    this.addEntity(node.title, 'content', {
                                        url: node.webLink,
                                        excerpt: node.excerpt
                                    });
                                    
                                    this.addRelationship(userName, node.title, 'mentioned_in');
                                    console.log(`Added alt relationship: ${userName} mentioned_in ${node.title}`);
                                    
                                    // Add space relationship
                                    if (node.space?.name) {
                                        this.addEntity(node.space.name, 'space');
                                        this.addRelationship(node.title, node.space.name, 'belongs_to');
                                    }
                                }
                            }
                        }
                    } catch (altError) {
                        console.log(`Alternative search failed for ${userName}:`, altError.message);
                    }
                }
            }
        } catch (error) {
            console.log('Error discovering users:', error.message);
        }
    }

    /**
     * Discover spaces and their relationships
     */
    async discoverSpaces() {
        try {
            // Use spaces API to get spaces
            const query = `query DiscoverSpaces($cloudId: ID) {
                confluence_spaces(cloudId: $cloudId, first: 10) {
                    edges {
                        node {
                            ... on ConfluenceSpace {
                                name
                                key
                                homepageId
                            }
                        }
                    }
                }
            }`;

            const result = await this.graphqlClient.query(query, {
                cloudId: this.siteConfig.getCurrentCloudId()
            });

            if (result.confluence_spaces?.edges) {
                for (const edge of result.confluence_spaces.edges) {
                    const node = edge.node;
                    if (node?.name) {
                        this.addEntity(node.name, 'space', {
                            key: node.key,
                            url: `/spaces/${node.key}`
                        });
                    }
                }
            }
        } catch (error) {
            console.log('Error discovering spaces:', error.message);
            // Fallback: add some known spaces
            this.addEntity('SAT', 'space', { key: 'SAT' });
            this.addEntity('SDE', 'space', { key: 'SDE' });
        }
    }

    /**
     * Discover content and relationships
     */
    async discoverContent() {
        try {
            // Search for key content types that show relationships
            const searchTerms = [
                'aaron bockelie',
                'ted henry',
                'scott mcdonald',
                'clayton chancey',
                'AI',
                'ProdOps',
                'SDE',
                'MCP'
            ];

            for (const term of searchTerms) {
                const query = `query DiscoverContent($cloudId: ID, $cql: String!) {
                    confluence_search(cloudId: $cloudId, cql: $cql) {
                        edges {
                            node {
                                ... on ConfluenceSearchResponse {
                                    title
                                    url
                                    excerpt
                                }
                            }
                        }
                    }
                }`;

                const result = await this.graphqlClient.query(query, {
                    cloudId: this.siteConfig.getCurrentCloudId(),
                    cql: `text ~ "${term}"`
                });

                if (result.confluence_search?.edges) {
                    for (const edge of result.confluence_search.edges) {
                        const node = edge.node;
                        if (node?.title && node.title.length < 80) { // Avoid very long titles
                            this.addEntity(node.title, 'content', {
                                url: node.url,
                                excerpt: node.excerpt,
                                searchTerm: term
                            });

                            // Create relationship based on search term
                            this.addRelationship(term, node.title, 'mentions');
                        }
                    }
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.log('Error discovering content:', error.message);
        }
    }

    /**
     * Discover Jira projects
     */
    async discoverProjects() {
        try {
            const query = `query DiscoverProjects($cloudId: ID) {
                jira(cloudId: $cloudId) {
                    projectsByIdOrKey: project {
                        __typename
                    }
                }
            }`;

            // Note: This is a simplified query - would need actual project discovery
            // For now, we'll infer projects from content
            console.log('Project discovery would be implemented here');
        } catch (error) {
            console.log('Error discovering projects:', error.message);
        }
    }

    /**
     * Add an entity to the map
     */
    addEntity(name, type, metadata = {}) {
        const cleanName = this.cleanName(name);
        if (!this.entities.has(cleanName)) {
            this.entities.set(cleanName, {
                type,
                originalName: name,
                metadata
            });
        }
    }

    /**
     * Add a relationship between entities
     */
    addRelationship(from, to, type) {
        const cleanFrom = this.cleanName(from);
        const cleanTo = this.cleanName(to);
        
        const relationshipKey = `${cleanFrom}--${cleanTo}`;
        this.relationships.set(relationshipKey, {
            from: cleanFrom,
            to: cleanTo,
            type,
            fromOriginal: from,
            toOriginal: to
        });
    }

    /**
     * Clean names for Mermaid compatibility
     */
    cleanName(name) {
        return name
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .substring(0, 50); // Limit length
    }

    /**
     * Generate the Mermaid diagram syntax
     */
    generateMermaidDiagram() {
        let diagram = 'graph TD\n';

        // Add entity definitions with styling
        for (const [cleanName, entity] of this.entities) {
            const style = this.getEntityStyle(entity.type);
            const displayName = entity.originalName.length > 30 
                ? entity.originalName.substring(0, 30) + '...' 
                : entity.originalName;
            
            diagram += `    ${cleanName}["${displayName}"]${style}\n`;
        }

        // Add relationships
        for (const [key, relationship] of this.relationships) {
            const arrow = this.getRelationshipArrow(relationship.type);
            diagram += `    ${relationship.from} ${arrow} ${relationship.to}\n`;
        }

        // Add styling
        diagram += '\n    classDef user fill:#e1f5fe,stroke:#01579b,stroke-width:2px\n';
        diagram += '    classDef space fill:#f3e5f5,stroke:#4a148c,stroke-width:2px\n';
        diagram += '    classDef content fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px\n';
        diagram += '    classDef project fill:#fff3e0,stroke:#e65100,stroke-width:2px\n';

        return diagram;
    }

    /**
     * Get styling for entity types
     */
    getEntityStyle(type) {
        switch (type) {
            case 'user': return ':::user';
            case 'space': return ':::space';
            case 'content': return ':::content';
            case 'project': return ':::project';
            default: return '';
        }
    }

    /**
     * Get arrow style for relationship types
     */
    getRelationshipArrow(type) {
        switch (type) {
            case 'mentions': return '-.->|mentions|';
            case 'collaborates': return '<-->|collaborates|';
            case 'owns': return '==>|owns|';
            case 'contributes': return '-->|contributes|';
            default: return '-->';
        }
    }

    /**
     * Create the complete markdown file
     */
    createMarkdownFile(mermaidDiagram) {
        const timestamp = new Date().toISOString();
        
        return `# Atlassian Relationship Map

Generated on: ${timestamp}
Site: ${this.siteConfig.currentSite?.name || 'Unknown'}
Entities: ${this.entities.size}
Relationships: ${this.relationships.size}

## Relationship Diagram

\`\`\`mermaid
${mermaidDiagram}
\`\`\`

## Entity Details

${this.generateEntityTable()}

## Relationship Details

${this.generateRelationshipTable()}

---
*Generated by Atlassian GraphQL MCP Server*
`;
    }

    /**
     * Generate entity details table
     */
    generateEntityTable() {
        let table = '| Name | Type | URL |\n|------|------|-----|\n';
        
        for (const [cleanName, entity] of this.entities) {
            const url = entity.metadata.url || '';
            table += `| ${entity.originalName} | ${entity.type} | ${url} |\n`;
        }
        
        return table;
    }

    /**
     * Generate relationship details table
     */
    generateRelationshipTable() {
        let table = '| From | Relationship | To |\n|------|--------------|----|\n';
        
        for (const [key, relationship] of this.relationships) {
            table += `| ${relationship.fromOriginal} | ${relationship.type} | ${relationship.toOriginal} |\n`;
        }
        
        return table;
    }
}

export default RelationshipMapper;