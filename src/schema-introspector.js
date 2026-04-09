import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SchemaIntrospector {
  constructor(graphqlClient) {
    this.client = graphqlClient;
    this.categories = null;
    this.schemaTree = null;
    this.introspectionData = null;
  }

  async initialize() {
    try {
      console.error('Loading field categories...');
      await this.loadCategories();
      
      console.error('Performing GraphQL introspection...');
      await this.performIntrospection();
      
      console.error('Building schema tree...');
      await this.buildSchemaTree();
      
      console.error('Schema introspection complete');
      return true;
    } catch (error) {
      console.error('Schema introspection failed:', error.message);
      return false;
    }
  }

  async loadCategories() {
    const categoriesPath = path.join(__dirname, 'field-categories.json');
    const categoriesData = await fs.readFile(categoriesPath, 'utf8');
    this.categories = JSON.parse(categoriesData);
  }

  async performIntrospection() {
    const introspectionQuery = `
      query IntrospectSchema {
        __schema {
          queryType {
            name
            fields {
              name
              description
              type {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
              args {
                name
                description
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
                defaultValue
              }
            }
          }
        }
      }
    `;

    const result = await this.client.query(introspectionQuery);
    if (!result.success) {
      throw new Error(`Introspection failed: ${result.error.message}`);
    }

    this.introspectionData = result.data.__schema.queryType.fields;
  }

  categorizeField(fieldName) {
    // Check each category's patterns
    for (const [categoryKey, categoryData] of Object.entries(this.categories.categories)) {
      for (const pattern of categoryData.patterns) {
        const regex = new RegExp(pattern);
        if (regex.test(fieldName)) {
          return {
            category: categoryKey,
            description: categoryData.description,
            matchedPattern: pattern
          };
        }
      }
    }

    // Return catch-all if no pattern matches
    return {
      category: this.categories.catch_all.category,
      description: this.categories.catch_all.description,
      matchedPattern: null
    };
  }

  buildSchemaTree() {
    const tree = {
      metadata: {
        totalFields: this.introspectionData.length,
        introspectedAt: new Date().toISOString(),
        categories: {}
      },
      categories: {},
      fields: {},
      constructors: {}
    };

    // Initialize category counts
    Object.keys(this.categories.categories).forEach(cat => {
      tree.metadata.categories[cat] = 0;
    });
    tree.metadata.categories[this.categories.catch_all.category] = 0;

    // Categorize and organize fields
    this.introspectionData.forEach(field => {
      const categorization = this.categorizeField(field.name);
      
      // Update category count
      tree.metadata.categories[categorization.category]++;

      // Initialize category if needed
      if (!tree.categories[categorization.category]) {
        tree.categories[categorization.category] = {
          description: categorization.description,
          fields: []
        };
      }

      // Add field to category
      tree.categories[categorization.category].fields.push(field.name);

      // Store full field data
      tree.fields[field.name] = {
        ...field,
        categorization,
        constructor: this.buildFieldConstructor(field)
      };
    });

    // Build query constructors for each category
    Object.keys(tree.categories).forEach(categoryKey => {
      tree.constructors[categoryKey] = this.buildCategoryConstructor(
        categoryKey, 
        tree.categories[categoryKey].fields,
        tree.fields
      );
    });

    this.schemaTree = tree;
  }

  buildFieldConstructor(field) {
    return {
      name: field.name,
      type: field.type,
      args: field.args || [],
      examples: this.generateFieldExamples(field),
      queryTemplate: this.generateQueryTemplate(field)
    };
  }

  generateFieldExamples(field) {
    const examples = [];
    
    // Simple field access
    examples.push({
      type: 'simple',
      query: `{ ${field.name} }`,
      description: `Basic ${field.name} query`
    });

    // With arguments if available
    if (field.args && field.args.length > 0) {
      const argExamples = field.args.map(arg => {
        return `${arg.name}: $${arg.name}`;
      }).join(', ');
      
      examples.push({
        type: 'with_args',
        query: `{ ${field.name}(${argExamples}) }`,
        description: `${field.name} with arguments`,
        variables: field.args.reduce((vars, arg) => {
          vars[arg.name] = this.getExampleValue(arg.type);
          return vars;
        }, {})
      });
    }

    return examples;
  }

  generateQueryTemplate(field) {
    return {
      fragment: field.name,
      args: field.args || [],
      returnType: field.type
    };
  }

  getExampleValue(type) {
    // Generate example values based on GraphQL type
    switch (type.name || type.kind) {
      case 'String':
        return 'example';
      case 'Int':
        return 10;
      case 'Boolean':
        return true;
      case 'ID':
        return 'example-id';
      default:
        return null;
    }
  }

  buildCategoryConstructor(categoryKey, fieldNames, fieldsData) {
    return {
      category: categoryKey,
      availableFields: fieldNames,
      commonPatterns: this.findCommonPatterns(fieldNames),
      suggestedQueries: this.generateCategorySuggestions(categoryKey, fieldNames, fieldsData)
    };
  }

  findCommonPatterns(fieldNames) {
    // Find common prefixes and suffixes
    const patterns = {
      prefixes: {},
      suffixes: {}
    };

    fieldNames.forEach(name => {
      // Track prefixes (up to first underscore)
      const parts = name.split('_');
      if (parts.length > 1) {
        const prefix = parts[0];
        patterns.prefixes[prefix] = (patterns.prefixes[prefix] || 0) + 1;
      }

      // Track suffixes
      if (name.includes('_')) {
        const suffix = name.split('_').pop();
        patterns.suffixes[suffix] = (patterns.suffixes[suffix] || 0) + 1;
      }
    });

    return patterns;
  }

  generateCategorySuggestions(categoryKey, fieldNames, fieldsData) {
    const suggestions = [];

    // Add most common/useful fields for this category
    const priorityFields = this.getPriorityFieldsForCategory(categoryKey, fieldNames);
    
    priorityFields.forEach(fieldName => {
      const field = fieldsData[fieldName];
      if (field) {
        suggestions.push({
          field: fieldName,
          description: field.description || `Query ${fieldName}`,
          example: field.constructor.examples[0]
        });
      }
    });

    return suggestions;
  }

  getPriorityFieldsForCategory(categoryKey, fieldNames) {
    // Define high-priority fields for each category
    const priorities = {
      core_products: ['jira', 'confluence', 'bitbucket'],
      identity_user: ['me', 'user', 'users'],
      search_discovery: ['search', 'suggest'],
      project_work: ['projects_search', 'jsw'],
      content_knowledge: ['content', 'spaces', 'pages']
    };

    const priorityList = priorities[categoryKey] || [];
    
    // Return intersection of priority fields and available fields
    return priorityList.filter(field => fieldNames.includes(field))
      .concat(fieldNames.filter(field => !priorityList.includes(field)).slice(0, 3));
  }

  // Public API methods
  getSchemaTree() {
    return this.schemaTree;
  }

  getCategoryFields(categoryKey) {
    return this.schemaTree?.categories[categoryKey]?.fields || [];
  }

  getFieldConstructor(fieldName) {
    return this.schemaTree?.fields[fieldName]?.constructor;
  }

  getCategoryConstructor(categoryKey) {
    return this.schemaTree?.constructors[categoryKey];
  }

  findFieldsByPattern(pattern) {
    if (!this.schemaTree) return [];
    
    const regex = new RegExp(pattern, 'i');
    return Object.keys(this.schemaTree.fields).filter(name => regex.test(name));
  }

  getFieldInfo(fieldName) {
    return this.schemaTree?.fields[fieldName];
  }
}