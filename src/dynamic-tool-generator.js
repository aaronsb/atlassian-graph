import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ToolClassManager } from './tool-class-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DynamicToolGenerator {
  constructor(schemaIntrospector) {
    this.introspector = schemaIntrospector;
    this.verbMappings = null;
    this.generatedTools = new Map();
    this.allGeneratedTools = []; // Keep track of all tools before filtering
    this.toolClassManager = new ToolClassManager();
  }

  async initialize() {
    try {
      console.error('Loading verb mappings...');
      await this.loadVerbMappings();
      
      console.error('Generating dynamic tools...');
      await this.generateTools();
      
      console.error(`Generated ${this.generatedTools.size} dynamic tools:`);
      this.logGeneratedTools();
      return true;
    } catch (error) {
      console.error('Dynamic tool generation failed:', error.message);
      return false;
    }
  }

  async loadVerbMappings() {
    const mappingsPath = path.join(__dirname, 'verb-mappings.json');
    const mappingsData = await fs.readFile(mappingsPath, 'utf8');
    this.verbMappings = JSON.parse(mappingsData);
  }

  async generateTools() {
    if (!this.introspector?.getSchemaTree()) {
      throw new Error('Schema introspector not initialized');
    }

    const schemaTree = this.introspector.getSchemaTree();
    
    // Generate tools for each category
    for (const [categoryKey, categoryData] of Object.entries(schemaTree.categories)) {
      await this.generateToolsForCategory(categoryKey, categoryData);
    }
    
    // Store all generated tools before filtering
    this.allGeneratedTools = Array.from(this.generatedTools.values());
    
    // Apply tool class filtering
    const filteredTools = this.toolClassManager.filterTools(this.allGeneratedTools);
    
    // Replace generatedTools map with filtered tools
    this.generatedTools.clear();
    for (const tool of filteredTools) {
      this.generatedTools.set(tool.name, tool);
    }
  }

  async generateToolsForCategory(categoryKey, categoryData) {
    const categoryConfig = this.verbMappings.categories[categoryKey];
    if (!categoryConfig) {
      console.error(`No verb mapping config for category: ${categoryKey}`);
      return;
    }

    const fields = categoryData.fields;
    const maxTools = this.verbMappings.rules.maxToolsPerCategory;
    let toolCount = 0;

    // Process fields in priority order
    for (const verb of this.verbMappings.rules.preferredVerbOrder) {
      if (toolCount >= maxTools) break;
      
      const verbConfig = this.verbMappings.verbs[verb];
      const matchingFields = this.findFieldsForVerb(fields, verbConfig);
      
      for (const fieldName of matchingFields) {
        if (toolCount >= maxTools) break;
        
        const tool = await this.createToolFromField(fieldName, verb, categoryKey);
        if (tool) {
          this.generatedTools.set(tool.name, tool);
          toolCount++;
        }
      }
    }
  }

  findFieldsForVerb(fields, verbConfig) {
    const matchingFields = [];
    
    for (const fieldName of fields) {
      const fieldInfo = this.introspector.getFieldInfo(fieldName);
      if (!fieldInfo) continue;
      
      if (this.fieldMatchesVerbPattern(fieldInfo, verbConfig)) {
        matchingFields.push(fieldName);
      }
    }
    
    return matchingFields;
  }

  fieldMatchesVerbPattern(fieldInfo, verbConfig) {
    const patterns = verbConfig.patterns;
    
    // Check field name patterns
    if (patterns.fieldName) {
      const nameMatch = patterns.fieldName.some(pattern => {
        if (pattern.endsWith('$')) {
          // Regex pattern
          const regex = new RegExp(pattern);
          return regex.test(fieldInfo.name);
        } else {
          // Simple substring match
          return fieldInfo.name.toLowerCase().includes(pattern.toLowerCase());
        }
      });
      if (nameMatch) return true;
    }
    
    // Check argument patterns
    if (patterns.hasArgs && fieldInfo.args) {
      const argMatch = patterns.hasArgs.some(argPattern =>
        fieldInfo.args.some(arg => 
          arg.name.toLowerCase().includes(argPattern.toLowerCase())
        )
      );
      if (argMatch) return true;
    }
    
    // Check return type patterns
    if (patterns.returnType && fieldInfo.type) {
      const typeMatch = patterns.returnType.some(typePattern => {
        if (typePattern.startsWith('!')) {
          // Negative match
          const negPattern = typePattern.slice(1);
          return !this.typeMatches(fieldInfo.type, negPattern);
        } else {
          return this.typeMatches(fieldInfo.type, typePattern);
        }
      });
      if (typeMatch) return true;
    }
    
    return false;
  }

  typeMatches(graphqlType, pattern) {
    const typeName = graphqlType.name || 
                    graphqlType.ofType?.name || 
                    'unknown';
    
    return typeName.toLowerCase().includes(pattern.toLowerCase());
  }

  async createToolFromField(fieldName, verb, categoryKey) {
    const fieldInfo = this.introspector.getFieldInfo(fieldName);
    const verbConfig = this.verbMappings.verbs[verb];
    const categoryConfig = this.verbMappings.categories[categoryKey];
    
    if (!fieldInfo || !verbConfig || !categoryConfig) {
      return null;
    }

    // Generate tool name
    const noun = this.extractNounFromField(fieldName, categoryKey);
    const toolName = verbConfig.toolTemplate.namePattern.replace('{noun}', noun);
    
    // Generate description
    const description = this.generateDescription(fieldInfo, verbConfig, noun);
    
    // Generate input schema
    const inputSchema = this.generateInputSchema(fieldInfo, verbConfig);
    
    // Generate query builder
    const queryBuilder = this.generateQueryBuilder(fieldInfo, verbConfig);
    
    return {
      name: toolName,
      description,
      inputSchema,
      metadata: {
        fieldName,
        verb,
        category: categoryKey,
        noun,
        queryBuilder
      }
    };
  }

  extractNounFromField(fieldName, categoryKey) {
    // Remove common prefixes
    let noun = fieldName
      .replace(/^(jira_|confluence_|bitbucket_|compass_|trello_|opsgenie_)/, '')
      .replace(/^(get|fetch|list|search|find|create|update|delete)/, '')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
    
    // Convert to kebab-case
    noun = noun
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Fallback to category if noun is empty
    if (!noun) {
      noun = categoryKey.replace('_', '-');
    }
    
    return noun;
  }

  generateDescription(fieldInfo, verbConfig, noun) {
    const template = verbConfig.toolTemplate.description;
    let description = template
      .replace('{noun}', noun)
      .replace('{searchType}', this.getSearchType(fieldInfo))
      .replace('{idType}', this.getIdType(fieldInfo));
    
    // Add field description if available
    if (fieldInfo.description) {
      const fieldDesc = fieldInfo.description.split('\n')[0].trim();
      if (fieldDesc && !fieldDesc.includes('OAuth Scopes')) {
        description += `. ${fieldDesc}`;
      }
    }
    
    return description;
  }

  getSearchType(fieldInfo) {
    if (fieldInfo.args?.some(arg => arg.name.includes('cql'))) return 'CQL';
    if (fieldInfo.args?.some(arg => arg.name.includes('jql'))) return 'JQL';
    return 'text';
  }

  getIdType(fieldInfo) {
    const idArg = fieldInfo.args?.find(arg => 
      ['id', 'key', 'ari', 'uuid'].includes(arg.name.toLowerCase())
    );
    return idArg?.name || 'ID';
  }

  generateInputSchema(fieldInfo, verbConfig) {
    const schema = {
      type: 'object',
      properties: {},
      required: []
    };

    // Use actual GraphQL field arguments instead of verb template assumptions
    for (const fieldArg of fieldInfo.args || []) {
      // Skip cloudId as it's injected automatically
      if (fieldArg.name === 'cloudId') continue;
      
      const jsonSchema = this.graphqlTypeToJsonSchema(fieldArg.type, fieldArg.description);
      schema.properties[fieldArg.name] = jsonSchema;
      
      // Check if argument is required (NON_NULL type)
      if (fieldArg.type?.kind === 'NON_NULL') {
        schema.required.push(fieldArg.name);
      }
    }

    return schema;
  }

  getArgConfig(fieldInfo, argName) {
    // Find corresponding GraphQL argument
    const graphqlArg = fieldInfo.args?.find(arg => 
      arg.name.toLowerCase() === argName.toLowerCase() ||
      arg.name.toLowerCase().includes(argName.toLowerCase())
    );

    if (graphqlArg) {
      return {
        available: true,
        schema: this.graphqlTypeToJsonSchema(graphqlArg.type, graphqlArg.description)
      };
    }

    // Provide default schemas for common arguments
    const defaultSchemas = {
      query: {
        type: 'string',
        description: 'Search query text'
      },
      id: {
        type: 'string',
        description: 'Unique identifier'
      },
      cloudId: {
        type: 'string',
        description: 'Cloud ID for multi-tenant routing'
      },
      first: {
        type: 'integer',
        description: 'Number of items to return',
        default: 25,
        minimum: 1,
        maximum: 100
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of results',
        default: 25,
        minimum: 1,
        maximum: 100
      },
      offset: {
        type: 'integer',
        description: 'Number of items to skip',
        default: 0,
        minimum: 0
      },
      after: {
        type: 'string',
        description: 'Cursor for pagination (after this item)'
      }
    };

    return {
      available: !!defaultSchemas[argName],
      schema: defaultSchemas[argName] || { type: 'string' }
    };
  }

  graphqlTypeToJsonSchema(graphqlType, description) {
    if (!graphqlType || !graphqlType.kind) {
      return { type: 'string', description: description || 'Unknown type' };
    }
    
    const isRequired = graphqlType.kind === 'NON_NULL';
    const baseType = isRequired ? graphqlType.ofType : graphqlType;
    
    if (!baseType || !baseType.kind) {
      return { type: 'string', description: description || 'Unknown base type' };
    }
    
    let schema = {};
    
    switch (baseType.kind) {
      case 'SCALAR':
        switch (baseType.name) {
          case 'String':
            schema.type = 'string';
            break;
          case 'Int':
            schema.type = 'integer';
            break;
          case 'Float':
            schema.type = 'number';
            break;
          case 'Boolean':
            schema.type = 'boolean';
            break;
          case 'ID':
            schema.type = 'string';
            schema.description = 'Unique identifier';
            break;
          default:
            schema.type = 'string';
        }
        break;
      case 'LIST':
        schema.type = 'array';
        schema.items = this.graphqlTypeToJsonSchema(baseType.ofType);
        break;
      default:
        schema.type = 'object';
    }
    
    if (description) {
      schema.description = description;
    }
    
    return schema;
  }

  generateQueryBuilder(fieldInfo, verbConfig) {
    return {
      fieldName: fieldInfo.name,
      buildQuery: (args) => {
        const variables = {};
        const argStrings = [];
        
        // Build GraphQL arguments using actual field arguments
        for (const fieldArg of fieldInfo.args || []) {
          const argValue = args[fieldArg.name];
          if (argValue !== undefined && argValue !== null) {
            variables[fieldArg.name] = argValue;
            argStrings.push(`${fieldArg.name}: $${fieldArg.name}`);
          } else if (fieldArg.name === 'cloudId') {
            // Always include cloudId argument if the field supports it (will be injected by site config)
            variables[fieldArg.name] = null; // Placeholder - will be injected
            argStrings.push(`${fieldArg.name}: $${fieldArg.name}`);
          }
        }
        
        const argsString = argStrings.length > 0 ? `(${argStrings.join(', ')})` : '';
        const operationName = `${verbConfig.description.replace(/\s+/g, '')}${fieldInfo.name}`;
        
        // Use actual return type instead of assuming "Connection"
        const returnTypeName = fieldInfo.type?.name || 'Unknown';
        
        return {
          query: `query ${operationName}${this.buildVariableDefinitions(variables, fieldInfo)} { 
            ${fieldInfo.name}${argsString} { 
              __typename 
              ... on ${returnTypeName} { 
                edges { 
                  node { 
                    __typename 
                  } 
                } 
                pageInfo { 
                  hasNextPage 
                  endCursor 
                } 
              } 
            } 
          }`,
          variables
        };
      }
    };
  }

  buildVariableDefinitions(variables, fieldInfo) {
    if (Object.keys(variables).length === 0) return '';
    
    const defs = Object.keys(variables).map(key => {
      // Find the corresponding GraphQL argument to get the correct type
      const fieldArg = fieldInfo.args?.find(arg => arg.name === key);
      if (fieldArg) {
        const graphqlType = this.graphqlTypeToGraphqlString(fieldArg.type);
        return `$${key}: ${graphqlType}`;
      }
      // Fallback to String for unknown arguments
      return `$${key}: String`;
    });
    return `(${defs.join(', ')})`;
  }

  graphqlTypeToGraphqlString(graphqlType) {
    if (!graphqlType) return 'String';
    
    if (graphqlType.kind === 'NON_NULL') {
      return `${this.graphqlTypeToGraphqlString(graphqlType.ofType)}!`;
    }
    
    if (graphqlType.kind === 'LIST') {
      return `[${this.graphqlTypeToGraphqlString(graphqlType.ofType)}]`;
    }
    
    // Return the type name for scalars and objects
    return graphqlType.name || 'String';
  }

  // Public API methods
  getGeneratedTools() {
    return Array.from(this.generatedTools.values());
  }

  getToolByName(name) {
    // First check filtered tools
    let tool = this.generatedTools.get(name);
    if (tool) return tool;
    
    // If not found, try dynamic expansion
    return this.toolClassManager.getToolByName(name, this.allGeneratedTools);
  }

  getToolsByCategory(category) {
    return Array.from(this.generatedTools.values())
      .filter(tool => tool.metadata.category === category);
  }

  getToolsByVerb(verb) {
    return Array.from(this.generatedTools.values())
      .filter(tool => tool.metadata.verb === verb);
  }

  logGeneratedTools() {
    console.error('\n=== Generated Tools by Category ===');
    
    // Group tools by category
    const toolsByCategory = {};
    for (const tool of this.generatedTools.values()) {
      const category = tool.metadata.category;
      if (!toolsByCategory[category]) {
        toolsByCategory[category] = [];
      }
      toolsByCategory[category].push(tool);
    }

    // Log each category
    for (const [category, tools] of Object.entries(toolsByCategory)) {
      console.error(`\n${category.toUpperCase()} (${tools.length} tools):`);
      for (const tool of tools) {
        console.error(`  • ${tool.name} [${tool.metadata.verb}] - ${tool.description}`);
        console.error(`    Field: ${tool.metadata.fieldName}`);
      }
    }

    console.error('\n=== All Tools Alphabetically ===');
    const sortedTools = Array.from(this.generatedTools.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const tool of sortedTools) {
      console.error(`  ${tool.name}`);
    }
    console.error('');
  }
}