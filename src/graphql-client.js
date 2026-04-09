import { GraphQLClient } from 'graphql-request';

export class AtlassianGraphQLClient {
  constructor(email, apiToken, siteConfig = null) {
    if (!email || !apiToken) {
      throw new Error('Email and API token are required for Atlassian API authentication');
    }

    this.email = email;
    this.apiToken = apiToken;
    this.endpoint = 'https://api.atlassian.com/graphql';
    this.siteConfig = siteConfig;
    
    // Initialize GraphQL client with basic auth
    this.client = new GraphQLClient(this.endpoint, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Execute a GraphQL query
   * @param {string} query - The GraphQL query string
   * @param {object} variables - Query variables
   * @returns {Promise<object>} The query result
   */
  async query(query, variables = {}) {
    try {
      // Inject cloudId if site config is available
      const finalVariables = this.siteConfig ? this.siteConfig.injectCloudId(variables) : variables;
      
      const data = await this.client.request(query, finalVariables);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          response: error.response,
          request: error.request,
        },
      };
    }
  }

  /**
   * Get current user to verify authentication
   * @returns {Promise<object>} User information
   */
  async getCurrentUser() {
    const query = `
      query GetCurrentUser {
        me {
          user {
            accountId
            name
            email
            accountStatus
          }
          availableProducts {
            name
            url
          }
        }
      }
    `;

    return this.query(query);
  }

  /**
   * Get available cloud IDs for the authenticated user
   * @returns {Promise<object>} List of accessible sites
   */
  async getCloudIds() {
    const query = `
      query GetCloudIds {
        tenantContexts {
          cloudId
          displayName
          url
          products {
            name
            url
          }
        }
      }
    `;

    return this.query(query);
  }
}