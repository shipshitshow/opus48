// Vampire-Survivors-style "Survivors" mode: endless swarms, XP/levels, and a
// level-up draft where the player picks 1 of 3 upgrades to stack into combos.

export type UpgradeId =
  | 'dmg'
  | 'rate'
  | 'speed'
  | 'maxhp'
  | 'regen'
  | 'magnet'
  | 'multishot'
  | 'crit'
  | 'xpgain'
  | 'orbit'
  | 'bolt'
  | 'nova'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  desc: string
  icon: string
  max: number
  kind: 'passive' | 'weapon'
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'orbit', name: 'Orbiting Blades', desc: '+1 spinning blade that shreds nearby foes', icon: '🌀', max: 6, kind: 'weapon' },
  { id: 'bolt', name: 'Seeker Bolts', desc: 'Auto-fires homing bolts at the nearest enemy', icon: '🎇', max: 6, kind: 'weapon' },
  { id: 'nova', name: 'Nova Pulse', desc: 'Periodic shockwave damaging everything around you', icon: '💥', max: 6, kind: 'weapon' },
  { id: 'dmg', name: 'Heavy Rounds', desc: '+25% damage (all sources)', icon: '🔥', max: 5, kind: 'passive' },
  { id: 'rate', name: 'Rapid Fire', desc: '+18% fire rate', icon: '⚡', max: 5, kind: 'passive' },
  { id: 'multishot', name: 'Split Shot', desc: '+1 projectile on your main gun', icon: '🔱', max: 3, kind: 'passive' },
  { id: 'crit', name: 'Deadeye', desc: '+12% critical hit chance (2× damage)', icon: '🎯', max: 4, kind: 'passive' },
  { id: 'speed', name: 'Adrenaline', desc: '+12% move speed', icon: '🥾', max: 4, kind: 'passive' },
  { id: 'maxhp', name: 'Vitality', desc: '+25 max health (and heal)', icon: '❤️', max: 5, kind: 'passive' },
  { id: 'regen', name: 'Regeneration', desc: '+1.5 HP / second', icon: '✚', max: 4, kind: 'passive' },
  { id: 'magnet', name: 'Magnet', desc: '+45% XP pickup radius', icon: '🧲', max: 4, kind: 'passive' },
  { id: 'xpgain', name: 'Fast Learner', desc: '+20% XP gained', icon: '📈', max: 4, kind: 'passive' },
]

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>

/** XP needed to go from `level` to `level+1`. Smooth ramp. */
export function xpForLevel(level: number): number {
  return Math.floor(6 + level * 4 + level * level * 0.7)
}

// ---- Survivors tunables -----------------------------------------------------
export const SURV_BASE_MAGNET = 3.2
export const SURV_SPAWN_CAP = 48
export const SURV_SPAWN_START = 1.15 // seconds between spawns at t=0
export const SURV_SPAWN_MIN = 0.26 // fastest spawn interval
export const SURV_ELITE_INTERVAL = 28 // seconds between elite spawns
export const SURV_ENEMY_BASE_HP = 32
export const SURV_XP_GEM_VALUE = 1
export const SURV_XP_ELITE_VALUE = 18 // elites ("bosses") are a big XP payout

// Auto-weapon tuning (indexed loosely by level)
export const ORBIT_RADIUS = 2.6
export const ORBIT_SPEED = 2.4 // rad/s
export const ORBIT_HIT_RADIUS = 1.0
export const ORBIT_DMG = 22 // per hit
export const ORBIT_HIT_CD = 0.35 // per-enemy cooldown

export const BOLT_DMG = 26
export const BOLT_SPEED = 26
export const BOLT_TTL = 1.6

export const NOVA_DMG = 34
export const NOVA_RADIUS = 6.5
export const NOVA_INTERVAL = 3.2

// ---- Shop: permanent meta-upgrades bought with gold between runs ----
export type ShopId =
  | 'might'
  | 'vigor'
  | 'swift'
  | 'regenP'
  | 'magnetP'
  | 'scholar'
  | 'greed'
  | 'arsenal'
  | 'munitions'
  | 'pulsar'

export interface ShopDef {
  id: ShopId
  name: string
  desc: string
  icon: string
  max: number
  baseCost: number
}

export const SHOP_UPGRADES: ShopDef[] = [
  { id: 'might', name: 'Might', desc: '+8% base damage (all sources)', icon: '🔥', max: 5, baseCost: 60 },
  { id: 'vigor', name: 'Vigor', desc: '+15 starting max health', icon: '❤️', max: 5, baseCost: 60 },
  { id: 'swift', name: 'Swift', desc: '+6% base move speed', icon: '🥾', max: 4, baseCost: 70 },
  { id: 'regenP', name: 'Recovery', desc: '+0.6 base HP regen / second', icon: '✚', max: 4, baseCost: 80 },
  { id: 'magnetP', name: 'Lodestone', desc: '+20% base pickup radius', icon: '🧲', max: 4, baseCost: 50 },
  { id: 'scholar', name: 'Scholar', desc: '+10% XP gained', icon: '📈', max: 4, baseCost: 70 },
  { id: 'greed', name: 'Greed', desc: '+12% gold earned per run', icon: '💰', max: 4, baseCost: 90 },
  // --- Starting weapons: buy these to begin a run already armed (build variety) ---
  { id: 'arsenal', name: 'Arsenal', desc: 'Start every run with Orbiting Blades Lv1', icon: '🌀', max: 1, baseCost: 150 },
  { id: 'munitions', name: 'Munitions', desc: 'Start every run with Seeker Bolts Lv1', icon: '🎇', max: 1, baseCost: 150 },
  { id: 'pulsar', name: 'Pulsar', desc: 'Start every run with Nova Pulse Lv1', icon: '💥', max: 1, baseCost: 175 },
]

export const SHOP_BY_ID: Record<ShopId, ShopDef> = Object.fromEntries(SHOP_UPGRADES.map((s) => [s.id, s])) as Record<
  ShopId,
  ShopDef
>

/** Cost to buy the next tier (current tier -> tier+1). */
export function shopCost(def: ShopDef, tier: number): number {
  return Math.round(def.baseCost * (1 + tier * 0.85))
}

/** Gold awarded for a finished Survivors run. */
export function runGold(kills: number, level: number, time: number, greedTier: number): number {
  const base = kills * 2 + level * 8 + Math.floor(time)
  return Math.floor(base * (1 + 0.12 * greedTier))
}
