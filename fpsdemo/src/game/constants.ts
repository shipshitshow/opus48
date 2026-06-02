// Central place for all gameplay tunables. Units are roughly meters / seconds.

export const ARENA_HALF = 40 // arena spans [-40, 40] on X and Z -> 80x80 floor
export const WALL_HEIGHT = 6
export const WALL_THICKNESS = 1.5

export const PLAYER_HEIGHT = 1.8 // camera eye height when grounded
export const PLAYER_RADIUS = 0.5 // collision radius against obstacles/walls
export const GRAVITY = 30
export const JUMP_VELOCITY = 10
export const MOVE_ACCEL = 70 // higher = snappier; steady-state speed ~= accel / damping
export const MOVE_DAMPING = 10
export const PLAYER_MAX_HEALTH = 100

// Weapon
export const MAGAZINE_SIZE = 30
export const START_RESERVE = 90
export const RESERVE_CAP = 300
export const AMMO_PER_KILL = 12
export const RELOAD_TIME = 1.2 // seconds
export const FIRE_INTERVAL = 0.11 // seconds between shots (full-auto)
export const WEAPON_DAMAGE = 34 // ~3 body shots to kill a base 100hp enemy
export const HEADSHOT_MULTIPLIER = 2.2

// Melee knife — always available (no ammo), the guaranteed fallback so you can
// never be locked out of fighting when ammo runs dry. Works in every mode.
export const MELEE_DAMAGE = 48
export const MELEE_RANGE = 3.0
export const MELEE_COOLDOWN = 0.5
export const MELEE_ARC_DOT = 0.55 // cos(~57°): frontal cone, hits a small cluster

// Enemies (base stats; waves scale these)
export const ENEMY_MAX_HEALTH = 100
export const ENEMY_SPEED_MIN = 2.6
export const ENEMY_SPEED_MAX = 4.2
export const ENEMY_RADIUS = 0.6
export const ENEMY_HEIGHT = 1.7
export const ENEMY_ATTACK_RANGE = 2.2
export const ENEMY_ATTACK_DAMAGE = 9
export const ENEMY_ATTACK_INTERVAL = 0.9 // seconds between an enemy's hits
export const ENEMY_SCORE = 100
export const ENEMY_SEPARATION = 1.4 // soft push so they don't perfectly stack

// ---- Waves ----------------------------------------------------------------
export interface WaveConfig {
  count: number // total enemies to defeat this wave
  concurrent: number // max alive at once
  healthMul: number
  speedMul: number
}

export const WAVES: WaveConfig[] = [
  { count: 6, concurrent: 4, healthMul: 1.0, speedMul: 1.0 },
  { count: 9, concurrent: 5, healthMul: 1.3, speedMul: 1.12 },
  { count: 12, concurrent: 6, healthMul: 1.6, speedMul: 1.25 },
]
export const TOTAL_WAVES = WAVES.length // boss arrives after the final wave

// ---- Campaign (multi-map journey) -----------------------------------------
// Each campaign stage runs the full WAVES + boss on a different map; clearing a
// boss advances to the next map. Difficulty escalates per stage, and the player
// is patched up a little between maps to reward the push forward.
export const STAGE_DIFFICULTY_STEP = 0.22 // +22% enemy & boss health per stage
export const STAGE_CLEAR_HEAL = 40 // HP restored when advancing to the next map

export const FIRST_WAVE_DELAY = 2.2 // seconds before wave 1 spawns
export const WAVE_BREAK = 3.2 // seconds between cleared waves
export const WAVE_SPAWN_INTERVAL = 0.9 // seconds between staggered spawns within a wave

// ---- Boss -----------------------------------------------------------------
export const BOSS_HEALTH = 2200
export const BOSS_SCALE = 2.6
export const BOSS_SPEED = 2.2
export const BOSS_ATTACK_DAMAGE = 18
export const BOSS_ATTACK_INTERVAL = 1.1
export const BOSS_ATTACK_RANGE = 4.4
export const BOSS_SCORE = 2500
export const BOSS_COLOR = 0xff1f4f
export const BOSS_RESERVE_BONUS = 60 // ammo granted for slaying the boss

// ---- Weapons --------------------------------------------------------------
export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'cannon'

export interface WeaponSpec {
  id: WeaponId
  name: string
  damage: number
  fireInterval: number // seconds between shots
  magazineSize: number
  reserve: number // reserve granted when first unlocked
  reserveCap: number
  pellets: number // rays per trigger pull (shotgun > 1)
  spread: number // cone half-angle in radians
  auto: boolean // hold-to-fire vs semi-auto
  ammoPerKill: number
  accent: number // viewmodel accent colour
  barrelLen: number // viewmodel barrel length
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: 'rifle', name: 'Rifle', damage: 34, fireInterval: 0.11, magazineSize: 30,
    reserve: 90, reserveCap: 300, pellets: 1, spread: 0.006, auto: true, ammoPerKill: 12,
    accent: 0x00d8ff, barrelLen: 0.45,
  },
  smg: {
    id: 'smg', name: 'SMG', damage: 18, fireInterval: 0.06, magazineSize: 45,
    reserve: 180, reserveCap: 450, pellets: 1, spread: 0.022, auto: true, ammoPerKill: 18,
    accent: 0x9b5cff, barrelLen: 0.3,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', damage: 13, fireInterval: 0.62, magazineSize: 8,
    reserve: 32, reserveCap: 80, pellets: 9, spread: 0.095, auto: false, ammoPerKill: 4,
    accent: 0xffb02e, barrelLen: 0.5,
  },
  cannon: {
    id: 'cannon', name: 'Cannon', damage: 130, fireInterval: 0.92, magazineSize: 5,
    reserve: 15, reserveCap: 40, pellets: 1, spread: 0, auto: false, ammoPerKill: 2,
    accent: 0xff3b6b, barrelLen: 0.62,
  },
}
export const STARTING_WEAPON: WeaponId = 'rifle'
export const WEAPON_ORDER: WeaponId[] = ['rifle', 'smg', 'shotgun', 'cannon']

// ---- Pickups (drops) ------------------------------------------------------
export type PickupKind = 'health' | 'ammo' | 'damage' | WeaponId
export const PICKUP_DROP_CHANCE = 0.5 // chance a normal kill drops something
export const PICKUP_RADIUS = 1.7 // walk within this to collect
export const PICKUP_TTL = 16 // seconds before a drop despawns
export const HEALTH_PICKUP_AMOUNT = 35
export const DAMAGE_BOOST_MULT = 2
export const DAMAGE_BOOST_TIME = 10

// ---- Enemy ranged fire ----------------------------------------------------
export const ENEMY_RANGED_CHANCE = 0.45 // fraction of mobs that shoot back
export const ENEMY_FIRE_INTERVAL = 1.7
export const ENEMY_FIRE_RANGE = 30 // max distance a mob will open fire
export const ENEMY_PREFERRED_RANGE = 12 // ranged mobs try to hold this gap
export const ENEMY_PROJECTILE_SPEED = 22
export const ENEMY_PROJECTILE_DAMAGE = 8
export const PROJECTILE_HIT_RADIUS = 0.9 // distance to player that counts as a hit
export const PROJECTILE_TTL = 4

// ---- Boss skills ----------------------------------------------------------
export const BOSS_SKILL_INTERVAL = 7 // seconds between boss abilities
export const BOSS_SHIELD_DURATION = 4
export const BOSS_ENRAGE_HEALTH_FRAC = 0.5 // enrages below this health fraction
export const BOSS_ENRAGE_SPEED_MULT = 1.7
export const BOSS_PROJECTILE_DAMAGE = 13
export const BOSS_PROJECTILE_SPEED = 17
export const BOSS_BARRAGE_COUNT = 7
export const BOSS_BARRAGE_SPREAD = 0.55 // radians, total fan
