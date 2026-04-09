/**
 * Site Configuration and CloudId Management
 * 
 * Handles automatic site configuration from environment variables and
 * provides global cloudId injection for all GraphQL queries.
 */

class SiteConfig {
  constructor(graphqlClient = null) {
    this.sites = [];
    this.defaultSite = null;
    this.currentSite = null;
    this.cloudIdCache = new Map();
    this.graphqlClient = graphqlClient;
  }

  /**
   * Initialize site configuration from environment variables
   * Supports:
   * - ATLASSIAN_SITE: Single site or comma-separated list
   * - ATLASSIAN_DEFAULT_SITE: Default site to use
   */
  async initialize() {
    console.log('Initializing site configuration...');
    
    const siteEnv = process.env.ATLASSIAN_SITE;
    const defaultSiteEnv = process.env.ATLASSIAN_DEFAULT_SITE;
    
    if (!siteEnv) {
      console.log('No ATLASSIAN_SITE environment variable found');
      return;
    }

    // Parse sites from environment variable
    const siteUrls = siteEnv.split(',').map(s => s.trim()).filter(Boolean);
    
    console.log(`Found ${siteUrls.length} site(s):`, siteUrls);

    // Extract cloudIds for each site
    for (const siteUrl of siteUrls) {
      try {
        const cloudId = await this.extractCloudIdFromSite(siteUrl);
        const siteConfig = {
          url: siteUrl,
          cloudId: cloudId,
          name: siteUrl.replace(/^https?:\/\//, '').replace(/\.atlassian\.net.*$/, '')
        };
        
        this.sites.push(siteConfig);
        this.cloudIdCache.set(siteUrl, cloudId);
        
        console.log(`Site configured: ${siteConfig.name} -> ${cloudId}`);
      } catch (error) {
        console.error(`Failed to configure site ${siteUrl}:`, error.message);
      }
    }

    // Set default site
    if (defaultSiteEnv) {
      this.defaultSite = this.sites.find(s => s.url.includes(defaultSiteEnv));
    }
    
    if (!this.defaultSite && this.sites.length > 0) {
      this.defaultSite = this.sites[0];
    }

    this.currentSite = this.defaultSite;
    
    if (this.currentSite) {
      console.log(`Default site set to: ${this.currentSite.name} (${this.currentSite.cloudId})`);
    }
  }

  /**
   * Extract cloudId from a site URL by making a real API call to Atlassian
   */
  async extractCloudIdFromSite(siteUrl) {
    // Normalize URL
    const baseUrl = siteUrl.replace(/\/$/, '');
    if (!baseUrl.includes('atlassian.net')) {
      throw new Error(`Invalid Atlassian site URL: ${siteUrl}`);
    }

    const match = baseUrl.match(/^https?:\/\/([^.]+)\.atlassian\.net/);
    if (!match) {
      throw new Error(`Cannot extract site name from URL: ${siteUrl}`);
    }

    const siteName = match[1];

    if (!this.graphqlClient) {
      // Fallback to mock if no GraphQL client available
      console.warn('No GraphQL client available, using mock cloudId');
      return `${siteName.replace(/[^a-z0-9]/gi, '')}-${this.generateMockId()}`;
    }

    try {
      // Use GraphQL tenantContexts query with hostname
      const hostname = `${siteName}.atlassian.net`;
      const query = `query GetTenantContexts($hostNames: [String!]!) { 
        tenantContexts(hostNames: $hostNames) { 
          cloudId 
        } 
      }`;
      
      const result = await this.graphqlClient.query(query, { hostNames: [hostname] });
      
      if (result.success && result.data?.tenantContexts?.length > 0) {
        const realCloudId = result.data.tenantContexts[0].cloudId;
        console.log(`Found real cloudId for ${siteName}: ${realCloudId}`);
        return realCloudId;
      } else {
        throw new Error(`No tenant context found for hostname: ${hostname}`);
      }

    } catch (error) {
      console.error(`Failed to get real cloudId for ${siteName}:`, error.message);
      throw error; // Re-throw instead of falling back to mock
    }
  }

  /**
   * Generate a mock cloudId for testing purposes
   */
  generateMockId() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get current cloudId for injection into queries
   */
  getCurrentCloudId() {
    return this.currentSite?.cloudId || null;
  }

  /**
   * Get all configured sites
   */
  getSites() {
    return this.sites;
  }

  /**
   * Switch to a different site
   */
  switchSite(siteNameOrUrl) {
    const site = this.sites.find(s => 
      s.name === siteNameOrUrl || 
      s.url.includes(siteNameOrUrl) ||
      s.cloudId === siteNameOrUrl
    );
    
    if (!site) {
      throw new Error(`Site not found: ${siteNameOrUrl}. Available sites: ${this.sites.map(s => s.name).join(', ')}`);
    }
    
    this.currentSite = site;
    console.log(`Switched to site: ${site.name} (${site.cloudId})`);
    return site;
  }

  /**
   * Inject cloudId into GraphQL variables if not already present
   */
  injectCloudId(variables = {}) {
    const cloudId = this.getCurrentCloudId();
    
    if (!cloudId) {
      return variables;
    }

    // Only inject if not already present
    if (!variables.cloudId) {
      return {
        ...variables,
        cloudId: cloudId
      };
    }
    
    return variables;
  }

  /**
   * Get site configuration for display
   */
  getStatus() {
    return {
      currentSite: this.currentSite,
      availableSites: this.sites,
      totalSites: this.sites.length
    };
  }
}

export default SiteConfig;