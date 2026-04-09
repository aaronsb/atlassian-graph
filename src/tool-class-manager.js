/**
 * Tool Class Manager
 * Manages hierarchical tool organization based on Atlassian's System of Work
 * Reduces 500+ tools to a manageable subset based on configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ToolClassManager {
  constructor() {
    this.toolClasses = this.loadToolClasses();
    this.config = this.loadConfiguration();
    this.enabledClasses = this.getEnabledClasses();
  }

  loadToolClasses() {
    const classesPath = path.join(__dirname, 'tool-classes.json');
    const data = fs.readFileSync(classesPath, 'utf8');
    return JSON.parse(data);
  }

  loadConfiguration() {
    return {
      maxToolsPerClass: parseInt(process.env.MAX_TOOLS_PER_CLASS || '15'),
      totalMaxTools: parseInt(process.env.TOTAL_MAX_TOOLS || '50'),
      enabledClasses: {
        FOUNDATIONAL: process.env.ENABLE_FOUNDATIONAL_TOOLS !== 'false',
        AI_INTELLIGENCE: process.env.ENABLE_AI_INTELLIGENCE !== 'false',
        SPECIALIZED_SOLUTIONS: process.env.ENABLE_SPECIALIZED_SOLUTIONS !== 'false',
        TEAMWORK_GRAPH: process.env.ENABLE_TEAMWORK_GRAPH !== 'false',
        MARKETPLACE_ECOSYSTEM: process.env.ENABLE_MARKETPLACE_ECOSYSTEM === 'true',
        ADMINISTRATION: process.env.ENABLE_ADMINISTRATION === 'true',
        COLLABORATION: process.env.ENABLE_COLLABORATION !== 'false'
      }
    };
  }

  getEnabledClasses() {
    const enabled = [];
    for (const [className, classData] of Object.entries(this.toolClasses.toolClasses)) {
      if (this.config.enabledClasses[className]) {
        enabled.push({
          name: className,
          ...classData
        });
      }
    }
    // Sort by priority
    return enabled.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Filter generated tools based on enabled classes and patterns
   * @param {Array} generatedTools - Array of all generated tools
   * @returns {Array} Filtered tools based on configuration
   */
  filterTools(generatedTools) {
    console.log(`\n🎯 Tool Class Manager: Filtering ${generatedTools.length} tools...`);
    
    const selectedTools = [];
    const toolsByClass = {};
    
    // Initialize tool tracking for enabled classes
    for (const toolClass of this.enabledClasses) {
      toolsByClass[toolClass.name] = [];
    }

    // First pass: collect essential tools
    for (const toolClass of this.enabledClasses) {
      const essentialTools = this.getEssentialTools(toolClass, generatedTools);
      toolsByClass[toolClass.name].push(...essentialTools);
      selectedTools.push(...essentialTools);
    }

    // Second pass: add pattern-matched tools up to limit
    for (const toolClass of this.enabledClasses) {
      const remainingSlots = this.config.maxToolsPerClass - toolsByClass[toolClass.name].length;
      if (remainingSlots > 0) {
        const patternTools = this.getPatternMatchedTools(
          toolClass, 
          generatedTools, 
          toolsByClass[toolClass.name],
          remainingSlots
        );
        toolsByClass[toolClass.name].push(...patternTools);
        selectedTools.push(...patternTools);
      }
    }

    // Ensure we don't exceed total limit
    const finalTools = selectedTools.slice(0, this.config.totalMaxTools);
    
    // Log summary
    console.log('\n📊 Tool Selection Summary:');
    for (const [className, tools] of Object.entries(toolsByClass)) {
      if (tools.length > 0) {
        console.log(`  ${className}: ${tools.length} tools`);
      }
    }
    console.log(`  Total: ${finalTools.length} tools (limit: ${this.config.totalMaxTools})`);

    return finalTools;
  }

  getEssentialTools(toolClass, generatedTools) {
    const essentialTools = [];
    
    for (const [productName, productData] of Object.entries(toolClass.tools || {})) {
      for (const essentialName of productData.essentials || []) {
        const tool = generatedTools.find(t => t.name === essentialName);
        if (tool && !essentialTools.some(t => t.name === tool.name)) {
          essentialTools.push({
            ...tool,
            toolClass: toolClass.name,
            isEssential: true
          });
        }
      }
    }
    
    return essentialTools;
  }

  getPatternMatchedTools(toolClass, generatedTools, existingTools, limit) {
    const matchedTools = [];
    const existingNames = new Set(existingTools.map(t => t.name));
    
    for (const [productName, productData] of Object.entries(toolClass.tools || {})) {
      for (const pattern of productData.patterns || []) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        
        for (const tool of generatedTools) {
          if (matchedTools.length >= limit) break;
          
          // Check if tool matches pattern and isn't already selected
          if (regex.test(tool.field) && !existingNames.has(tool.name)) {
            matchedTools.push({
              ...tool,
              toolClass: toolClass.name,
              matchedPattern: pattern
            });
            existingNames.add(tool.name);
          }
        }
      }
    }
    
    return matchedTools.slice(0, limit);
  }

  /**
   * Get tool by name, with dynamic expansion if needed
   * @param {string} toolName - Name of the tool to find
   * @param {Array} allTools - All available tools
   * @returns {Object|null} Tool if found or expandable
   */
  getToolByName(toolName, allTools) {
    // First check if tool is in the filtered set
    const filteredTools = this.filterTools(allTools);
    let tool = filteredTools.find(t => t.name === toolName);
    
    if (tool) {
      return tool;
    }
    
    // If not found but expansion is enabled, check if it exists in all tools
    if (this.toolClasses.configuration.expansionMode === 'dynamic') {
      tool = allTools.find(t => t.name === toolName);
      if (tool) {
        console.log(`🔍 Dynamically expanding to include tool: ${toolName}`);
        return tool;
      }
    }
    
    return null;
  }

  /**
   * Get a summary of available tool classes and their status
   */
  getClassSummary() {
    const summary = {
      enabled: [],
      disabled: [],
      total: Object.keys(this.toolClasses.toolClasses).length
    };
    
    for (const [className, classData] of Object.entries(this.toolClasses.toolClasses)) {
      const info = {
        name: className,
        displayName: classData.name,
        description: classData.description,
        products: classData.products
      };
      
      if (this.config.enabledClasses[className]) {
        summary.enabled.push(info);
      } else {
        summary.disabled.push(info);
      }
    }
    
    return summary;
  }
}

export default ToolClassManager;