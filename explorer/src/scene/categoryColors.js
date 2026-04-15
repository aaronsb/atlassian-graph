export const CATEGORY_COLORS = {
  core_products:      '#4c9aff',
  identity_user:      '#f06595',
  search_discovery:   '#ffd43b',
  development_devops: '#51cf66',
  project_work:       '#ff922b',
  content_knowledge:  '#3bc9db',
  ai_intelligence:    '#b197fc',
  apps_marketplace:   '#ff6b9d',
  feeds_activity:     '#63e6be',
  analytics_insights: '#ffc078',
  collaboration:      '#94d82d',
  administration:     '#a18072',
  specialized_tools:  '#868e96',
  support_help:       '#ffa8a8',
  meta_system:        '#495057',
  uncategorized:      '#2b2b3a',
};

export function colorFor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.uncategorized;
}
