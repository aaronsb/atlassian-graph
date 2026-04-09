#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { AtlassianGraphQLClient } from './graphql-client.js';

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
        },
      }
    );

    // Initialize GraphQL client if credentials are available
    this.initializeClient();
    this.setupToolHandlers();
  }

  initializeClient() {
    const email = process.env.ATLASSIAN_EMAIL;
    const apiToken = process.env.ATLASSIAN_API_TOKEN;

    if (email && apiToken) {
      try {
        this.graphqlClient = new AtlassianGraphQLClient(email, apiToken);
        console.error('Atlassian GraphQL client initialized');
      } catch (error) {
        console.error('Failed to initialize GraphQL client:', error.message);
      }
    } else {
      console.error('Warning: ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN not set');
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
      ],
    }));

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

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async run() {
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