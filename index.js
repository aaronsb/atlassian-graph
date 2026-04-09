#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { AtlassianGraphQLClient } from './src/graphql-client.js';
import { SchemaIntrospector } from './src/schema-introspector.js';
import { DynamicToolGenerator } from './src/dynamic-tool-generator.js';
import SiteConfig from './src/site-config.js';

class AtlassianGraphServer {
  constructor() {
    this.server = new Server(
      {
        name: 'atlassian-graph-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.graphqlClient = null;
    this.introspector = null;
    this.toolGenerator = null;
    this.siteConfig = new SiteConfig();
    this.setupHandlers();
  }

  async initialize() {
    const email = process.env.ATLASSIAN_EMAIL;
    const apiToken = process.env.ATLASSIAN_API_TOKEN;

    if (email && apiToken) {
      try {
        // Create GraphQL client first
        this.graphqlClient = new AtlassianGraphQLClient(email, apiToken);
        
        // Initialize site configuration with GraphQL client for real cloudId resolution
        this.siteConfig = new SiteConfig(this.graphqlClient);
        await this.siteConfig.initialize();
        
        // Update GraphQL client with site config
        this.graphqlClient.siteConfig = this.siteConfig;
        console.error('Atlassian GraphQL client initialized');
        
        // Initialize schema introspector
        this.introspector = new SchemaIntrospector(this.graphqlClient);
        const introspectionSuccess = await this.introspector.initialize();
        
        if (introspectionSuccess) {
          console.error('Schema introspection completed');
          
          // Initialize dynamic tool generator
          this.toolGenerator = new DynamicToolGenerator(this.introspector);
          const generationSuccess = await this.toolGenerator.initialize();
          
          if (generationSuccess) {
            console.error('Dynamic tool generation completed');
          } else {
            console.error('Dynamic tool generation failed - using static tools');
          }
          
          // Initialize relationship mapper
        } else {
          console.error('Schema introspection failed - some features may be limited');
        }
      } catch (error) {
        console.error('Failed to initialize:', error.message);
      }
    } else {
      console.error('Warning: ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN not set');
    }
  }

  setupHandlers() {
    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const staticTools = [
        {
          name: 'ping',
          description: 'Test that the server is running',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'query',
          description: 'Execute a raw GraphQL query against Atlassian API',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The GraphQL query to execute',
              },
              variables: {
                type: 'object',
                description: 'Query variables (optional)',
                default: {},
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'auth-verify',
          description: 'Verify authentication and list available sites',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'schema-explore',
          description: 'Explore the GraphQL schema by category or field',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['categories', 'category', 'field', 'search'],
                description: 'Type of exploration: categories (list all), category (fields in category), field (field details), search (find fields)'
              },
              target: {
                type: 'string',
                description: 'Category name, field name, or search pattern depending on action'
              }
            },
            required: ['action']
          },
        },
        {
          name: 'tool-classes',
          description: 'View and manage tool class configuration',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['list', 'enable', 'disable', 'status'],
                description: 'Action: list (show all classes), enable/disable (toggle class), status (current config)'
              },
              className: {
                type: 'string',
                description: 'Tool class name (for enable/disable actions)'
              }
            },
            required: ['action']
          },
        },
        {
          name: 'site-config',
          description: 'Manage Atlassian site configuration and selection',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['status', 'switch', 'list'],
                description: 'Action: status (current config), switch (change site), list (available sites)'
              },
              site: {
                type: 'string',
                description: 'Site name, URL, or cloudId to switch to (required for switch action)'
              }
            },
            required: ['action']
          },
        },
      ];

      // Add generated tools if available
      const generatedTools = this.toolGenerator ? this.toolGenerator.getGeneratedTools() : [];
      
      return {
        tools: [...staticTools, ...generatedTools]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'ping':
          return {
            content: [
              {
                type: 'text',
                text: 'pong',
              },
            ],
          };

        case 'query':
          if (!this.graphqlClient) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: GraphQL client not initialized. Please set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN environment variables.',
                },
              ],
            };
          }

          try {
            const result = await this.graphqlClient.query(args.query, args.variables || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Query error: ${error.message}`,
                },
              ],
            };
          }

        case 'auth-verify':
          if (!this.graphqlClient) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: GraphQL client not initialized. Please set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN environment variables.',
                },
              ],
            };
          }

          try {
            const [userResult, sitesResult] = await Promise.all([
              this.graphqlClient.getCurrentUser(),
              this.graphqlClient.getCloudIds(),
            ]);

            const response = {
              authentication: userResult.success ? 'verified' : 'failed',
              user: userResult.data?.me?.user || null,
              sites: sitesResult.data?.tenantContexts || [],
              errors: [],
            };

            if (!userResult.success) {
              response.errors.push(`User query failed: ${userResult.error.message}`);
            }
            if (!sitesResult.success) {
              response.errors.push(`Sites query failed: ${sitesResult.error.message}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Authentication verification error: ${error.message}`,
                },
              ],
            };
          }

        case 'schema-explore':
          if (!this.introspector) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Schema introspection not available. Check server initialization.',
                },
              ],
            };
          }

          try {
            const { action, target } = args;
            let result;

            switch (action) {
              case 'categories':
                const tree = this.introspector.getSchemaTree();
                result = {
                  metadata: tree.metadata,
                  categories: Object.keys(tree.categories).map(key => ({
                    name: key,
                    description: tree.categories[key].description,
                    fieldCount: tree.categories[key].fields.length
                  }))
                };
                break;

              case 'category':
                if (!target) {
                  throw new Error('Category name required for category action');
                }
                const categoryFields = this.introspector.getCategoryFields(target);
                const categoryConstructor = this.introspector.getCategoryConstructor(target);
                result = {
                  category: target,
                  fields: categoryFields,
                  constructor: categoryConstructor
                };
                break;

              case 'field':
                if (!target) {
                  throw new Error('Field name required for field action');
                }
                const fieldInfo = this.introspector.getFieldInfo(target);
                result = fieldInfo || { error: `Field '${target}' not found` };
                break;

              case 'search':
                if (!target) {
                  throw new Error('Search pattern required for search action');
                }
                const matches = this.introspector.findFieldsByPattern(target);
                result = {
                  pattern: target,
                  matches: matches.slice(0, 20), // Limit to 20 results
                  totalMatches: matches.length
                };
                break;

              default:
                throw new Error(`Unknown action: ${action}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Schema exploration error: ${error.message}`,
                },
              ],
            };
          }

        case 'tool-classes':
          try {
            const { action, className } = args;
            let result;

            switch (action) {
              case 'list':
                const summary = this.toolGenerator?.toolClassManager?.getClassSummary();
                if (!summary) {
                  throw new Error('Tool class manager not initialized');
                }
                result = summary;
                break;

              case 'status':
                result = {
                  totalTools: this.toolGenerator?.getGeneratedTools()?.length || 0,
                  enabledClasses: this.toolGenerator?.toolClassManager?.enabledClasses || [],
                  config: this.toolGenerator?.toolClassManager?.config || {}
                };
                break;

              case 'enable':
              case 'disable':
                result = {
                  message: `Note: To ${action} tool classes, update the .env file and restart the server`,
                  example: `ENABLE_${className}=${action === 'enable' ? 'true' : 'false'}`
                };
                break;

              default:
                throw new Error(`Unknown action: ${action}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error managing tool classes: ${error.message}`,
                },
              ],
            };
          }

        case 'site-config':
          try {
            const { action, site } = args;
            let result;

            switch (action) {
              case 'status':
                result = this.siteConfig.getStatus();
                break;

              case 'list':
                result = {
                  sites: this.siteConfig.getSites(),
                  currentSite: this.siteConfig.currentSite
                };
                break;

              case 'switch':
                if (!site) {
                  throw new Error('Site parameter required for switch action');
                }
                const switchedSite = this.siteConfig.switchSite(site);
                result = {
                  message: `Switched to site: ${switchedSite.name}`,
                  currentSite: switchedSite
                };
                break;

              default:
                throw new Error(`Unknown site-config action: ${action}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Site configuration error: ${error.message}`,
                },
              ],
            };
          }


        default:
          // Check if this is a dynamically generated tool
          if (this.toolGenerator) {
            const generatedTool = this.toolGenerator.getToolByName(name);
            if (generatedTool) {
              return await this.handleGeneratedTool(generatedTool, args);
            }
          }
          
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async handleGeneratedTool(tool, args) {
    if (!this.graphqlClient) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: GraphQL client not initialized. Please set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN environment variables.',
          },
        ],
      };
    }

    try {
      // Use the tool's query builder to construct the GraphQL query
      const { query, variables } = tool.metadata.queryBuilder.buildQuery(args);
      
      // Execute the query
      const result = await this.graphqlClient.query(query, variables);
      
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Query failed: ${result.error.message}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution error: ${error.message}`,
          },
        ],
      };
    }
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'atlassian://schema/tree',
          name: 'Schema Tree',
          description: 'Complete GraphQL schema organized by categories',
          mimeType: 'application/json'
        },
        {
          uri: 'atlassian://schema/categories',
          name: 'Schema Categories',
          description: 'Field categorization and patterns',
          mimeType: 'application/json'
        }
      ]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (!this.introspector) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: 'Schema introspection not available'
            }
          ]
        };
      }

      switch (uri) {
        case 'atlassian://schema/tree':
          const tree = this.introspector.getSchemaTree();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(tree, null, 2)
              }
            ]
          };

        case 'atlassian://schema/categories':
          const categoriesData = {
            categories: this.introspector.getSchemaTree()?.categories || {},
            metadata: this.introspector.getSchemaTree()?.metadata || {}
          };
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(categoriesData, null, 2)
              }
            ]
          };

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  async run() {
    await this.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Atlassian Graph MCP server running');
  }
}

const server = new AtlassianGraphServer();
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});