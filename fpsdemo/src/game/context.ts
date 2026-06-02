import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import type { Enemy } from './entities/Enemy'
import type { GameStatus, StateListener } from './types'
import { PLAYER_MAX_HEALTH, STARTING_WEAPON, WEAPONS, type WeaponId } from './constants'
import { DEFAULT_MAP_ID, getMap, type ArenaMap } from './data/maps'
import { SURV_BASE_MAGNET } from './data/survivors'

/**
 * The shared mutable world. Systems are behaviour modules that operate on this
 * context; any state touched by more than one system lives here. Each system
 * also receives a GameSystems registry (see ./systems) to call its siblings.
 *
 * State that belongs to a single system (wave/boss counters, survivor run state,
 * net session, HUD sequence counters, weapon view-model, transient FX pools…)
 * stays private on that system, reached cross-system via `this.sys.<name>`.
 */
export class GameContext {
  constructor(
    public readonly container: HTMLElement,
    public readonly listener: StateListener,
  ) {}

  // --- core three.js objects (created by RenderSystem during start) ---
  renderer!: THREE.WebGLRenderer
  scene!: THREE.Scene
  camera!: THREE.PerspectiveCamera
  controls!: PointerLockControls
  accentA!: THREE.PointLight // two rim lights; created by RenderSystem, recoloured per-map by ArenaSystem
  accentB!: THREE.PointLight
  readonly clock = new THREE.Clock()
  readonly raycaster = new THREE.Raycaster()
  readonly screenCenter = new THREE.Vector2(0, 0)
  raf = 0
  disposed = false

  // --- world collision / hit-test targets ---
  solidMeshes: THREE.Mesh[] = [] // arena solids only (used to prune raycastTargets on rebuild)
  obstacleBoxes: THREE.Box3[] = [] // collider AABBs (non-elevated obstacles)
  raycastTargets: THREE.Object3D[] = [] // arena solids + enemy + remote-avatar hit meshes
  enemies: Enemy[] = [] // shared pooled enemy array (contains dead entries)

  // --- arena / campaign map ---
  currentMap: ArenaMap = getMap(DEFAULT_MAP_ID)
  campaignMaps: ArenaMap[] = []
  campaignStage = 0 // 0-based index into campaignMaps

  // --- muzzle flash (armed by WeaponSystem.shoot, decayed by FxSystem.updateEffects) ---
  muzzleFlash!: THREE.Mesh
  muzzleLight!: THREE.PointLight
  muzzleTimer = 0

  // --- mode / phase ---
  status: GameStatus = 'pointerlock-needed'
  outcome: 'win' | 'dead' | null = null
  multiplayer = false
  survivors = false

  // --- player ---
  health = PLAYER_MAX_HEALTH
  score = 0
  kills = 0
  headshots = 0
  time = 0
  damageBoostTimer = 0
  velocity = new THREE.Vector3()
  canJump = false
  move = { forward: false, back: false, left: false, right: false }
  firing = false
  triggerQueued = false

  // --- weapons / ammo (live values of the active weapon + per-weapon stash) ---
  activeWeapon: WeaponId = STARTING_WEAPON
  unlocked = new Set<WeaponId>([STARTING_WEAPON])
  weaponMag: Record<WeaponId, number> = { rifle: 0, smg: 0, shotgun: 0, cannon: 0 }
  weaponReserve: Record<WeaponId, number> = { rifle: 0, smg: 0, shotgun: 0, cannon: 0 }
  ammo = WEAPONS.rifle.magazineSize
  reserve = WEAPONS.rifle.reserve
  reloading = false
  reloadTimer = 0
  fireCooldown = 0

  // --- survivor-derived stat multipliers (1 / 0 / SURV_BASE_MAGNET = no effect,
  // so campaign + multiplayer stay unaffected). Written by SurvivorsSystem.recomputeStats. ---
  statDamageMul = 1
  statFireRateMul = 1
  statMoveMul = 1
  statMaxHpBonus = 0
  statRegen = 0
  statMagnet = SURV_BASE_MAGNET
  statXpMul = 1
  statCrit = 0
  statMultishot = 0

  // --- shared scratch (single reused instances) ---
  readonly _dir = new THREE.Vector3()
  readonly _origin = new THREE.Vector3()
  readonly _fwd = new THREE.Vector3()
  readonly _right = new THREE.Vector3()
  readonly _up = new THREE.Vector3()
  readonly _worldUp = new THREE.Vector3(0, 1, 0)

  /** Max player HP including the survivor Vigor bonus (statMaxHpBonus is 0 outside Survivors). */
  get maxHealthValue(): number {
    return PLAYER_MAX_HEALTH + this.statMaxHpBonus
  }

  /** Live enemy count (the pooled array also holds dead entries). */
  get aliveCount(): number {
    let n = 0
    for (const e of this.enemies) if (e.alive) n++
    return n
  }
}
