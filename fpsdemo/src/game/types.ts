export type GameStatus =
  | 'pointerlock-needed' // waiting for the player to click in to lock the pointer
  | 'playing'
  | 'paused'
  | 'levelup' // Survivors mode: choosing an upgrade
  | 'gameover'

export interface UpgradeChoice {
  id: string
  name: string
  desc: string
  icon: string
  level: number // current level (0 if new)
  max: number
}

export interface BuildEntry {
  id: string
  name: string
  icon: string
  level: number
  max: number
}

export interface HUDState {
  status: GameStatus
  playerHealth: number
  maxPlayerHealth: number
  ammo: number // rounds in current magazine
  magazineSize: number
  reserve: number // rounds in reserve
  reloading: boolean
  reloadProgress: number // 0..1 while reloading, else 0
  score: number
  kills: number
  headshots: number
  enemiesAlive: number
  time: number // elapsed survival time, seconds
  /** 1-based wave number among the normal waves (clamped to TOTAL_WAVES). */
  wave: number
  totalWaves: number
  /** True while the boss is on the field. */
  bossActive: boolean
  /** 0..1 boss health fraction (only meaningful while bossActive). */
  bossHealthFrac: number
  /** Outcome once status === 'gameover'. */
  outcome: 'win' | 'dead' | null
  /** Active weapon + the player's unlocked arsenal (for the HUD weapon strip). */
  weapon: string
  weapons: { id: string; name: string; key: number; active: boolean }[]
  /** Remaining seconds of the damage-boost upgrade (0 when inactive). */
  damageBoost: number
  /** Boss ability state (only meaningful while bossActive). */
  bossShielded: boolean
  bossEnraged: boolean
  /** Monotonic counters used by the HUD to trigger transient animations. */
  hitMarkerSeq: number
  headshotSeq: number
  killSeq: number
  damageSeq: number
  /** Transient centre-screen banner ("WAVE 2", "BOSS INCOMING", ...). */
  banner: string
  bannerSeq: number
  /** Small transient toast for pickups ("+ SHOTGUN", "+35 HP", ...). */
  toast: string
  toastSeq: number
  /** Multiplayer (PvP arena) state. */
  multiplayer: boolean
  connected: boolean
  room: string
  scoreboard: ScoreboardEntry[]
  /** Survivors mode state. */
  survivors: boolean
  level: number
  xp: number
  xpToNext: number
  build: BuildEntry[]
  choices: UpgradeChoice[]
}

export interface ScoreboardEntry {
  id: string
  name: string
  kills: number
  health: number
  you: boolean
}

export type StateListener = (state: HUDState) => void
