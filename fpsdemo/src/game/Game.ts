import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { audio } from '../audio/AudioEngine'
import { NetClient, type RemotePlayerInfo } from '../net/NetClient'
import type { PlayerAvatarId } from '../net/playerAvatars'
import { RemoteAvatar } from '../net/RemoteAvatar'
import { Enemy, type EnemyShot } from './entities/Enemy'
import {
  ARENA_HALF,
  BOSS_ATTACK_DAMAGE,
  BOSS_ATTACK_INTERVAL,
  BOSS_ATTACK_RANGE,
  BOSS_COLOR,
  BOSS_HEALTH,
  BOSS_PROJECTILE_DAMAGE,
  BOSS_PROJECTILE_SPEED,
  BOSS_RESERVE_BONUS,
  BOSS_SCALE,
  BOSS_SCORE,
  BOSS_SPEED,
  DAMAGE_BOOST_MULT,
  DAMAGE_BOOST_TIME,
  ENEMY_MAX_HEALTH,
  ENEMY_PROJECTILE_DAMAGE,
  ENEMY_PROJECTILE_SPEED,
  ENEMY_RANGED_CHANCE,
  ENEMY_SCORE,
  ENEMY_SPEED_MAX,
  ENEMY_SPEED_MIN,
  FIRST_WAVE_DELAY,
  GRAVITY,
  HEADSHOT_MULTIPLIER,
  HEALTH_PICKUP_AMOUNT,
  JUMP_VELOCITY,
  MELEE_ARC_DOT,
  MELEE_COOLDOWN,
  MELEE_DAMAGE,
  MELEE_RANGE,
  MOVE_ACCEL,
  MOVE_DAMPING,
  PICKUP_DROP_CHANCE,
  PICKUP_RADIUS,
  PICKUP_TTL,
  PLAYER_HEIGHT,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_TTL,
  RELOAD_TIME,
  STAGE_CLEAR_HEAL,
  STAGE_DIFFICULTY_STEP,
  STARTING_WEAPON,
  TOTAL_WAVES,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WAVE_BREAK,
  WAVE_SPAWN_INTERVAL,
  WAVES,
  WEAPON_ORDER,
  WEAPONS,
  type PickupKind,
  type WeaponId,
} from './constants'
import { ARENA_TEXTURES, PICKUP_SPRITE_TEXTURES, PROJECTILE_SPRITE_TEXTURES, WEAPON_SPRITE_TEXTURES } from './spriteAssets'
import {
  CAMPAIGN_ORDER,
  DEFAULT_MAP_ID,
  campaignSequence,
  getMap,
  type ArenaMap,
  type ObstacleMat,
} from './data/maps'
import {
  BOLT_DMG,
  BOLT_SPEED,
  BOLT_TTL,
  NOVA_DMG,
  NOVA_INTERVAL,
  NOVA_RADIUS,
  ORBIT_DMG,
  ORBIT_HIT_CD,
  ORBIT_HIT_RADIUS,
  ORBIT_RADIUS,
  ORBIT_SPEED,
  SURV_BASE_MAGNET,
  SURV_ELITE_INTERVAL,
  SURV_ENEMY_BASE_HP,
  SURV_SPAWN_CAP,
  SURV_SPAWN_MIN,
  SURV_SPAWN_START,
  SURV_XP_ELITE_VALUE,
  SURV_XP_GEM_VALUE,
  UPGRADES,
  UPGRADE_BY_ID,
  xpForLevel,
  type UpgradeId,
} from './data/survivors'
import type { BuildEntry, GameStatus, HUDState, StateListener, UpgradeChoice } from './types'

const ENEMY_COLORS = [0xff5a3c, 0xffb02e, 0xff3b6b, 0x9b5cff, 0x2ee6a6, 0x4d9bff]
const RANGED_COLOR = 0x35e0ff
const WEAPON_VIEW_X = 0.45
const WEAPON_VIEW_Y = -0.5
const WEAPON_VIEW_Z = -0.72

const WEAPON_SPRITE_CONFIG: Record<WeaponId, {
  scale: [number, number]
  offset: [number, number, number]
  muzzle: [number, number, number]
  flashScale: number
}> = {
  rifle: {
    scale: [0.56, 0.65],
    offset: [0.11, -0.07, 0],
    muzzle: [-0.18, 0.2, -0.1],
    flashScale: 0.85,
  },
  smg: {
    scale: [0.48, 0.72],
    offset: [0.11, -0.09, 0],
    muzzle: [-0.16, 0.17, -0.1],
    flashScale: 0.75,
  },
  shotgun: {
    scale: [0.64, 0.7],
    offset: [0.12, -0.08, 0],
    muzzle: [-0.15, 0.18, -0.1],
    flashScale: 1.05,
  },
  cannon: {
    scale: [0.64, 0.58],
    offset: [0.15, -0.13, 0],
    muzzle: [-0.17, 0.15, -0.1],
    flashScale: 1.15,
  },
}

const PICKUP_COLORS: Record<PickupKind, number> = {
  health: 0xff4d6d,
  ammo: 0x35e0ff,
  damage: 0xff7a1a,
  rifle: 0x00d8ff,
  smg: 0x9b5cff,
  shotgun: 0xffb02e,
  cannon: 0xff3b6b,
}

interface Tracer {
  line: THREE.Line
  age: number
  ttl: number
}
interface Pop {
  mesh: THREE.Mesh
  age: number
  ttl: number
}
interface Pickup {
  group: THREE.Group
  kind: PickupKind
  age: number
}
interface Projectile {
  mesh: THREE.Sprite
  vel: THREE.Vector3
  damage: number
  age: number
  fromBoss: boolean
  baseScale: number
  spin: number
  owner: Enemy | null
}

export class Game {
  private container: HTMLElement
  private listener: StateListener

  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private controls!: PointerLockControls
  private clock = new THREE.Clock()
  private raf = 0
  private disposed = false

  // World
  private solidMeshes: THREE.Mesh[] = []
  private obstacleBoxes: THREE.Box3[] = []
  private enemies: Enemy[] = []
  private raycastTargets: THREE.Object3D[] = []
  private raycaster = new THREE.Raycaster()
  private screenCenter = new THREE.Vector2(0, 0)
  // Arena (rebuildable per map): all meshes/materials/textures created by
  // buildArena, tracked so clearArena can swap maps without leaking.
  private accentA!: THREE.PointLight
  private accentB!: THREE.PointLight
  private arenaObjects: THREE.Mesh[] = []
  private arenaMaterials: THREE.Material[] = []
  private arenaTextures: THREE.Texture[] = []
  private currentMap: ArenaMap = getMap(DEFAULT_MAP_ID)
  private campaignMaps: ArenaMap[] = []
  private campaignStage = 0 // 0-based index into campaignMaps

  // Weapon view model
  private weapon!: THREE.Group
  private weaponBarrel!: THREE.Mesh
  private weaponAccentMat!: THREE.MeshStandardMaterial
  private magazine!: THREE.Mesh
  private weaponSprite!: THREE.Sprite
  private weaponSpriteMat!: THREE.SpriteMaterial
  private muzzleFlash!: THREE.Mesh
  private muzzleLight!: THREE.PointLight
  private muzzleTimer = 0
  private weaponRecoil = 0
  private bobTime = 0
  private readonly magBaseY = -0.17
  private meleeCd = 0
  private meleeAnim = 0

  // Effects / projectiles / pickups
  private tracers: Tracer[] = []
  private pops: Pop[] = []
  private pickups: Pickup[] = []
  private projectiles: Projectile[] = []

  // Input
  private move = { forward: false, back: false, left: false, right: false }
  private firing = false
  private triggerQueued = false
  private velocity = new THREE.Vector3()
  private canJump = false

  // Player state
  private status: GameStatus = 'pointerlock-needed'
  private outcome: 'win' | 'dead' | null = null
  private health = PLAYER_MAX_HEALTH
  private score = 0
  private kills = 0
  private headshots = 0
  private time = 0
  private damageBoostTimer = 0

  // Weapons / ammo
  private activeWeapon: WeaponId = STARTING_WEAPON
  private unlocked = new Set<WeaponId>([STARTING_WEAPON])
  private weaponMag: Record<WeaponId, number> = { rifle: 0, smg: 0, shotgun: 0, cannon: 0 }
  private weaponReserve: Record<WeaponId, number> = { rifle: 0, smg: 0, shotgun: 0, cannon: 0 }
  private ammo = WEAPONS.rifle.magazineSize // live magazine of active weapon
  private reserve = WEAPONS.rifle.reserve // live reserve of active weapon
  private reloading = false
  private reloadTimer = 0
  private fireCooldown = 0

  // Wave state
  private waveIndex = 0
  private waveActive = false
  private waveBreakTimer = FIRST_WAVE_DELAY
  private spawnTimer = 0
  private killsThisWave = 0
  private spawnedThisWave = 0
  private bossActive = false
  private bossEnemy: Enemy | null = null
  private bossMaxHealth = BOSS_HEALTH

  // Multiplayer
  private net: NetClient | null = null
  private multiplayer = false
  private connected = false
  private roomName = ''
  private playerName = 'Player'
  private playerAvatar: PlayerAvatarId = 'ranger'
  private remotePlayers = new Map<string, RemoteAvatar>()
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ')

  // Survivors mode
  private survivors = false
  private level = 1
  private xp = 0
  private xpToNext = xpForLevel(1)
  private pendingLevels = 0
  private choices: UpgradeChoice[] = []
  private upgradeLevels: Partial<Record<UpgradeId, number>> = {}
  // derived stats (1 / 0 = no effect, so campaign + MP are unaffected)
  private statDamageMul = 1
  private statFireRateMul = 1
  private statMoveMul = 1
  private statMaxHpBonus = 0
  private statRegen = 0
  private statMagnet = SURV_BASE_MAGNET
  private statXpMul = 1
  private statCrit = 0
  private statMultishot = 0
  private orbitLevel = 0
  private boltLevel = 0
  private novaLevel = 0
  // auto-weapon runtime
  private orbitGroup!: THREE.Group
  private orbitOrbs: THREE.Mesh[] = []
  private orbitAngle = 0
  private orbitCd = new WeakMap<Enemy, number>()
  private bolts: { mesh: THREE.Mesh; vel: THREE.Vector3; dmg: number; age: number; pierce: number }[] = []
  private boltTimer = 0
  private novas: { mesh: THREE.Mesh; age: number; ttl: number; hit: Set<Enemy>; dmg: number; maxR: number }[] = []
  private novaTimer = NOVA_INTERVAL
  private survSpawnTimer = 0
  private survClock = 0
  private eliteTimer = SURV_ELITE_INTERVAL
  private xpGems: { mesh: THREE.Mesh; value: number; age: number }[] = []
  private enemyXp = new WeakMap<Enemy, number>()
  private shopTiers: Record<string, number> = {} // permanent meta-upgrades

  // HUD sync
  private emitAccumulator = 0
  private hitMarkerSeq = 0
  private headshotSeq = 0
  private killSeq = 0
  private damageSeq = 0
  private damageNumbers: { id: number; x: number; y: number; amount: number; kind: 'normal' | 'head' | 'crit'; t: number }[] = []
  private damageNumberId = 0
  private banner = ''
  private bannerSeq = 0
  private toast = ''
  private toastSeq = 0

  // scratch
  private _dir = new THREE.Vector3()
  private _origin = new THREE.Vector3()
  private _fwd = new THREE.Vector3()
  private _right = new THREE.Vector3()
  private _up = new THREE.Vector3()
  private _worldUp = new THREE.Vector3(0, 1, 0)

  constructor(container: HTMLElement, listener: StateListener) {
    this.container = container
    this.listener = listener
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.setupRenderer()
    this.setupScene()
    this.buildArena(getMap(DEFAULT_MAP_ID))
    this.buildWeapon()
    this.bindEvents()

    this.orbitGroup = new THREE.Group()
    this.orbitGroup.visible = false
    this.scene.add(this.orbitGroup)

    this.resetPlayer()
    this.startWaveSystem()

    this.clock.start()
    this.emit()
    this.loop()
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.container.appendChild(this.renderer.domElement)
  }

  private setupScene() {
    this.scene = new THREE.Scene()
    const bg = new THREE.Color(0x0e1320)
    this.scene.background = bg
    this.scene.fog = new THREE.Fog(bg.getHex(), 35, 170)

    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.05, 500)
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement)
    this.scene.add(this.camera)

    this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x202028, 1.1))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))

    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.position.set(38, 58, 22)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 200
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    sun.shadow.bias = -0.0004
    this.scene.add(sun)
    this.scene.add(sun.target)

    // Two coloured rim lights — recoloured/repositioned per map by buildArena.
    this.accentA = new THREE.PointLight(0x00d8ff, 60, 90, 2)
    this.accentA.position.set(-28, 8, -28)
    this.scene.add(this.accentA)
    this.accentB = new THREE.PointLight(0xff4d6d, 60, 90, 2)
    this.accentB.position.set(28, 8, 28)
    this.scene.add(this.accentB)
  }

  /** Tear down the current arena (meshes, materials, textures) so a new map can
   *  be built in its place. Leaves enemies, pickups, and the player untouched. */
  private clearArena() {
    for (const o of this.arenaObjects) {
      this.scene.remove(o)
      o.geometry.dispose()
    }
    for (const m of this.arenaMaterials) m.dispose()
    for (const t of this.arenaTextures) t.dispose()
    // Strip the old arena solids from the shooting targets, keeping enemy hit
    // meshes (solidMeshes only ever holds arena geometry).
    if (this.solidMeshes.length) {
      const solidSet = new Set<THREE.Object3D>(this.solidMeshes)
      this.raycastTargets = this.raycastTargets.filter((o) => !solidSet.has(o))
    }
    this.arenaObjects = []
    this.arenaMaterials = []
    this.arenaTextures = []
    this.solidMeshes = []
    this.obstacleBoxes = []
  }

  /** Build (or rebuild) the arena from a map definition: theme + boundary walls
   *  + interior obstacles. All campaign maps share the 80x80 footprint. */
  private buildArena(map: ArenaMap) {
    this.clearArena()
    this.currentMap = map
    const t = map.theme

    // --- theme: background, fog, rim lights ---
    const bg = new THREE.Color(t.bg)
    this.scene.background = bg
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(bg)
      this.scene.fog.near = t.fogNear
      this.scene.fog.far = t.fogFar
    } else {
      this.scene.fog = new THREE.Fog(bg.getHex(), t.fogNear, t.fogFar)
    }
    this.accentA.color.setHex(t.accentA.color)
    this.accentA.position.set(t.accentA.x, t.accentA.y, t.accentA.z)
    this.accentB.color.setHex(t.accentB.color)
    this.accentB.position.set(t.accentB.x, t.accentB.y, t.accentB.z)

    // --- materials ---
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.floor, ARENA_HALF / 3.5, ARENA_HALF / 3.5),
      color: t.floorTint, roughness: 0.9, metalness: 0.08,
    })
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.wall, 16, 1),
      color: t.wallTint, roughness: 0.65, metalness: 0.22,
    })
    const trimMat = new THREE.MeshStandardMaterial({ color: t.trim, emissive: t.trim, emissiveIntensity: 1.4 })
    const crateMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.block, 1, 1),
      color: t.wallTint, roughness: 0.72, metalness: 0.24,
    })
    const pillarMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.column, 1, 3),
      color: t.wallTint, roughness: 0.58, metalness: 0.32,
    })
    this.arenaMaterials.push(floorMat, wallMat, trimMat, crateMat, pillarMat)

    // --- floor ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    this.arenaObjects.push(floor)

    // --- boundary walls (+ neon trim) ---
    const span = ARENA_HALF * 2 + WALL_THICKNESS
    const wallDefs: Array<[number, number, number, number]> = [
      [0, -ARENA_HALF, span, WALL_THICKNESS],
      [0, ARENA_HALF, span, WALL_THICKNESS],
      [-ARENA_HALF, 0, WALL_THICKNESS, span],
      [ARENA_HALF, 0, WALL_THICKNESS, span],
    ]
    for (const [x, z, w, d] of wallDefs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat)
      wall.position.set(x, WALL_HEIGHT / 2, z)
      wall.castShadow = true
      wall.receiveShadow = true
      wall.userData = { solid: true }
      this.scene.add(wall)
      this.solidMeshes.push(wall)
      this.arenaObjects.push(wall)

      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), trimMat)
      trim.position.set(x, WALL_HEIGHT + 0.05, z)
      this.scene.add(trim)
      this.arenaObjects.push(trim)
    }

    // --- interior obstacles ---
    const matFor = (m: ObstacleMat) => (m === 'pillar' ? pillarMat : m === 'wall' ? wallMat : crateMat)
    const groundTop = new Map<string, number>() // tracks box-top heights so stacks sit on top
    for (const o of map.obstacles) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), matFor(o.mat))
      const key = `${o.x}:${o.z}`
      let y = o.h / 2
      if (o.elevated) {
        y = (groundTop.get(key) ?? 0) + o.h / 2 // rest on the box below it
      } else {
        groundTop.set(key, o.h)
      }
      mesh.position.set(o.x, y, o.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { solid: true }
      this.scene.add(mesh)
      this.solidMeshes.push(mesh)
      this.arenaObjects.push(mesh)
      // Elevated boxes are decorative silhouette — drawn + shootable, not colliders.
      if (!o.elevated) this.obstacleBoxes.push(new THREE.Box3().setFromObject(mesh))
    }

    this.raycastTargets.push(...this.solidMeshes)
  }

  /** Position the player at the current map's spawn, facing the arena centre. */
  private placeAtSpawn() {
    const s = this.currentMap.spawn
    this.velocity.set(0, 0, 0)
    this.canJump = false
    this.camera.position.set(s.x, PLAYER_HEIGHT, s.z)
    this.camera.rotation.set(0, 0, 0)
    if (Math.abs(s.x) < 0.001 && Math.abs(s.z) < 0.001) this.camera.lookAt(0, PLAYER_HEIGHT, -10)
    else this.camera.lookAt(0, PLAYER_HEIGHT, 0)
  }

  private makeRepeatingTexture(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
    const tex = source.clone()
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatX, repeatY)
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    tex.needsUpdate = true
    this.arenaTextures.push(tex) // tracked so clearArena disposes the clone (not the shared source)
    return tex
  }

  private makeGridTexture(): THREE.CanvasTexture {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1a2030'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#222a3d'
    ctx.fillRect(6, 6, size - 12, size - 12)
    ctx.strokeStyle = '#3da3c4'
    ctx.lineWidth = 4
    ctx.strokeRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(90,180,210,0.35)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const p = (size / 4) * i
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, size)
      ctx.moveTo(0, p)
      ctx.lineTo(size, p)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private buildWeapon() {
    this.weapon = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.5, metalness: 0.7 })
    this.weaponAccentMat = new THREE.MeshStandardMaterial({ color: 0x00d8ff, emissive: 0x00aacc, emissiveIntensity: 1.2 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), bodyMat)
    body.position.set(0, 0, -0.1)
    this.weaponBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.45), bodyMat)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), bodyMat)
    grip.position.set(0, -0.16, 0.04)
    grip.rotation.x = 0.25
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.2), this.weaponAccentMat)
    sight.position.set(0, 0.12, -0.1)

    this.magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.6 }),
    )
    this.magazine.position.set(0, this.magBaseY, -0.04)

    for (const part of [body, this.weaponBarrel, grip, sight, this.magazine]) part.visible = false
    this.weapon.add(body, this.weaponBarrel, grip, sight, this.magazine)

    this.weaponSpriteMat = new THREE.SpriteMaterial({
      map: WEAPON_SPRITE_TEXTURES.rifle,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.04,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.weaponSprite = new THREE.Sprite(this.weaponSpriteMat)
    this.weaponSprite.renderOrder = 20
    this.weapon.add(this.weaponSprite)

    this.muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.muzzleFlash.renderOrder = 21
    this.muzzleFlash.visible = false
    this.weapon.add(this.muzzleFlash)

    this.muzzleLight = new THREE.PointLight(0xffcc66, 0, 12, 2)
    this.muzzleLight.castShadow = false
    this.weapon.add(this.muzzleLight)

    this.weapon.position.set(WEAPON_VIEW_X, WEAPON_VIEW_Y, WEAPON_VIEW_Z)
    this.camera.add(this.weapon)
    this.applyWeaponModel(this.activeWeapon)
  }

  private applyWeaponModel(id: WeaponId) {
    const spec = WEAPONS[id]
    this.weaponAccentMat.color.setHex(spec.accent)
    this.weaponAccentMat.emissive.setHex(spec.accent)
    // anchor the barrel at the front of the body and extend it forward by barrelLen
    this.weaponBarrel.scale.z = spec.barrelLen / 0.45
    this.weaponBarrel.position.set(0, 0.02, -0.2 - spec.barrelLen / 2)

    const sprite = WEAPON_SPRITE_CONFIG[id]
    this.weaponSpriteMat.map = WEAPON_SPRITE_TEXTURES[id]
    this.weaponSpriteMat.needsUpdate = true
    this.weaponSprite.scale.set(sprite.scale[0], sprite.scale[1], 1)
    this.weaponSprite.position.set(sprite.offset[0], sprite.offset[1], sprite.offset[2])
    this.muzzleFlash.position.set(sprite.muzzle[0], sprite.muzzle[1], sprite.muzzle[2])
    this.muzzleFlash.scale.setScalar(sprite.flashScale)
    this.muzzleLight.position.set(sprite.muzzle[0], sprite.muzzle[1], sprite.muzzle[2])
  }

  // -------------------------------------------------------------------- waves

  private startWaveSystem() {
    for (const e of this.enemies) e.kill()
    this.waveIndex = 0
    this.waveActive = false
    this.waveBreakTimer = FIRST_WAVE_DELAY
    this.spawnTimer = 0
    this.killsThisWave = 0
    this.spawnedThisWave = 0
    this.bossActive = false
    this.bossEnemy = null
  }

  private updateWaves(delta: number) {
    if (!this.waveActive) {
      this.waveBreakTimer -= delta
      if (this.waveBreakTimer <= 0) this.startWave()
      return
    }
    if (this.waveIndex >= TOTAL_WAVES) return // boss wave: victory handled on death

    const wave = WAVES[this.waveIndex]
    this.spawnTimer -= delta
    if (this.spawnedThisWave < wave.count && this.aliveCount < wave.concurrent && this.spawnTimer <= 0) {
      this.spawnWaveEnemy()
      this.spawnedThisWave++
      this.spawnTimer = WAVE_SPAWN_INTERVAL
    }
    if (this.killsThisWave >= wave.count) this.completeWave()
  }

  private startWave() {
    this.waveActive = true
    this.killsThisWave = 0
    this.spawnedThisWave = 0
    this.spawnTimer = 0
    if (this.waveIndex < TOTAL_WAVES) {
      this.announce(`WAVE ${this.waveIndex + 1}`)
    } else {
      this.bossActive = true
      this.announce('⚠  BOSS')
      this.spawnBoss()
    }
  }

  private completeWave() {
    this.waveActive = false
    const cleared = this.waveIndex + 1
    this.waveIndex++
    this.waveBreakTimer = WAVE_BREAK
    this.announce(cleared >= TOTAL_WAVES ? 'FINAL WAVE CLEARED' : `WAVE ${cleared} CLEARED`)
  }

  /** Per-stage difficulty scalar for the campaign (1.0 on stage 1, no effect elsewhere). */
  private stageMul(): number {
    return 1 + STAGE_DIFFICULTY_STEP * this.campaignStage
  }

  private spawnWaveEnemy() {
    const wave = WAVES[this.waveIndex]
    const enemy = this.getFreeEnemy()
    const pt = this.randomSpawnPoint()
    const ranged = Math.random() < ENEMY_RANGED_CHANCE
    const color = ranged ? RANGED_COLOR : ENEMY_COLORS[(this.spawnedThisWave + this.waveIndex) % ENEMY_COLORS.length]
    enemy.spawnAt(pt.x, pt.z, {
      maxHealth: ENEMY_MAX_HEALTH * wave.healthMul * this.stageMul(),
      speed: (ENEMY_SPEED_MIN + Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN)) * wave.speedMul,
      color,
      ranged,
      projectileDamage: ENEMY_PROJECTILE_DAMAGE,
      projectileSpeed: ENEMY_PROJECTILE_SPEED,
    })
  }

  private spawnBoss() {
    const enemy = this.getFreeEnemy()
    const pt = this.randomSpawnPoint()
    const bossHp = BOSS_HEALTH * this.stageMul()
    enemy.spawnAt(pt.x, pt.z, {
      maxHealth: bossHp,
      isBoss: true,
      ranged: true,
      scale: BOSS_SCALE,
      speed: BOSS_SPEED,
      color: BOSS_COLOR,
      attackDamage: BOSS_ATTACK_DAMAGE,
      attackInterval: BOSS_ATTACK_INTERVAL,
      attackRange: BOSS_ATTACK_RANGE,
      projectileDamage: BOSS_PROJECTILE_DAMAGE,
      projectileSpeed: BOSS_PROJECTILE_SPEED,
    })
    this.bossEnemy = enemy
    this.bossMaxHealth = bossHp
  }

  private getFreeEnemy(): Enemy {
    let e = this.enemies.find((en) => !en.alive)
    if (!e) {
      e = new Enemy()
      this.scene.add(e.group)
      this.enemies.push(e)
      this.raycastTargets.push(...e.hitMeshes)
    }
    return e
  }

  private onEnemyDeath(enemy: Enemy, headshot: boolean) {
    const wasBoss = enemy.isBoss
    const spec = WEAPONS[this.activeWeapon]
    this.kills++
    // a dead mob's in-flight projectiles should fizzle out
    this.removeProjectilesFrom(enemy)

    if (this.survivors) {
      this.score += wasBoss ? 250 : 10
      this.spawnDeathPop(enemy.position.clone(), wasBoss ? 0xff2d55 : 0xffd166, wasBoss ? 2.0 : 0.8)
      this.dropXpGem(enemy.position.clone(), this.enemyXp.get(enemy) ?? SURV_XP_GEM_VALUE)
      // NOTE: no ammo on kill in Survivors — the sidearm is meant to run dry.
      return
    }

    this.killSeq++
    if (wasBoss) {
      this.score += BOSS_SCORE
      this.reserve = Math.min(spec.reserveCap, this.reserve + BOSS_RESERVE_BONUS)
      this.spawnDeathPop(enemy.position.clone(), 0xff2d55, 2.4)
      this.bossActive = false
      this.bossEnemy = null
      this.advanceCampaignOrWin()
    } else {
      this.score += ENEMY_SCORE + (headshot ? 50 : 0)
      this.reserve = Math.min(spec.reserveCap, this.reserve + spec.ammoPerKill)
      this.spawnDeathPop(enemy.position.clone(), 0xffd166, 1)
      this.killsThisWave++
      this.maybeDropPickup(enemy.position)
    }
  }

  // ------------------------------------------------------------------ pickups

  private maybeDropPickup(pos: THREE.Vector3) {
    if (Math.random() > PICKUP_DROP_CHANCE) return
    // weighted bag; locked weapons are extra appealing
    const bag: PickupKind[] = ['health', 'health', 'ammo', 'ammo', 'damage']
    for (const id of WEAPON_ORDER) {
      if (id !== 'rifle' && !this.unlocked.has(id)) bag.push(id, id)
    }
    const kind = bag[Math.floor(Math.random() * bag.length)]
    this.spawnPickup(kind, pos.x, pos.z)
  }

  /** Public-ish so the death path and tests can drop a known pickup. */
  spawnPickup(kind: PickupKind, x: number, z: number) {
    const color = PICKUP_COLORS[kind]
    const group = new THREE.Group()
    const isWeapon = kind === 'rifle' || kind === 'smg' || kind === 'shotgun' || kind === 'cannon'

    // The "icon" is child[0]: a billboarded sprite for pickups and weapon drops.
    let icon: THREE.Object3D
    if (isWeapon) {
      const mat = new THREE.SpriteMaterial({
        map: WEAPON_SPRITE_TEXTURES[kind],
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.set(1.5, 1.1, 1)
      sprite.position.y = 1.0
      sprite.userData = { baseScale: [1.5, 1.1], baseY: 1.0 }
      icon = sprite
    } else if (kind === 'health' || kind === 'ammo' || kind === 'damage') {
      const mat = new THREE.SpriteMaterial({
        map: PICKUP_SPRITE_TEXTURES[kind],
        transparent: true,
        alphaTest: 0.04,
        depthWrite: false,
        toneMapped: false,
      })
      const sprite = new THREE.Sprite(mat)
      const scale: [number, number] =
        kind === 'health' ? [0.9, 1.0] : kind === 'ammo' ? [0.84, 1.0] : [0.8, 1.0]
      sprite.scale.set(scale[0], scale[1], 1)
      sprite.position.y = 0.95
      sprite.userData = { baseScale: scale, baseY: 0.95 }
      icon = sprite
    } else {
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.3 }),
      )
      gem.position.y = 0.9
      gem.castShadow = true
      gem.userData = { baseY: 0.9 }
      icon = gem
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    beam.position.y = 0.8

    group.add(icon, ring, beam)
    group.position.set(x, 0, z)
    this.scene.add(group)
    this.pickups.push({ group, kind, age: 0 })
  }

  private updatePickups(delta: number) {
    const px = this.camera.position.x
    const pz = this.camera.position.z
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]
      p.age += delta
      const icon = p.group.children[0]
      const baseY = (icon.userData.baseY as number | undefined) ?? 0.9
      icon.position.y = baseY + Math.sin(p.age * 3) * 0.12
      if (icon instanceof THREE.Sprite) {
        const s = 1 + Math.sin(p.age * 4) * 0.06
        const baseScale = icon.userData.baseScale as [number, number] | undefined
        const sx = baseScale?.[0] ?? 1
        const sy = baseScale?.[1] ?? 1
        icon.scale.set(sx * s, sy * s, 1)
      } else {
        icon.rotation.y += delta * 2.2
      }

      const d = Math.hypot(p.group.position.x - px, p.group.position.z - pz)
      if (d < PICKUP_RADIUS) {
        this.collectPickup(p.kind)
        this.removePickup(i)
        continue
      }
      if (p.age >= PICKUP_TTL) this.removePickup(i)
    }
  }

  private removePickup(i: number) {
    const p = this.pickups[i]
    this.scene.remove(p.group)
    p.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      } else if (o instanceof THREE.Sprite) {
        // shared weapon textures are reused — dispose only the material instance
        o.material.dispose()
      }
    })
    this.pickups.splice(i, 1)
  }

  private collectPickup(kind: PickupKind) {
    if (kind === 'health') {
      this.health = Math.min(PLAYER_MAX_HEALTH, this.health + HEALTH_PICKUP_AMOUNT)
      this.showToast(`+${HEALTH_PICKUP_AMOUNT} HEALTH`)
    } else if (kind === 'ammo') {
      const spec = WEAPONS[this.activeWeapon]
      this.reserve = Math.min(spec.reserveCap, this.reserve + Math.ceil(spec.reserveCap * 0.5))
      this.showToast('+ AMMO')
    } else if (kind === 'damage') {
      this.damageBoostTimer = DAMAGE_BOOST_TIME
      this.showToast('2× DAMAGE')
    } else {
      // weapon
      this.unlockWeapon(kind)
      this.showToast(`+ ${WEAPONS[kind].name.toUpperCase()}`)
    }
    audio.sfx('pickup')
    this.emit()
  }

  // ------------------------------------------------------------------ weapons

  private unlockWeapon(id: WeaponId) {
    if (!this.unlocked.has(id)) {
      this.unlocked.add(id)
      this.weaponMag[id] = WEAPONS[id].magazineSize
      this.weaponReserve[id] = WEAPONS[id].reserve
    } else {
      // already owned -> top it up
      this.weaponReserve[id] = Math.min(WEAPONS[id].reserveCap, this.weaponReserve[id] + WEAPONS[id].reserve)
    }
    this.switchWeapon(id)
  }

  private switchWeapon(id: WeaponId) {
    if (!this.unlocked.has(id) || id === this.activeWeapon) return
    // stash current
    this.weaponMag[this.activeWeapon] = this.ammo
    this.weaponReserve[this.activeWeapon] = this.reserve
    this.activeWeapon = id
    this.ammo = this.weaponMag[id]
    this.reserve = this.weaponReserve[id]
    this.reloading = false
    this.reloadTimer = 0
    this.fireCooldown = 0.05
    this.applyWeaponModel(id)
    audio.sfx('switch')
    this.emit()
  }

  // ------------------------------------------------------------------- events

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('resize', this.onResize)
    this.controls.addEventListener('lock', this.onLock)
    this.controls.addEventListener('unlock', this.onUnlock)
  }

  private onContextMenu = (e: Event) => {
    if (this.status === 'playing') e.preventDefault() // right-click = melee, no menu
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // While paused, Esc resumes the game (re-acquires pointer lock).
    if (this.status === 'paused' && e.code === 'Escape') {
      e.preventDefault()
      this.requestLock()
      return
    }
    if (this.status !== 'playing') return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.move.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        this.move.back = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.move.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        this.move.right = true
        break
      case 'Space':
        e.preventDefault()
        if (this.canJump) {
          this.velocity.y = JUMP_VELOCITY
          this.canJump = false
        }
        break
      case 'KeyR':
        this.startReload()
        break
      case 'KeyF':
      case 'KeyV':
        this.tryMelee()
        break
      case 'Digit1':
        this.switchWeapon(WEAPON_ORDER[0])
        break
      case 'Digit2':
        this.switchWeapon(WEAPON_ORDER[1])
        break
      case 'Digit3':
        this.switchWeapon(WEAPON_ORDER[2])
        break
      case 'Digit4':
        this.switchWeapon(WEAPON_ORDER[3])
        break
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.move.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        this.move.back = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.move.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        this.move.right = false
        break
    }
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.controls.isLocked || this.status !== 'playing') return
    if (e.button === 2) {
      this.tryMelee() // right-click = melee
      return
    }
    if (e.button !== 0) return
    this.firing = true
    this.triggerQueued = true
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return
    this.firing = false
  }

  private onResize = () => {
    if (this.disposed) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private onLock = () => {
    if (this.status === 'pointerlock-needed' || this.status === 'paused') {
      this.status = 'playing'
      this.emit()
    }
  }

  private onUnlock = () => {
    if (this.status === 'playing') {
      this.status = 'paused'
      this.firing = false
      this.move.forward = this.move.back = this.move.left = this.move.right = false
      this.emit()
    }
  }

  requestLock() {
    if (this.status !== 'pointerlock-needed' && this.status !== 'paused') return
    this.lockPointer()
  }

  private lockRetry = 0
  private lockPointer(allowRetry = true) {
    try {
      const res: unknown = this.renderer.domElement.requestPointerLock()
      if (res && typeof (res as Promise<void>).catch === 'function') {
        ;(res as Promise<void>).catch(() => this.scheduleLockRetry(allowRetry))
      }
    } catch {
      // Browsers impose a short cooldown after Esc exits pointer lock, during
      // which requestPointerLock fails. Retry once after the cooldown clears.
      this.scheduleLockRetry(allowRetry)
    }
  }

  private scheduleLockRetry(allowRetry: boolean) {
    if (!allowRetry || this.status !== 'paused') return
    window.clearTimeout(this.lockRetry)
    this.lockRetry = window.setTimeout(() => {
      if (this.status === 'paused') this.lockPointer(false)
    }, 1300)
  }

  // -------------------------------------------------------------- multiplayer

  /** Join a PvP arena room. Disables the PvE campaign; players fight each other. */
  startMultiplayer(room: string, name: string, avatar: PlayerAvatarId = 'ranger') {
    this.leaveMultiplayer(false) // tear down any prior session/avatars first
    this.campaignStage = 0
    this.buildArena(getMap(DEFAULT_MAP_ID)) // PvP always uses the default arena
    this.resetPlayer()
    this.multiplayer = true
    this.connected = false
    this.roomName = room
    this.playerName = name || 'Player'
    this.playerAvatar = avatar
    this.kills = 0

    // Disable the PvE campaign.
    for (const e of this.enemies) e.kill()
    this.waveActive = false
    this.bossActive = false
    this.bossEnemy = null
    this.waveBreakTimer = 1e9
    this.clearProjectiles()
    while (this.pickups.length) this.removePickup(this.pickups.length - 1)

    this.net = new NetClient({
      onStatus: (c) => {
        this.connected = c
        this.emit()
      },
      onWelcome: (selfId, players) => {
        for (const p of players) {
          if (p.id === selfId) this.camera.position.set(p.x, PLAYER_HEIGHT, p.z)
          else this.addRemote(p)
        }
        this.emit()
      },
      onJoin: (p) => {
        this.addRemote(p)
        this.emit()
      },
      onLeave: (id) => {
        this.removeRemote(id)
        this.emit()
      },
      onState: (id, x, y, z, yaw, weapon, health) => {
        const r = this.remotePlayers.get(id)
        if (r) {
          r.setTarget(x, y, z, yaw)
          if (typeof health === 'number') r.setHealth(health)
        }
      },
      onName: (id, nm, remoteAvatar, slot) => {
        const r = this.remotePlayers.get(id)
        if (r) {
          r.setMeta(nm, r.kills, remoteAvatar, slot)
          this.emit()
        }
      },
      onHit: (msg) => this.onNetHit(msg),
    })
    this.net.connect(room, this.playerName, this.playerAvatar)

    this.status = 'pointerlock-needed'
    this.emit()
    this.requestLock()
  }

  /** Leave the room. If toMenu, return to the solo start menu. */
  leaveMultiplayer(toMenu = true) {
    if (this.net) {
      this.net.disconnect()
      this.net = null
    }
    for (const r of this.remotePlayers.values()) {
      this.scene.remove(r.group)
      this.raycastTargets = this.raycastTargets.filter((o) => !r.hitMeshes.includes(o as THREE.Mesh))
      r.dispose()
    }
    this.remotePlayers.clear()
    this.multiplayer = false
    this.connected = false
    this.roomName = ''
    if (toMenu) {
      this.resetPlayer()
      this.startWaveSystem()
      this.status = 'pointerlock-needed'
      this.emit()
    }
  }

  private addRemote(info: RemotePlayerInfo) {
    if (!this.net || info.id === this.net.selfId || this.remotePlayers.has(info.id)) return
    const avatar = new RemoteAvatar(info)
    this.scene.add(avatar.group)
    this.raycastTargets.push(...avatar.hitMeshes)
    this.remotePlayers.set(info.id, avatar)
  }

  private removeRemote(id: string) {
    const r = this.remotePlayers.get(id)
    if (!r) return
    this.scene.remove(r.group)
    this.raycastTargets = this.raycastTargets.filter((o) => !r.hitMeshes.includes(o as THREE.Mesh))
    r.dispose()
    this.remotePlayers.delete(id)
  }

  private onNetHit(msg: import('../net/NetClient').HitMessage) {
    const selfId = this.net?.selfId
    if (msg.target === selfId) {
      this.health = msg.health
      this.damageSeq++
      audio.sfx('hurt')
      if (msg.killed && msg.respawn) {
        this.camera.position.set(msg.respawn.x, PLAYER_HEIGHT, msg.respawn.z)
        this.velocity.set(0, 0, 0)
        this.showToast(`☠ Fragged by ${msg.byName}`)
      }
    } else {
      const r = this.remotePlayers.get(msg.target)
      if (r) {
        r.setHealth(msg.health)
        if (msg.killed && msg.respawn) {
          r.group.position.set(msg.respawn.x, 0, msg.respawn.z)
          r.setTarget(msg.respawn.x, PLAYER_HEIGHT, msg.respawn.z, 0)
        }
      }
    }
    if (msg.by === selfId) {
      this.kills = msg.killerKills
      if (msg.killed) {
        this.killSeq++
        this.showToast('FRAG!')
        audio.sfx('kill')
      }
    } else {
      const rk = this.remotePlayers.get(msg.by)
      if (rk) rk.setMeta(rk.name, msg.killerKills)
    }
    this.emit()
  }

  private updateMultiplayer(delta: number) {
    const quat = this.camera.quaternion
    for (const r of this.remotePlayers.values()) r.update(delta, quat, this.camera.position)
    if (this.net) {
      this._euler.setFromQuaternion(quat, 'YXZ')
      this.net.sendState(
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
        this._euler.y,
        WEAPONS[this.activeWeapon].name,
        Math.round(this.health),
      )
    }
  }

  // --------------------------------------------------------------- survivors

  private get maxHealthValue(): number {
    return PLAYER_MAX_HEALTH + this.statMaxHpBonus
  }

  /**
   * Enter the campaign (explicit, from the menu). The campaign is a journey
   * through several maps starting at `startMapId` (the rest follow in order,
   * wrapping). Each stage = that map's waves + boss; the final boss wins.
   */
  startCampaign(startMapId?: string) {
    this.leaveMultiplayer(false)
    this.survivors = false
    this.recomputeStats()
    this.campaignMaps = campaignSequence(startMapId ?? CAMPAIGN_ORDER[0])
    this.campaignStage = 0
    this.buildArena(this.campaignMaps[0])
    this.resetPlayer()
    this.clearTransientFx()
    this.clearSurvivorsEntities()
    this.startWaveSystem()
    this.status = 'pointerlock-needed'
    this.emit()
    this.requestLock()
  }

  /** Boss down: advance to the next campaign map, or win if this was the last. */
  private advanceCampaignOrWin() {
    if (this.campaignStage < this.campaignMaps.length - 1) {
      this.campaignStage++
      const next = this.campaignMaps[this.campaignStage]
      this.health = Math.min(this.maxHealthValue, this.health + STAGE_CLEAR_HEAL)
      this.buildArena(next)
      this.clearTransientFx()
      this.placeAtSpawn()
      this.startWaveSystem()
      this.announce(`STAGE ${this.campaignStage + 1}/${this.campaignMaps.length} · ${next.name.toUpperCase()}`)
      this.emit()
    } else {
      this.gameOver('win')
    }
  }

  /** Enter Survivors mode (endless swarms + level-up draft). */
  startSurvivors() {
    this.leaveMultiplayer(false)
    this.survivors = true
    this.campaignStage = 0
    this.buildArena(getMap(DEFAULT_MAP_ID))
    this.resetPlayer()
    this.initSurvivorsRun()
    this.status = 'pointerlock-needed'
    this.emit()
    this.requestLock()
  }

  private initSurvivorsRun() {
    this.level = 1
    this.xp = 0
    this.xpToNext = xpForLevel(1)
    this.pendingLevels = 0
    this.choices = []
    this.upgradeLevels = {}
    if ((this.shopTiers['arsenal'] ?? 0) > 0) this.upgradeLevels.orbit = 1 // Arsenal perk
    this.survSpawnTimer = 1.0
    this.survClock = 0
    this.eliteTimer = SURV_ELITE_INTERVAL
    this.boltTimer = 0
    this.novaTimer = NOVA_INTERVAL
    for (const e of this.enemies) e.kill()
    this.clearSurvivorsEntities()
    this.recomputeStats()
    this.health = this.maxHealthValue
    // No ammo economy in Survivors — the sidearm is infinite (shown as ∞).
    // Depth comes from the drafted auto-weapons + melee, not from reloading.
    this.ammo = WEAPONS[this.activeWeapon].magazineSize
    this.reserve = 0
    this.reloading = false
  }

  private clearSurvivorsEntities() {
    for (const g of this.xpGems) {
      this.scene.remove(g.mesh)
      g.mesh.geometry.dispose()
      ;(g.mesh.material as THREE.Material).dispose()
    }
    this.xpGems = []
    for (const b of this.bolts) {
      this.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      ;(b.mesh.material as THREE.Material).dispose()
    }
    this.bolts = []
    for (const n of this.novas) {
      this.scene.remove(n.mesh)
      n.mesh.geometry.dispose()
      ;(n.mesh.material as THREE.Material).dispose()
    }
    this.novas = []
    this.rebuildOrbit(0)
    this.orbitGroup.visible = false
  }

  /** Apply persistent shop tiers (called by React with the saved meta-progression). */
  setShopUpgrades(tiers: Record<string, number>) {
    this.shopTiers = tiers || {}
    if (this.survivors) this.recomputeStats()
  }

  private recomputeStats() {
    const lv = (id: UpgradeId) => this.upgradeLevels[id] ?? 0
    const sh = (id: string) => this.shopTiers[id] ?? 0
    this.statDamageMul = (1 + 0.25 * lv('dmg')) * (1 + 0.08 * sh('might'))
    this.statFireRateMul = 1 + 0.18 * lv('rate')
    this.statMoveMul = (1 + 0.12 * lv('speed')) * (1 + 0.06 * sh('swift'))
    this.statMaxHpBonus = 25 * lv('maxhp') + 15 * sh('vigor')
    this.statRegen = 1.5 * lv('regen') + 0.6 * sh('regenP')
    this.statMagnet = SURV_BASE_MAGNET * (1 + 0.45 * lv('magnet')) * (1 + 0.2 * sh('magnetP'))
    this.statXpMul = (1 + 0.2 * lv('xpgain')) * (1 + 0.1 * sh('scholar'))
    this.statCrit = 0.12 * lv('crit')
    this.statMultishot = lv('multishot')
    this.orbitLevel = lv('orbit')
    this.boltLevel = lv('bolt')
    this.novaLevel = lv('nova')
    this.rebuildOrbit(this.orbitLevel ? this.orbitLevel + 1 : 0) // L1 = 2 blades
    if (this.survivors) this.orbitGroup.visible = this.orbitLevel > 0
  }

  private rebuildOrbit(count: number) {
    for (const o of this.orbitOrbs) {
      this.orbitGroup.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.orbitOrbs = []
    for (let i = 0; i < count; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x6fe7ff, emissive: 0x29c5ff, emissiveIntensity: 2.2, roughness: 0.3 }),
      )
      this.orbitGroup.add(orb)
      this.orbitOrbs.push(orb)
    }
  }

  private gainXp(v: number) {
    this.xp += v * this.statXpMul
    let leveled = false
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = xpForLevel(this.level)
      this.pendingLevels++
      leveled = true
    }
    if (leveled && this.status === 'playing') this.triggerLevelUp()
  }

  private triggerLevelUp() {
    this.status = 'levelup'
    this.rollChoices()
    if (this.controls.isLocked) this.controls.unlock()
    audio.sfx('victory')
    this.emit()
  }

  private rollChoices() {
    const eligible = UPGRADES.filter((u) => (this.upgradeLevels[u.id] ?? 0) < u.max)
    // shuffle (no seeded RNG needed here)
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
    }
    const pick = eligible.slice(0, 3)
    this.choices = pick.map((u) => ({
      id: u.id,
      name: u.name,
      desc: u.desc,
      icon: u.icon,
      level: this.upgradeLevels[u.id] ?? 0,
      max: u.max,
    }))
  }

  /** Called from the React draft UI when a card is chosen. */
  pickUpgrade(id: string) {
    if (this.status !== 'levelup') return
    const uid = id as UpgradeId
    if (UPGRADE_BY_ID[uid]) {
      const prev = this.upgradeLevels[uid] ?? 0
      this.upgradeLevels[uid] = prev + 1
      this.recomputeStats()
      if (uid === 'maxhp') this.health = Math.min(this.maxHealthValue, this.health + 25)
      audio.sfx('pickup')
    }
    this.pendingLevels = Math.max(0, this.pendingLevels - 1)
    if (this.pendingLevels > 0) {
      this.rollChoices()
      this.emit()
    } else {
      this.choices = []
      this.status = 'playing'
      this.emit()
      this.lockPointer()
    }
  }

  private updateSurvivors(delta: number) {
    this.survClock += delta

    // regen
    if (this.statRegen > 0 && this.health > 0) {
      this.health = Math.min(this.maxHealthValue, this.health + this.statRegen * delta)
    }

    // escalating swarm spawns
    this.survSpawnTimer -= delta
    const interval = Math.max(SURV_SPAWN_MIN, SURV_SPAWN_START - this.survClock * 0.012)
    if (this.survSpawnTimer <= 0 && this.aliveCount < SURV_SPAWN_CAP) {
      this.spawnSwarmEnemy(false)
      this.survSpawnTimer = interval
    }
    this.eliteTimer -= delta
    if (this.eliteTimer <= 0) {
      this.spawnSwarmEnemy(true)
      this.eliteTimer = SURV_ELITE_INTERVAL
    }

    this.updateOrbit(delta)
    this.updateBolts(delta)
    this.updateNovas(delta)
    this.updateXpGems(delta)
  }

  private spawnSwarmEnemy(elite: boolean) {
    const enemy = this.getFreeEnemy()
    // spawn on a ring around the player, just out of immediate sight
    const a = Math.random() * Math.PI * 2
    const r = 26 + Math.random() * 10
    let x = this.camera.position.x + Math.cos(a) * r
    let z = this.camera.position.z + Math.sin(a) * r
    const lim = ARENA_HALF - 2
    x = Math.max(-lim, Math.min(lim, x))
    z = Math.max(-lim, Math.min(lim, z))
    const scale = 1 + this.survClock * 0.015 // HP scales with time
    const hp = SURV_ENEMY_BASE_HP * scale * (elite ? 9 : 1)
    const ranged = !elite && Math.random() < 0.18 + Math.min(0.25, this.survClock * 0.002)
    enemy.spawnAt(x, z, {
      maxHealth: hp,
      speed: (elite ? 2.2 : 2.8 + Math.random() * 1.4) * (1 + this.survClock * 0.004),
      color: elite ? 0xff1f4f : ranged ? RANGED_COLOR : ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
      isBoss: elite,
      ranged,
      scale: elite ? 2.2 : 1,
      attackDamage: elite ? 16 : 7,
      projectileDamage: 7,
    })
    this.enemyXp.set(enemy, elite ? SURV_XP_ELITE_VALUE : SURV_XP_GEM_VALUE)
  }

  /** Apply damage from an auto-weapon (handles death + XP, no crosshair marker). */
  private autoDamageEnemy(enemy: Enemy, dmg: number) {
    if (!enemy.alive) return
    const crit = this.statCrit > 0 && Math.random() < this.statCrit
    const total = dmg * this.statDamageMul * (crit ? 2 : 1)
    const res = enemy.takeDamage(total, false)
    this.addDamageNumber(enemy.position.clone().setY(1.6), total, crit ? 'crit' : 'normal')
    if (res.died) this.onEnemyDeath(enemy, false)
  }

  private updateOrbit(delta: number) {
    if (this.orbitLevel <= 0) {
      this.orbitGroup.visible = false
      return
    }
    this.orbitGroup.visible = true
    this.orbitGroup.position.set(this.camera.position.x, 1.2, this.camera.position.z)
    this.orbitAngle += ORBIT_SPEED * delta
    const n = this.orbitOrbs.length
    for (let i = 0; i < n; i++) {
      const ang = this.orbitAngle + (i / n) * Math.PI * 2
      this.orbitOrbs[i].position.set(Math.cos(ang) * ORBIT_RADIUS, 0, Math.sin(ang) * ORBIT_RADIUS)
    }
    const dmg = ORBIT_DMG * (1 + 0.25 * (this.orbitLevel - 1))
    const now = this.survClock
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const ep = enemy.position
      let near = false
      for (const orb of this.orbitOrbs) {
        const ox = this.orbitGroup.position.x + orb.position.x
        const oz = this.orbitGroup.position.z + orb.position.z
        if (Math.hypot(ep.x - ox, ep.z - oz) < ORBIT_HIT_RADIUS + enemy.radius) {
          near = true
          break
        }
      }
      if (near && (this.orbitCd.get(enemy) ?? 0) <= now) {
        this.orbitCd.set(enemy, now + ORBIT_HIT_CD)
        this.autoDamageEnemy(enemy, dmg)
      }
    }
  }

  private updateBolts(delta: number) {
    if (this.boltLevel > 0) {
      this.boltTimer -= delta
      const interval = Math.max(0.18, 0.9 - 0.08 * (this.boltLevel - 1))
      if (this.boltTimer <= 0) {
        this.boltTimer = interval
        const count = 1 + Math.floor((this.boltLevel - 1) / 2)
        for (let i = 0; i < count; i++) this.fireBolt()
      }
    }
    const eyeY = 1.3
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.age += delta
      // light homing toward nearest enemy
      const tgt = this.nearestEnemy(b.mesh.position)
      if (tgt) {
        const dx = tgt.position.x - b.mesh.position.x
        const dz = tgt.position.z - b.mesh.position.z
        const d = Math.hypot(dx, dz) || 1
        const cur = b.vel.length() || BOLT_SPEED
        b.vel.x += (dx / d) * cur * 2.5 * delta
        b.vel.z += (dz / d) * cur * 2.5 * delta
        b.vel.setLength(cur)
      }
      b.mesh.position.addScaledVector(b.vel, delta)
      b.mesh.position.y = eyeY
      let hitEnemy: Enemy | null = null
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue
        if (Math.hypot(enemy.position.x - b.mesh.position.x, enemy.position.z - b.mesh.position.z) < 0.8 + enemy.radius) {
          hitEnemy = enemy
          break
        }
      }
      const bound = ARENA_HALF - 1
      if (hitEnemy) {
        this.autoDamageEnemy(hitEnemy, b.dmg)
        b.pierce -= 1
        if (b.pierce < 0) {
          this.removeBolt(i)
          continue
        }
      }
      if (b.age > BOLT_TTL || Math.abs(b.mesh.position.x) > bound || Math.abs(b.mesh.position.z) > bound) {
        this.removeBolt(i)
      }
    }
  }

  private fireBolt() {
    const tgt = this.nearestEnemy(this.camera.position)
    if (!tgt) return
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x8affff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    mesh.position.set(this.camera.position.x, 1.3, this.camera.position.z)
    const dx = tgt.position.x - mesh.position.x
    const dz = tgt.position.z - mesh.position.z
    const d = Math.hypot(dx, dz) || 1
    const vel = new THREE.Vector3((dx / d) * BOLT_SPEED, 0, (dz / d) * BOLT_SPEED)
    this.scene.add(mesh)
    this.bolts.push({ mesh, vel, dmg: BOLT_DMG * (1 + 0.18 * (this.boltLevel - 1)), age: 0, pierce: Math.floor((this.boltLevel - 1) / 2) })
    audio.sfx('hit')
  }

  private removeBolt(i: number) {
    const b = this.bolts[i]
    this.scene.remove(b.mesh)
    b.mesh.geometry.dispose()
    ;(b.mesh.material as THREE.Material).dispose()
    this.bolts.splice(i, 1)
  }

  private updateNovas(delta: number) {
    if (this.novaLevel > 0) {
      this.novaTimer -= delta
      const interval = Math.max(1.4, NOVA_INTERVAL - 0.22 * (this.novaLevel - 1))
      if (this.novaTimer <= 0) {
        this.novaTimer = interval
        this.castNova()
      }
    }
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const nv = this.novas[i]
      nv.age += delta
      const t = nv.age / nv.ttl
      const radius = nv.maxR * t
      nv.mesh.scale.setScalar(Math.max(0.001, radius))
      ;(nv.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - t))
      // damage enemies the ring has reached (once each)
      for (const enemy of this.enemies) {
        if (!enemy.alive || nv.hit.has(enemy)) continue
        const d = Math.hypot(enemy.position.x - nv.mesh.position.x, enemy.position.z - nv.mesh.position.z)
        if (d <= radius) {
          nv.hit.add(enemy)
          this.autoDamageEnemy(enemy, nv.dmg)
        }
      }
      if (nv.age >= nv.ttl) {
        this.scene.remove(nv.mesh)
        nv.mesh.geometry.dispose()
        ;(nv.mesh.material as THREE.Material).dispose()
        this.novas.splice(i, 1)
      }
    }
  }

  private castNova() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(this.camera.position.x, 0.2, this.camera.position.z)
    ring.scale.setScalar(0.001)
    this.scene.add(ring)
    this.novas.push({
      mesh: ring,
      age: 0,
      ttl: 0.55,
      hit: new Set(),
      dmg: NOVA_DMG * (1 + 0.3 * (this.novaLevel - 1)),
      maxR: NOVA_RADIUS * (1 + 0.12 * (this.novaLevel - 1)),
    })
    audio.sfx('boss')
  }

  private nearestEnemy(from: THREE.Vector3): Enemy | null {
    let best: Enemy | null = null
    let bestD = Infinity
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = (e.position.x - from.x) ** 2 + (e.position.z - from.z) ** 2
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  private dropXpGem(pos: THREE.Vector3, value: number) {
    const big = value > 1
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(big ? 0.42 : 0.26),
      new THREE.MeshStandardMaterial({
        color: big ? 0xffd166 : 0x59f0c0,
        emissive: big ? 0xffb02e : 0x2ee6a6,
        emissiveIntensity: 1.8,
        roughness: 0.3,
      }),
    )
    mesh.position.set(pos.x, 0.6, pos.z)
    this.scene.add(mesh)
    this.xpGems.push({ mesh, value, age: 0 })
  }

  private updateXpGems(delta: number) {
    const px = this.camera.position.x
    const pz = this.camera.position.z
    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      const g = this.xpGems[i]
      g.age += delta
      g.mesh.rotation.y += delta * 3
      g.mesh.position.y = 0.6 + Math.sin(g.age * 4) * 0.1
      const d = Math.hypot(g.mesh.position.x - px, g.mesh.position.z - pz)
      if (d < this.statMagnet) {
        // magnet pull
        const pull = (1 - d / this.statMagnet) * 26 + 4
        g.mesh.position.x += ((px - g.mesh.position.x) / (d || 1)) * pull * delta
        g.mesh.position.z += ((pz - g.mesh.position.z) / (d || 1)) * pull * delta
      }
      if (d < 1.3) {
        this.gainXp(g.value)
        this.scene.remove(g.mesh)
        g.mesh.geometry.dispose()
        ;(g.mesh.material as THREE.Material).dispose()
        this.xpGems.splice(i, 1)
      }
    }
  }

  /** Build summary for the HUD level-up / loadout panels. */
  private buildList(): BuildEntry[] {
    const out: BuildEntry[] = []
    for (const u of UPGRADES) {
      const lvl = this.upgradeLevels[u.id] ?? 0
      if (lvl > 0) out.push({ id: u.id, name: u.name, icon: u.icon, level: lvl, max: u.max })
    }
    return out
  }

  // -------------------------------------------------------------------- loop

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)

    const delta = Math.min(this.clock.getDelta(), 0.1)
    const elapsed = this.clock.elapsedTime

    if (this.status === 'playing') this.update(delta, elapsed)
    else if (this.status !== 'paused') this.updateEffects(delta)
    // When paused, nothing simulates — the frame is just re-rendered as-is.

    this.emitAccumulator += delta
    if (this.emitAccumulator >= 0.1) {
      this.emitAccumulator = 0
      this.emit()
    }

    this.renderer.render(this.scene, this.camera)
  }

  private update(delta: number, elapsed: number) {
    this.time += delta
    if (this.damageBoostTimer > 0) this.damageBoostTimer = Math.max(0, this.damageBoostTimer - delta)
    if (this.meleeCd > 0) this.meleeCd -= delta
    if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - delta)

    this.updatePlayerMovement(delta)
    this.resolveCollisions()
    this.updateWeapon(delta)
    this.updateEffects(delta)
    this.updatePickups(delta)

    const spec = WEAPONS[this.activeWeapon]
    this.fireCooldown -= delta
    if (this.reloading) {
      this.reloadTimer -= delta
      if (this.reloadTimer <= 0) this.finishReload()
    } else if (this.ammo > 0) {
      if (spec.auto) {
        if (this.firing && this.fireCooldown <= 0) this.shoot()
      } else if (this.triggerQueued && this.fireCooldown <= 0) {
        this.shoot()
        this.triggerQueued = false
      }
    } else if (this.firing || this.triggerQueued) {
      this.triggerQueued = false
      this.startReload()
    }

    if (this.multiplayer) {
      this.updateMultiplayer(delta)
    } else if (this.survivors) {
      this.updateEnemies(delta, elapsed)
      this.updateProjectiles(delta)
      this.updateSurvivors(delta)
    } else {
      this.updateEnemies(delta, elapsed)
      this.updateProjectiles(delta)
      this.updateWaves(delta)
    }
  }

  private updatePlayerMovement(delta: number) {
    this.velocity.x -= this.velocity.x * MOVE_DAMPING * delta
    this.velocity.z -= this.velocity.z * MOVE_DAMPING * delta
    this.velocity.y -= GRAVITY * delta

    this._dir.z = Number(this.move.forward) - Number(this.move.back)
    this._dir.x = Number(this.move.right) - Number(this.move.left)
    this._dir.normalize()

    const accel = MOVE_ACCEL * this.statMoveMul
    if (this.move.forward || this.move.back) this.velocity.z -= this._dir.z * accel * delta
    if (this.move.left || this.move.right) this.velocity.x -= this._dir.x * accel * delta

    this.controls.moveRight(-this.velocity.x * delta)
    this.controls.moveForward(-this.velocity.z * delta)

    this.camera.position.y += this.velocity.y * delta
    if (this.camera.position.y < PLAYER_HEIGHT) {
      this.velocity.y = 0
      this.camera.position.y = PLAYER_HEIGHT
      this.canJump = true
    }
  }

  private pushOutOfObstacles(pos: THREE.Vector3, radius: number) {
    for (const box of this.obstacleBoxes) {
      const minX = box.min.x - radius
      const maxX = box.max.x + radius
      const minZ = box.min.z - radius
      const maxZ = box.max.z + radius
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const dl = pos.x - minX
        const dr = maxX - pos.x
        const dd = pos.z - minZ
        const du = maxZ - pos.z
        const m = Math.min(dl, dr, dd, du)
        if (m === dl) pos.x = minX
        else if (m === dr) pos.x = maxX
        else if (m === dd) pos.z = minZ
        else pos.z = maxZ
      }
    }
  }

  private resolveCollisions() {
    const pos = this.camera.position
    const limit = ARENA_HALF - WALL_THICKNESS / 2 - PLAYER_RADIUS
    pos.x = Math.max(-limit, Math.min(limit, pos.x))
    pos.z = Math.max(-limit, Math.min(limit, pos.z))
    this.pushOutOfObstacles(pos, PLAYER_RADIUS)
  }

  private tryMelee() {
    if (this.status !== 'playing' || this.meleeCd > 0) return
    this.doMelee()
  }

  /** Knife swing: always available (no ammo). Hits a frontal cluster of enemies. */
  private doMelee() {
    this.meleeCd = MELEE_COOLDOWN
    this.meleeAnim = 0.22
    audio.sfx('hit')

    this.camera.getWorldDirection(this._fwd)
    const flen = Math.hypot(this._fwd.x, this._fwd.z) || 1
    const dirX = this._fwd.x / flen
    const dirZ = this._fwd.z / flen
    const px = this.camera.position.x
    const pz = this.camera.position.z
    const dmgMul = this.statDamageMul
    let hitAny = false

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const ex = enemy.position.x - px
      const ez = enemy.position.z - pz
      const d = Math.hypot(ex, ez)
      if (d > MELEE_RANGE + enemy.radius) continue
      if (d > 0.0001 && (ex * dirX + ez * dirZ) / d < MELEE_ARC_DOT) continue
      const crit = this.statCrit > 0 && Math.random() < this.statCrit ? 2 : 1
      const dmg = MELEE_DAMAGE * dmgMul * crit
      const res = enemy.takeDamage(dmg, false)
      hitAny = true
      this.addDamageNumber(enemy.position.clone().setY(1.6), dmg, crit > 1 ? 'crit' : 'normal')
      if (res.died) this.onEnemyDeath(enemy, false)
    }

    if (this.multiplayer && this.net) {
      for (const r of this.remotePlayers.values()) {
        const rx = r.group.position.x - px
        const rz = r.group.position.z - pz
        const d = Math.hypot(rx, rz)
        if (d > MELEE_RANGE + 0.6) continue
        if (d > 0.0001 && (rx * dirX + rz * dirZ) / d < MELEE_ARC_DOT) continue
        this.net.sendHit(r.id, MELEE_DAMAGE * dmgMul)
        hitAny = true
      }
    }

    if (hitAny) this.hitMarkerSeq++
    this.emit()
  }

  private shoot() {
    const spec = WEAPONS[this.activeWeapon]
    if (!this.survivors) this.ammo-- // Survivors: the sidearm has no ammo system
    this.fireCooldown = spec.fireInterval / this.statFireRateMul
    this.weaponRecoil = Math.min(0.16, this.weaponRecoil + (spec.pellets > 1 ? 0.12 : 0.05))
    audio.sfx('shoot')

    this.muzzleTimer = 0.05
    this.muzzleFlash.visible = true
    this.muzzleFlash.rotation.z = Math.random() * Math.PI
    this.muzzleLight.intensity = 8

    this.scene.updateMatrixWorld()
    this.camera.getWorldPosition(this._origin)
    this.camera.getWorldDirection(this._fwd)
    this._right.crossVectors(this._fwd, this._worldUp).normalize()
    this._up.crossVectors(this._right, this._fwd).normalize()

    const dmgMult = (this.damageBoostTimer > 0 ? DAMAGE_BOOST_MULT : 1) * this.statDamageMul
    const muzzleWorld = this.muzzleFlash.getWorldPosition(new THREE.Vector3())
    const pellets = spec.pellets + (this.survivors ? this.statMultishot : 0)
    const spread = pellets > 1 ? Math.max(spec.spread, 0.03) : spec.spread

    for (let p = 0; p < pellets; p++) {
      const dir = this._fwd.clone()
      if (spread > 0) {
        dir.addScaledVector(this._right, (Math.random() * 2 - 1) * spread)
        dir.addScaledVector(this._up, (Math.random() * 2 - 1) * spread)
        dir.normalize()
      }
      this.raycaster.set(this._origin, dir)
      this.raycaster.far = 500
      const hits = this.raycaster.intersectObjects(this.raycastTargets, false)

      let endPoint: THREE.Vector3 | null = null
      for (const h of hits) {
        const ud = h.object.userData as { enemy?: Enemy; part?: string; solid?: boolean; remoteId?: string }
        if (ud.remoteId) {
          // PvP: report the hit to the server (authoritative health/kills).
          const headshot = ud.part === 'head'
          const dmg = spec.damage * dmgMult * (headshot ? HEADSHOT_MULTIPLIER : 1)
          this.net?.sendHit(ud.remoteId, dmg)
          endPoint = h.point.clone()
          this.addDamageNumber(h.point, dmg, headshot ? 'head' : 'normal')
          if (headshot) {
            this.headshots++
            this.headshotSeq++
            audio.sfx('headshot')
          } else {
            this.hitMarkerSeq++
            audio.sfx('hit')
          }
          break
        } else if (ud.enemy) {
          if (!ud.enemy.alive) continue
          const headshot = ud.part === 'head'
          const crit = this.statCrit > 0 && Math.random() < this.statCrit ? 2 : 1
          const dmg = spec.damage * dmgMult * crit * (headshot ? HEADSHOT_MULTIPLIER : 1)
          const res = ud.enemy.takeDamage(dmg, headshot)
          endPoint = h.point.clone()
          if (!res.blocked) this.addDamageNumber(h.point, dmg, headshot ? 'head' : crit > 1 ? 'crit' : 'normal')
          if (res.blocked) {
            this.hitMarkerSeq++ // shield ping (no damage)
            audio.sfx('shieldhit')
          } else if (res.died) {
            if (headshot) {
              this.headshots++
              this.headshotSeq++
              this.showToast('HEADSHOT!')
              audio.sfx('headshot')
            }
            this.onEnemyDeath(ud.enemy, headshot)
            audio.sfx('kill')
          } else if (headshot) {
            this.headshots++
            this.headshotSeq++
            audio.sfx('headshot')
          } else {
            this.hitMarkerSeq++
            audio.sfx('hit')
          }
          break
        } else if (ud.solid) {
          endPoint = h.point.clone()
          break
        }
      }
      if (!endPoint) endPoint = this.raycaster.ray.at(120, new THREE.Vector3())
      this.addTracer(muzzleWorld, endPoint)
    }

    if (this.ammo <= 0) this.startReload()
    this.emit()
  }

  private startReload() {
    if (this.survivors) return // no reloads in Survivors — the gun is infinite
    const spec = WEAPONS[this.activeWeapon]
    if (this.reloading || this.reserve <= 0 || this.ammo >= spec.magazineSize) return
    this.reloading = true
    this.reloadTimer = RELOAD_TIME
    this.firing = false
    audio.sfx('reload')
    this.emit()
  }

  private finishReload() {
    const spec = WEAPONS[this.activeWeapon]
    const need = spec.magazineSize - this.ammo
    const taken = Math.min(need, this.reserve)
    this.ammo += taken
    this.reserve -= taken
    this.reloading = false
    this.magazine.position.y = this.magBaseY
    this.weapon.rotation.set(0, 0, 0)
    this.emit()
  }

  private updateEnemies(delta: number, elapsed: number) {
    let damageToPlayer = 0
    const playerPos = this.camera.position
    const quat = this.camera.quaternion
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const tick = enemy.update(delta, elapsed, playerPos, this.enemies, quat)
      damageToPlayer += tick.melee
      for (const shot of tick.shots) this.spawnProjectile(shot, enemy)
      this.pushOutOfObstacles(enemy.position, enemy.radius)
    }
    if (damageToPlayer > 0) this.damagePlayer(damageToPlayer)
  }

  private damagePlayer(amount: number) {
    this.health = Math.max(0, this.health - amount)
    this.damageSeq++
    audio.sfx('hurt')
    this.emit()
    if (this.health <= 0) this.gameOver('dead')
  }

  // -------------------------------------------------------------- projectiles

  private spawnProjectile(shot: EnemyShot, owner: Enemy | null = null) {
    const color = shot.fromBoss ? 0xff2d6a : 0xff8a3c
    const mesh = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shot.fromBoss ? PROJECTILE_SPRITE_TEXTURES.boss : PROJECTILE_SPRITE_TEXTURES.enemy,
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }))
    const baseScale = shot.fromBoss ? 0.9 : 0.58
    mesh.scale.setScalar(baseScale)
    mesh.position.copy(shot.origin)
    this.scene.add(mesh)
    this.projectiles.push({
      mesh,
      vel: shot.dir.clone().multiplyScalar(shot.speed),
      damage: shot.damage,
      age: 0,
      fromBoss: shot.fromBoss,
      baseScale,
      spin: (Math.random() < 0.5 ? -1 : 1) * (shot.fromBoss ? 3.8 : 5.5),
      owner,
    })
  }

  /** Despawn any in-flight projectiles fired by a given enemy (it just died). */
  private removeProjectilesFrom(enemy: Enemy) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].owner === enemy) this.removeProjectile(i)
    }
  }

  private updateProjectiles(delta: number) {
    const player = this.camera.position
    const bound = ARENA_HALF - WALL_THICKNESS / 2
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]
      pr.age += delta
      pr.mesh.position.addScaledVector(pr.vel, delta)
      const pulse = 1 + Math.sin(pr.age * (pr.fromBoss ? 10 : 14)) * 0.12
      pr.mesh.scale.setScalar(pr.baseScale * pulse)
      ;(pr.mesh.material as THREE.SpriteMaterial).rotation += delta * pr.spin
      const p = pr.mesh.position

      // hit the player?
      if (p.distanceTo(player) < PROJECTILE_HIT_RADIUS) {
        this.removeProjectile(i)
        this.damagePlayer(pr.damage)
        continue
      }
      // expired / out of bounds / into an obstacle?
      if (pr.age >= PROJECTILE_TTL || Math.abs(p.x) > bound || Math.abs(p.z) > bound || p.y < 0.05) {
        this.removeProjectile(i)
        continue
      }
      let blocked = false
      for (const box of this.obstacleBoxes) {
        if (p.x > box.min.x - 0.1 && p.x < box.max.x + 0.1 && p.z > box.min.z - 0.1 && p.z < box.max.z + 0.1 && p.y < box.max.y + 0.1) {
          blocked = true
          break
        }
      }
      if (blocked) this.removeProjectile(i)
    }
  }

  private removeProjectile(i: number) {
    const pr = this.projectiles[i]
    this.scene.remove(pr.mesh)
    ;(pr.mesh.material as THREE.Material).dispose()
    this.projectiles.splice(i, 1)
  }

  private clearProjectiles() {
    for (const pr of this.projectiles) {
      this.scene.remove(pr.mesh)
      ;(pr.mesh.material as THREE.Material).dispose()
    }
    this.projectiles = []
  }

  private randomSpawnPoint(): { x: number; z: number } {
    const playerPos = this.camera.position
    const limit = ARENA_HALF - 3
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (Math.random() * 2 - 1) * limit
      const z = (Math.random() * 2 - 1) * limit
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 16) continue
      let inObstacle = false
      for (const box of this.obstacleBoxes) {
        if (x > box.min.x - 1.5 && x < box.max.x + 1.5 && z > box.min.z - 1.5 && z < box.max.z + 1.5) {
          inObstacle = true
          break
        }
      }
      if (inObstacle) continue
      return { x, z }
    }
    return { x: limit * (Math.random() < 0.5 ? -1 : 1), z: limit * (Math.random() < 0.5 ? -1 : 1) }
  }

  // ----------------------------------------------------------------- effects

  private addTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1b5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const line = new THREE.Line(geo, mat)
    this.scene.add(line)
    this.tracers.push({ line, age: 0, ttl: 0.07 })
  }

  private spawnDeathPop(pos: THREE.Vector3, color: number, scale: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 * scale, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    mesh.position.copy(pos)
    mesh.position.y = 1.0 * scale
    this.scene.add(mesh)
    this.pops.push({ mesh, age: 0, ttl: 0.35 })
  }

  private updateEffects(delta: number) {
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - delta * 160)
      if (this.muzzleTimer <= 0) {
        this.muzzleFlash.visible = false
        this.muzzleLight.intensity = 0
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.age += delta
      const k = 1 - t.age / t.ttl
      ;(t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, k * 0.9)
      if (t.age >= t.ttl) {
        this.scene.remove(t.line)
        t.line.geometry.dispose()
        ;(t.line.material as THREE.Material).dispose()
        this.tracers.splice(i, 1)
      }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]
      p.age += delta
      const k = p.age / p.ttl
      p.mesh.scale.setScalar(0.4 + k * 3.0)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k))
      if (p.age >= p.ttl) {
        this.scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        ;(p.mesh.material as THREE.Material).dispose()
        this.pops.splice(i, 1)
      }
    }
  }

  private updateWeapon(delta: number) {
    if (this.meleeAnim > 0) {
      // quick knife swipe (takes priority over reload/idle pose)
      const t = 1 - this.meleeAnim / 0.22
      const slash = Math.sin(Math.min(1, t) * Math.PI)
      this.weapon.position.set(WEAPON_VIEW_X - slash * 0.12, WEAPON_VIEW_Y + slash * 0.06, WEAPON_VIEW_Z - slash * 0.18)
      this.weapon.rotation.set(-slash * 0.5, slash * 0.7, -slash * 0.9)
      this.weaponSpriteMat.opacity = 1
      return
    }
    if (this.reloading) {
      const p = 1 - this.reloadTimer / RELOAD_TIME
      const dip = Math.sin(Math.min(1, p) * Math.PI)
      this.weapon.position.set(WEAPON_VIEW_X + dip * 0.03, WEAPON_VIEW_Y - dip * 0.22, WEAPON_VIEW_Z + dip * 0.08)
      this.weapon.rotation.set(-dip * 0.45, dip * 0.24, dip * 0.2)
      const magOut = p < 0.5 ? p * 2 : (1 - p) * 2
      this.magazine.position.y = this.magBaseY - magOut * 0.28
      this.weaponSpriteMat.opacity = 0.72 + (1 - dip) * 0.28
      this.weaponRecoil = 0
      return
    }

    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * 0.5)
    this.magazine.position.y = this.magBaseY
    this.weaponSpriteMat.opacity = 1

    const moving = (this.move.forward || this.move.back || this.move.left || this.move.right) && this.canJump
    if (moving) this.bobTime += delta * 9
    const bobX = moving ? Math.cos(this.bobTime) * 0.008 : 0
    const bobY = moving ? Math.abs(Math.sin(this.bobTime)) * 0.01 : 0
    this.weapon.position.set(WEAPON_VIEW_X + bobX, WEAPON_VIEW_Y + bobY, WEAPON_VIEW_Z + this.weaponRecoil * 0.65)
    this.weapon.rotation.set(-this.weaponRecoil * 1.45, 0, this.weaponRecoil * 0.25)
  }

  // ----------------------------------------------------------------- control

  private resetPlayer() {
    this.health = PLAYER_MAX_HEALTH
    this.score = 0
    this.kills = 0
    this.headshots = 0
    this.time = 0
    this.outcome = null
    this.damageBoostTimer = 0
    this.firing = false
    this.triggerQueued = false
    this.velocity.set(0, 0, 0)
    this.canJump = false
    this.move.forward = this.move.back = this.move.left = this.move.right = false

    // reset arsenal
    this.unlocked = new Set<WeaponId>([STARTING_WEAPON])
    for (const id of WEAPON_ORDER) {
      this.weaponMag[id] = WEAPONS[id].magazineSize
      this.weaponReserve[id] = WEAPONS[id].reserve
    }
    this.activeWeapon = STARTING_WEAPON
    this.ammo = this.weaponMag[STARTING_WEAPON]
    this.reserve = this.weaponReserve[STARTING_WEAPON]
    this.reloading = false
    this.reloadTimer = 0
    this.fireCooldown = 0

    this.placeAtSpawn()

    if (this.weapon) {
      this.weapon.position.set(WEAPON_VIEW_X, WEAPON_VIEW_Y, WEAPON_VIEW_Z)
      this.weapon.rotation.set(0, 0, 0)
      this.weaponSpriteMat.opacity = 1
      this.magazine.position.y = this.magBaseY
      this.applyWeaponModel(this.activeWeapon)
    }
  }

  private clearTransientFx() {
    for (const t of this.tracers) {
      this.scene.remove(t.line)
      t.line.geometry.dispose()
      ;(t.line.material as THREE.Material).dispose()
    }
    this.tracers = []
    for (const p of this.pops) {
      this.scene.remove(p.mesh)
      p.mesh.geometry.dispose()
      ;(p.mesh.material as THREE.Material).dispose()
    }
    this.pops = []
    this.clearProjectiles()
    while (this.pickups.length) this.removePickup(this.pickups.length - 1)
  }

  /** "Play Again" — replays the current mode (campaign restarts from stage 1). */
  restart() {
    // PvP has no local "restart" — the server owns match state. A Restart click
    // from a multiplayer pause must not reset stats / rebuild the arena under the
    // live net session (that strands the player in a broken half-campaign state);
    // treat it as a resume instead.
    if (this.multiplayer) {
      this.requestLock()
      return
    }
    this.clearTransientFx()
    if (this.survivors) {
      this.resetPlayer()
      this.initSurvivorsRun()
    } else {
      this.campaignStage = 0
      if (!this.campaignMaps.length) this.campaignMaps = campaignSequence(CAMPAIGN_ORDER[0])
      this.buildArena(this.campaignMaps[0])
      this.resetPlayer()
      this.startWaveSystem()
    }
    this.status = 'pointerlock-needed'
    this.emit()
    this.requestLock()
  }

  /** Return to the main menu (drops any mode, no auto-lock). */
  returnToMenu() {
    this.leaveMultiplayer(false)
    this.survivors = false
    this.campaignStage = 0
    this.recomputeStats()
    this.buildArena(getMap(DEFAULT_MAP_ID))
    this.resetPlayer()
    this.clearTransientFx()
    this.clearSurvivorsEntities()
    this.startWaveSystem()
    this.status = 'pointerlock-needed'
    this.emit()
  }

  private gameOver(outcome: 'win' | 'dead') {
    if (this.status === 'gameover') return
    this.status = 'gameover'
    this.outcome = outcome
    this.firing = false
    this.move.forward = this.move.back = this.move.left = this.move.right = false
    this.announce(outcome === 'win' ? 'VICTORY' : 'DEFEAT')
    if (this.controls.isLocked) this.controls.unlock()
    this.emit()
  }

  private announce(text: string) {
    this.banner = text
    this.bannerSeq++
    if (text === 'VICTORY') audio.sfx('victory')
    else if (text === 'DEFEAT') audio.sfx('defeat')
    else if (text.includes('BOSS')) audio.sfx('boss')
    else if (text.startsWith('WAVE') && !text.includes('CLEARED')) audio.sfx('wave')
    this.emit()
  }

  private showToast(text: string) {
    this.toast = text
    this.toastSeq++
    this.emit()
  }

  private static readonly DAMAGE_NUMBER_TTL = 0.9
  /** Spawn a floating damage number at a world position (projected to screen). */
  private addDamageNumber(world: THREE.Vector3, amount: number, kind: 'normal' | 'head' | 'crit') {
    const v = world.clone().project(this.camera)
    if (v.z > 1) return // behind the camera — don't show
    const x = (v.x * 0.5 + 0.5) * 100
    const y = (-v.y * 0.5 + 0.5) * 100
    this.damageNumbers.push({ id: ++this.damageNumberId, x, y, amount: Math.max(1, Math.round(amount)), kind, t: this.time })
    if (this.damageNumbers.length > 40) this.damageNumbers.shift()
  }

  // -------------------------------------------------------------------- state

  private get aliveCount(): number {
    let n = 0
    for (const e of this.enemies) if (e.alive) n++
    return n
  }

  private emit() {
    if (this.disposed) return
    // Drop floating damage numbers once their CSS animation has finished.
    if (this.damageNumbers.length) {
      this.damageNumbers = this.damageNumbers.filter((d) => this.time - d.t < Game.DAMAGE_NUMBER_TTL)
    }
    const spec = WEAPONS[this.activeWeapon]
    const weapons = WEAPON_ORDER.filter((id) => this.unlocked.has(id)).map((id) => ({
      id,
      name: WEAPONS[id].name,
      key: WEAPON_ORDER.indexOf(id) + 1,
      active: id === this.activeWeapon,
    }))
    const state: HUDState = {
      status: this.status,
      playerHealth: Math.round(this.health),
      maxPlayerHealth: this.maxHealthValue,
      ammo: this.ammo,
      magazineSize: spec.magazineSize,
      reserve: this.reserve,
      reloading: this.reloading,
      reloadProgress: this.reloading ? Math.min(1, 1 - this.reloadTimer / RELOAD_TIME) : 0,
      score: this.score,
      kills: this.kills,
      headshots: this.headshots,
      enemiesAlive: this.aliveCount,
      time: Math.floor(this.time),
      wave: Math.min(this.waveIndex + 1, TOTAL_WAVES),
      totalWaves: TOTAL_WAVES,
      campaignStage: this.campaignStage + 1,
      campaignTotalStages: this.campaignMaps.length,
      mapName: this.currentMap.name,
      bossActive: this.bossActive,
      bossHealthFrac: this.bossActive && this.bossEnemy && this.bossEnemy.alive ? this.bossEnemy.health / this.bossMaxHealth : 0,
      outcome: this.outcome,
      weapon: spec.name,
      weapons,
      damageBoost: Math.ceil(this.damageBoostTimer),
      bossShielded: !!(this.bossEnemy && this.bossEnemy.alive && this.bossEnemy.shielded),
      bossEnraged: !!(this.bossEnemy && this.bossEnemy.alive && this.bossEnemy.enraged),
      hitMarkerSeq: this.hitMarkerSeq,
      headshotSeq: this.headshotSeq,
      killSeq: this.killSeq,
      damageSeq: this.damageSeq,
      banner: this.banner,
      bannerSeq: this.bannerSeq,
      toast: this.toast,
      toastSeq: this.toastSeq,
      damageNumbers: this.damageNumbers.map(({ t, ...d }) => d),
      multiplayer: this.multiplayer,
      connected: this.connected,
      room: this.roomName,
      scoreboard: this.multiplayer ? this.buildScoreboard() : [],
      survivors: this.survivors,
      level: this.level,
      xp: Math.floor(this.xp),
      xpToNext: this.xpToNext,
      build: this.survivors ? this.buildList() : [],
      choices: this.status === 'levelup' ? this.choices : [],
    }
    this.listener(state)
  }

  private buildScoreboard() {
    const board = [
      { id: 'self', name: this.playerName, kills: this.kills, health: Math.round(this.health), you: true },
      ...[...this.remotePlayers.values()].map((r) => ({
        id: r.id,
        name: r.name,
        kills: r.kills,
        health: Math.round(r.health),
        you: false,
      })),
    ]
    board.sort((a, b) => b.kills - a.kills)
    return board
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)

    this.leaveMultiplayer(false)

    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('resize', this.onResize)
    this.controls.removeEventListener('lock', this.onLock)
    this.controls.removeEventListener('unlock', this.onUnlock)

    if (this.controls.isLocked) this.controls.unlock()
    this.controls.dispose()

    for (const enemy of this.enemies) enemy.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })

    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
