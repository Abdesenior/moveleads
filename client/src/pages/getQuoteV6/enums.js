// client/src/pages/getQuoteV6/enums.js
// UI taxonomies for the design's screens, mapped to the EXACT backend-valid
// strings that server/validators/leadIngestV2.js accepts. Values written into
// answers.* at patch() time are ALWAYS already backend-shaped. No translation
// happens inside submit().

// Home type — 1:1 with backend enum.
export const HOME_TYPES = [
  { id: 'house',     title: 'House',      sub: 'Standalone home',     icon: 'house2' },
  { id: 'apartment', title: 'Apartment',  sub: 'Multi-unit building', icon: 'bldg' },
  { id: 'condo',     title: 'Condo',      sub: 'Owned in a building', icon: 'bldg' },
  { id: 'townhouse', title: 'Townhouse',  sub: 'Attached home',       icon: 'home' },
  { id: 'storage',   title: 'Storage',    sub: 'Storage unit move',   icon: 'warehouse' },
  { id: 'other',     title: 'Other',      sub: 'Something else',      icon: 'box' },
];

// UI-side size options per home type. The `backend` field is what gets
// patched into answers.homeSize — always a string the Zod enum accepts.
// Lossy mappings (storage_*, few_items, room, small, large) collapse to
// the closest volumetric backend bucket; the richer UI label is NOT
// preserved on this pass (per locked decision 2026-05-22 #1 — no
// specialInstructions field added).
export const SIZE_SETS = {
  apartment: [
    { id: 'studio',   title: 'Studio',      sub: '< 500 sq ft',          backend: 'Studio' },
    { id: '1br',      title: '1-bedroom',   sub: '500–800 sq ft',        backend: '1 Bedroom' },
    { id: '2br',      title: '2-bedroom',   sub: '800–1,200 sq ft',      backend: '2 Bedroom' },
    { id: '3br',      title: '3-bedroom',   sub: '1,200–1,600 sq ft',    backend: '3 Bedroom' },
    { id: '4br',      title: '4-bedroom',   sub: '1,600–2,000 sq ft',    backend: '4 Bedroom' },
    { id: '4br_plus', title: '4+ bedrooms', sub: '2,000+ sq ft',         backend: '4+ Bedroom' },
  ],
  house: [
    { id: 'house_s',  title: 'Small house',  sub: '< 1,500 sq ft · 1–2 BR',     backend: 'House (Small)' },
    { id: 'house_m',  title: 'Medium house', sub: '1,500–2,500 sq ft · 2–4 BR', backend: 'House (Medium)' },
    { id: 'house_l',  title: 'Large house',  sub: '2,500+ sq ft · 4+ BR',       backend: 'House (Large)' },
    { id: '5br',      title: '5-bedroom',    sub: 'Large home',                  backend: '5 Bedroom' },
    { id: '5br_plus', title: '5+ bedrooms',  sub: 'Estate-sized',                backend: '5+ Bedroom' },
  ],
  storage: [
    { id: 'storage_s', title: 'Small unit',  sub: '5×5 or 5×10',    backend: 'Studio' },
    { id: 'storage_m', title: 'Medium unit', sub: '10×10 or 10×15', backend: '1 Bedroom' },
    { id: 'storage_l', title: 'Large unit',  sub: '10×20 or 10×30', backend: '2 Bedroom' },
  ],
  other: [
    { id: 'few_items', title: 'A few items',   sub: 'Furniture, boxes only',  backend: 'Studio' },
    { id: 'room',      title: 'A single room', sub: 'Equivalent to studio',   backend: 'Studio' },
    { id: 'small',     title: 'Small place',   sub: 'Equivalent to 1–2BR',    backend: '1 Bedroom' },
    { id: 'large',     title: 'Large place',   sub: 'Equivalent to 3+BR',     backend: '3 Bedroom' },
    { id: 'office',    title: 'Office space',  sub: 'Commercial move',        backend: 'Office / Commercial' },
  ],
};
SIZE_SETS.condo = SIZE_SETS.apartment;
SIZE_SETS.townhouse = SIZE_SETS.apartment;

// Stairs — 1:1 with backend enum.
export const STAIRS_OPTIONS = [
  { id: 'ground_floor',   title: 'Ground floor',                  sub: 'No stairs',                  icon: 'home' },
  { id: 'walk_up_2',      title: '2nd floor walk-up',             sub: 'One flight of stairs',       icon: 'stairs' },
  { id: 'walk_up_3plus',  title: '3rd floor or higher walk-up',   sub: 'Multiple flights of stairs', icon: 'stairs' },
  { id: 'elevator',       title: 'Elevator',                      sub: 'Building has an elevator',   icon: 'elevator' },
];

// Bucket — 4 options (locked decision 2026-05-22 #3). Backend accepts all 4.
export const BUCKET_OPTIONS = [
  { id: 'asap',       title: 'As soon as possible', sub: 'Within the next 7 days' },
  { id: 'this_week',  title: 'This week',           sub: '1–2 weeks out' },
  { id: 'this_month', title: 'This month',          sub: '2–4 weeks out' },
  { id: 'flexible',   title: "I'm flexible",        sub: 'Anytime in the next few months' },
];

// Heavy items — UI shows pretty titles, backend stores the title string itself
// (validator accepts any string up to 80 chars, max 20 items). Storing the
// title means what the user sees is what gets sent — no separate translation.
export const HEAVY_ITEMS = [
  { id: 'piano_upright',   title: 'Upright piano',      icon: 'piano' },
  { id: 'piano_grand',     title: 'Grand piano',        icon: 'piano' },
  { id: 'safe',            title: 'Safe',               icon: 'shield' },
  { id: 'gun_safe',        title: 'Gun safe',           icon: 'shield' },
  { id: 'pool_table',      title: 'Pool table',         icon: 'box' },
  { id: 'hot_tub',         title: 'Hot tub',            icon: 'box' },
  { id: 'gym_equipment',   title: 'Gym equipment',      icon: 'weight' },
  { id: 'large_appliance', title: 'Large appliance',    icon: 'box' },
  { id: 'antiques',        title: 'Antiques',           icon: 'sparkle' },
  { id: 'art',             title: 'Fine art',           icon: 'sparkle' },
  { id: 'fragile',         title: 'Fragile collection', icon: 'shield' },
  { id: 'other',           title: 'Other heavy item',   icon: 'plus' },
];

// Lookup helpers used by SuccessScreen and DesktopRouteContext summaries.
export const homeTypeLabel = (id) => HOME_TYPES.find(t => t.id === id)?.title || '—';

export const homeSizeLabelFromBackend = (backendValue) => backendValue || '—';

export const stairsLabel = (id) => STAIRS_OPTIONS.find(o => o.id === id)?.title || '—';

export const bucketLabel = (id) => BUCKET_OPTIONS.find(b => b.id === id)?.title || '—';
