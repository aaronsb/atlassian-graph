// Strong 8-bit / VGA vibes — every color is max saturation (one channel at
// 0, another at 0xFF). Hues are spaced around the wheel so adjacent
// categories don't collide. Renders as literal hex because the Canvas has
// tone mapping disabled (flat) and materials have toneMapped:false.
export const CATEGORY_COLORS = {
  core_products:      '#0080FF', // azure blue
  identity_user:      '#FF0080', // hot pink
  search_discovery:   '#FFFF00', // pure yellow
  development_devops: '#00FF00', // pure green
  project_work:       '#FF8000', // orange
  content_knowledge:  '#00FFFF', // pure cyan
  ai_intelligence:    '#8000FF', // violet
  apps_marketplace:   '#FF00FF', // pure magenta
  feeds_activity:     '#00FF80', // spring green
  analytics_insights: '#FFBF00', // amber / gold
  collaboration:      '#80FF00', // chartreuse / lime
  administration:     '#FF0000', // pure red
  specialized_tools:  '#BF00FF', // grape
  support_help:       '#FF4000', // red-orange
  meta_system:        '#0000FF', // pure blue
  uncategorized:      '#808080', // neutral gray — stays out of the hue wheel
};

export function colorFor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.uncategorized;
}
