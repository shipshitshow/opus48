// Arena map definitions for the Campaign.
//
// All maps share the fixed 80x80 footprint (ARENA_HALF = 40) and the four
// boundary walls — only the INTERIOR obstacle layout and the visual theme
// differ. The Campaign is a journey through these maps in CAMPAIGN_ORDER; the
// picker lets the player choose a starting map (the rest follow, wrapping).
//
// Layouts were generated + geometrically validated by a multi-agent design
// pass (no out-of-bounds boxes, no overlaps/slivers, clear player spawns).

export type ObstacleMat = 'crate' | 'pillar' | 'wall'

export interface MapObstacle {
  x: number
  z: number
  w: number // size along X
  h: number // height
  d: number // size along Z
  mat: ObstacleMat
  /** Decorative box resting on top of another — drawn + shootable, but not a collider. */
  elevated?: boolean
}

export interface MapLight {
  color: number
  x: number
  y: number
  z: number
}

export interface MapTheme {
  bg: number // scene background + fog colour
  fogNear: number
  fogFar: number
  floorTint: number // multiplied over the floor texture
  wallTint: number // multiplied over walls + obstacle textures
  trim: number // emissive neon edge colour
  accentA: MapLight // two coloured rim lights
  accentB: MapLight
}

export interface ArenaMap {
  id: string
  name: string
  subtitle: string
  icon: string // emoji for the picker card
  accent: string // css hex for the picker card border / glow
  theme: MapTheme
  spawn: { x: number; z: number } // player start (faces the arena centre)
  obstacles: MapObstacle[]
}

// ============================================================================
// FOUNDRY — warm industrial smeltery: heavy pillars + blocky, broken crate cover.
// ============================================================================
const FOUNDRY: ArenaMap = {
  id: 'foundry',
  name: 'Foundry',
  subtitle: 'Stacked crates and glowing iron in the smelter heat',
  icon: '🏭',
  accent: '#ff8a3c',
  theme: {
    bg: 0x160d08,
    fogNear: 34,
    fogFar: 165,
    floorTint: 0xc9a98a,
    wallTint: 0xb89274,
    trim: 0xff8a3c,
    accentA: { color: 0xff7a26, x: -26, y: 8, z: -26 },
    accentB: { color: 0xffb24d, x: 26, y: 9, z: 26 },
  },
  spawn: { x: -26, z: 28 },
  obstacles: [
    { x: 0, z: 0, w: 2.2, h: 6, d: 2.2, mat: 'pillar' },
    { x: -9, z: -7, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 9, z: 7, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: -16, z: 15, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
    { x: -13.4, z: 15, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
    { x: -16, z: 17.6, w: 2.6, h: 2.4, d: 2.6, mat: 'crate' },
    { x: 16, z: -15, w: 2.8, h: 2.8, d: 2.8, mat: 'crate' },
    { x: 16, z: -15, w: 2, h: 2, d: 2, mat: 'crate', elevated: true },
    { x: 19, z: 17, w: 2.4, h: 2.4, d: 2.4, mat: 'crate' },
    { x: -16, z: -16, w: 8, h: 3, d: 2.4, mat: 'wall' },
    { x: 13, z: -3, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
    { x: -14, z: -1, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
  ],
}

// ============================================================================
// CRYO VAULT — frozen storage hall: long slab aisles with junction chokepoints.
// ============================================================================
const CRYO: ArenaMap = {
  id: 'cryo',
  name: 'Cryo Vault',
  subtitle: 'Weave the frozen aisles before they freeze you',
  icon: '❄️',
  accent: '#7fe8ff',
  theme: {
    bg: 0x08131c,
    fogNear: 34,
    fogFar: 165,
    floorTint: 0xaacbe0,
    wallTint: 0xbcd9ec,
    trim: 0x7fe8ff,
    accentA: { color: 0x7fe8ff, x: -26, y: 9, z: -26 },
    accentB: { color: 0xbff4ff, x: 26, y: 9, z: 26 },
  },
  spawn: { x: 0, z: -33 },
  obstacles: [
    { x: -15, z: -13, w: 2.4, h: 3, d: 14, mat: 'wall' },
    { x: -15, z: 13, w: 2.4, h: 3, d: 14, mat: 'wall' },
    { x: 15, z: -13, w: 2.4, h: 3, d: 14, mat: 'wall' },
    { x: 15, z: 13, w: 2.4, h: 3, d: 14, mat: 'wall' },
    { x: 0, z: -27, w: 16, h: 3.2, d: 2.4, mat: 'wall' },
    { x: 0, z: 27, w: 16, h: 3.2, d: 2.4, mat: 'wall' },
    { x: -15, z: 0, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 15, z: 0, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 0, z: 0, w: 2.4, h: 2.8, d: 2.4, mat: 'crate' },
    { x: -27, z: 27, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
    { x: 27, z: -27, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
  ],
}

// ============================================================================
// SKYBRIDGE — exposed high span: sparse tall pillars, long sightlines.
// ============================================================================
const SKYBRIDGE: ArenaMap = {
  id: 'skybridge',
  name: 'Skybridge',
  subtitle: 'An exposed span where every sightline is a duel',
  icon: '🌉',
  accent: '#46e0c8',
  theme: {
    bg: 0x0a1620,
    fogNear: 38,
    fogFar: 175,
    floorTint: 0xcfe2ec,
    wallTint: 0xbcd4e0,
    trim: 0x46e0c8,
    accentA: { color: 0x46e0c8, x: -26, y: 9, z: -26 },
    accentB: { color: 0x5fb8ff, x: 26, y: 9, z: 26 },
  },
  spawn: { x: 0, z: -32 },
  obstacles: [
    { x: -18, z: -12, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 18, z: -12, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: -18, z: 12, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 18, z: 12, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 0, z: 22, w: 2.2, h: 6, d: 2.2, mat: 'pillar' },
    { x: 0, z: -22, w: 2.2, h: 6, d: 2.2, mat: 'pillar' },
    { x: -10, z: 0, w: 8, h: 2.6, d: 2.4, mat: 'wall' },
    { x: 10, z: 0, w: 8, h: 2.6, d: 2.4, mat: 'wall' },
  ],
}

// ============================================================================
// REACTOR CORE — hazardous chamber: a dense central core ringed by cover.
// (floor/wall tints lightened slightly from the original spec for readability)
// ============================================================================
const REACTOR: ArenaMap = {
  id: 'reactor',
  name: 'Reactor Core',
  subtitle: 'Orbit the breach before it goes critical',
  icon: '☢️',
  accent: '#ff3b6b',
  theme: {
    bg: 0x1a0408,
    fogNear: 34,
    fogFar: 165,
    floorTint: 0x9a5560,
    wallTint: 0x86424e,
    trim: 0xff3b6b,
    accentA: { color: 0xff3b6b, x: -26, y: 9, z: -26 },
    accentB: { color: 0xff77a8, x: 26, y: 8, z: 26 },
  },
  spawn: { x: 0, z: -32 },
  obstacles: [
    { x: 0, z: 0, w: 2.4, h: 2.8, d: 2.4, mat: 'crate' },
    { x: 0, z: 0, w: 1.6, h: 2.6, d: 1.6, mat: 'crate', elevated: true },
    { x: 4.7, z: 0, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: -4.7, z: 0, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 0, z: 4.7, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 0, z: -4.7, w: 2, h: 6, d: 2, mat: 'pillar' },
    { x: 0, z: 19, w: 8, h: 3, d: 2.4, mat: 'wall' },
    { x: 0, z: -19, w: 8, h: 3, d: 2.4, mat: 'wall' },
    { x: 19, z: 0, w: 2.4, h: 3, d: 8, mat: 'wall' },
    { x: -19, z: 0, w: 2.4, h: 3, d: 8, mat: 'wall' },
    { x: 13, z: 13, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
    { x: -13, z: -13, w: 2.6, h: 2.6, d: 2.6, mat: 'crate' },
  ],
}

// ----------------------------------------------------------------------------

/** All campaign maps, keyed by id. */
export const MAPS: Record<string, ArenaMap> = {
  foundry: FOUNDRY,
  cryo: CRYO,
  skybridge: SKYBRIDGE,
  reactor: REACTOR,
}

/** Canonical campaign order (the journey, when started from the first map). */
export const CAMPAIGN_ORDER: string[] = ['foundry', 'cryo', 'skybridge', 'reactor']

/** Default arena for non-campaign modes (Survivors / Multiplayer / menu). */
export const DEFAULT_MAP_ID = 'foundry'

export function getMap(id: string): ArenaMap {
  return MAPS[id] ?? MAPS[DEFAULT_MAP_ID]
}

/**
 * Build the campaign stage sequence starting from `startId`: that map first,
 * then the remaining maps in canonical order (wrapping around).
 */
export function campaignSequence(startId: string): ArenaMap[] {
  const start = CAMPAIGN_ORDER.indexOf(startId)
  const order = start < 0 ? CAMPAIGN_ORDER : [...CAMPAIGN_ORDER.slice(start), ...CAMPAIGN_ORDER.slice(0, start)]
  return order.map((id) => MAPS[id])
}

/** Lightweight metadata for the picker UI (no THREE dependency). */
export interface MapMeta {
  id: string
  name: string
  subtitle: string
  icon: string
  accent: string
}
export const MAP_PICKER: MapMeta[] = CAMPAIGN_ORDER.map((id) => {
  const m = MAPS[id]
  return { id: m.id, name: m.name, subtitle: m.subtitle, icon: m.icon, accent: m.accent }
})
