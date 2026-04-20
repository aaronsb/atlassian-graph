import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Category order is the assignment index when a ramp is sampled linearly.
// Changing this order re-shuffles which category gets which ramp position;
// the 8-bit mapping below is explicit and unaffected.
export const CATEGORY_ORDER = [
  'core_products',
  'identity_user',
  'search_discovery',
  'development_devops',
  'project_work',
  'content_knowledge',
  'ai_intelligence',
  'apps_marketplace',
  'feeds_activity',
  'analytics_insights',
  'collaboration',
  'administration',
  'specialized_tools',
  'support_help',
  'meta_system',
  'uncategorized',
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function rgbToHex([r, g, b]) {
  const c = v => Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16).padStart(2, '0').toUpperCase();
  return '#' + c(r) + c(g) + c(b);
}

function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function sampleStops(stops, t) {
  // stops: [[t0, [r,g,b]], [t1, [r,g,b]], ...] sorted by t.
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      return lerpRgb(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return last[1];
}

function buildMapFromStops(hexStops, order) {
  const stops = hexStops.map(([t, hex]) => [t, hexToRgb(hex)]);
  const out = {};
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out[order[i]] = rgbToHex(sampleStops(stops, t));
  }
  return out;
}

// Ramp registry. Ramps either supply an explicit `categories` map (8-bit
// hand-picked) or `stops` sampled linearly across CATEGORY_ORDER.
const RAMP_DEFS = [
  {
    id: '8bit',
    label: '8-bit VGA',
    categories: {
      core_products:      '#0080FF',
      identity_user:      '#FF0080',
      search_discovery:   '#FFFF00',
      development_devops: '#00FF00',
      project_work:       '#FF8000',
      content_knowledge:  '#00FFFF',
      ai_intelligence:    '#8000FF',
      apps_marketplace:   '#FF00FF',
      feeds_activity:     '#00FF80',
      analytics_insights: '#FFBF00',
      collaboration:      '#80FF00',
      administration:     '#FF0000',
      specialized_tools:  '#BF00FF',
      support_help:       '#FF4000',
      meta_system:        '#0000FF',
      uncategorized:      '#808080',
    },
    previewStops: [
      [0.00, '#FF0000'], [0.17, '#FF8000'], [0.33, '#FFFF00'],
      [0.50, '#00FF00'], [0.66, '#00FFFF'], [0.83, '#0080FF'], [1.00, '#8000FF'],
    ],
  },
  {
    id: 'rainbow',
    label: 'Rainbow (ROYGBV)',
    stops: [
      [0.00, '#FF0000'], [0.17, '#FF8000'], [0.33, '#FFFF00'],
      [0.50, '#00FF00'], [0.66, '#00FFFF'], [0.83, '#0080FF'], [1.00, '#8000FF'],
    ],
  },
  {
    id: 'viridis',
    label: 'Viridis',
    stops: [
      [0.00, '#440154'], [0.25, '#3B528B'], [0.50, '#21918C'],
      [0.75, '#5EC962'], [1.00, '#FDE725'],
    ],
  },
  {
    id: 'magma',
    label: 'Magma',
    stops: [
      [0.00, '#000004'], [0.25, '#3B0F70'], [0.50, '#8C2981'],
      [0.75, '#DE4968'], [1.00, '#FCFDBF'],
    ],
  },
  {
    id: 'plasma',
    label: 'Plasma',
    stops: [
      [0.00, '#0D0887'], [0.25, '#7C02A7'], [0.50, '#CB4778'],
      [0.75, '#F89441'], [1.00, '#F0F921'],
    ],
  },
  {
    id: 'inferno',
    label: 'Inferno',
    stops: [
      [0.00, '#000004'], [0.25, '#4A0C6B'], [0.50, '#BB3754'],
      [0.75, '#F98E09'], [1.00, '#FCFFA4'],
    ],
  },
  {
    id: 'turbo',
    label: 'Turbo',
    stops: [
      [0.00, '#30123B'], [0.17, '#4364D8'], [0.33, '#1AE4B6'],
      [0.50, '#A4FC3C'], [0.66, '#FAB802'], [0.83, '#FB5A1E'], [1.00, '#7A0403'],
    ],
  },
  {
    id: 'hot',
    label: 'Hot',
    stops: [
      [0.00, '#000000'], [0.33, '#FF0000'], [0.66, '#FFFF00'], [1.00, '#FFFFFF'],
    ],
  },
  {
    id: 'metal',
    label: 'Metal',
    stops: [
      [0.00, '#1A1A1A'], [0.50, '#888888'], [1.00, '#EFEFEF'],
    ],
  },
  {
    id: 'cool',
    label: 'Cool',
    stops: [
      [0.00, '#00FFFF'], [1.00, '#FF00FF'],
    ],
  },
];

// Freeze the registry with precomputed category maps + preview CSS gradients.
export const RAMPS = RAMP_DEFS.map(def => {
  const categories = def.categories || buildMapFromStops(def.stops, CATEGORY_ORDER);
  const previewStops = def.previewStops || def.stops;
  const gradientCss = 'linear-gradient(to right, ' +
    previewStops.map(([t, hex]) => `${hex} ${Math.round(t * 100)}%`).join(', ') + ')';
  return { id: def.id, label: def.label, categories, gradientCss };
});

export const DEFAULT_RAMP_ID = '8bit';

const PaletteContext = createContext(null);

export function PaletteProvider({ children }) {
  const [activeRampId, setActiveRampId] = useState(DEFAULT_RAMP_ID);
  const activeRamp = useMemo(
    () => RAMPS.find(r => r.id === activeRampId) || RAMPS[0],
    [activeRampId]
  );
  const categoryColors = activeRamp.categories;
  const colorFor = useCallback(
    category => categoryColors[category] || categoryColors.uncategorized,
    [categoryColors]
  );
  const value = useMemo(() => ({
    ramps: RAMPS,
    activeRampId,
    setActiveRampId,
    categoryColors,
    colorFor,
  }), [activeRampId, categoryColors, colorFor]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error('usePalette must be used inside <PaletteProvider>');
  return ctx;
}
