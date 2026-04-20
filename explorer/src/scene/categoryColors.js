// Bright, saturated palette — picked to stay vivid on the dark background
// even after the dim/focus multipliers in Nodes/Edges knock them down.
// No dark or desaturated entries: every category gets a color that reads
// cleanly at full brightness and still has legs at 12% dim.
export const CATEGORY_COLORS = {
  core_products:      '#4dabf7', // blue
  identity_user:      '#ff6b9d', // pink
  search_discovery:   '#ffd43b', // yellow
  development_devops: '#51cf66', // green
  project_work:       '#ff922b', // orange
  content_knowledge:  '#22d3ee', // cyan
  ai_intelligence:    '#c084fc', // purple
  apps_marketplace:   '#f472b6', // rose
  feeds_activity:     '#2dd4bf', // teal
  analytics_insights: '#fbbf24', // amber
  collaboration:      '#a3e635', // lime
  administration:     '#fb7185', // coral
  specialized_tools:  '#e879f9', // magenta
  support_help:       '#fb923c', // peach
  meta_system:        '#818cf8', // indigo
  uncategorized:      '#94a3b8', // slate — neutral but still on the bright side
};

export function colorFor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.uncategorized;
}
