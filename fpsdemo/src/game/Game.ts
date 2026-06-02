import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { audio } from '../audio/AudioEngine'
import { Enemy, type EnemyShot } from './Enemy'
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
import { WEAPON_SPRITE_TEXTURES } from './spriteAssets'
import type { GameStatus, HUDState, StateListener } from './types'

const ENEMY_COLORS = [0xff5a3c, 0xffb02e, 0xff3b6b, 0x9b5cff, 0x2ee6a6, 0x4d9bff]
const RANGED_COLOR = 0x35e0ff

const WEAPON_SPRITE_CONFIG: Record<WeaponId, {
  scale: [number, number]
  offset: [number, number, number]
  muzzle: [number, number, number]
}> = {
  rifle: {
    scale: [0.67, 0.78],
    offset: [0.02, -0.03, 0],
    muzzle: [-0.08, 0.18, -0.34],
  },
  smg: {
    scale: [0.56, 0.84],
    offset: [0.02, -0.06, 0],
    muzzle: [-0.08, 0.16, -0.3],
  },
  shotgun: {
    scale: [0.76, 0.8],
    offset: [0.03, -0.05, 0],
    muzzle: [-0.06, 0.15, -0.36],
  },
  cannon: {
    scale: [0.88, 0.82],
    offset: [0.04, -0.05, 0],
    muzzle: [-0.08, 0.16, -0.4],
  },
}

const PICKUP_COLORS: Record<PickupKind, number> = {
  health: 0x39d353,
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
  mesh: THREE.Mesh
  vel: THREE.Vector3
  damage: number
  age: number
  fromBoss: boolean
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

  // HUD sync
  private emitAccumulator = 0
  private hitMarkerSeq = 0
  private headshotSeq = 0
  private killSeq = 0
  private damageSeq = 0
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
    this.buildArena()
    this.buildWeapon()
    this.bindEvents()

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

    const accentA = new THREE.PointLight(0x00d8ff, 60, 90, 2)
    accentA.position.set(-28, 8, -28)
    this.scene.add(accentA)
    const accentB = new THREE.PointLight(0xff4d6d, 60, 90, 2)
    accentB.position.set(28, 8, 28)
    this.scene.add(accentB)
  }

  private buildArena() {
    const floorTex = this.makeGridTexture()
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(ARENA_HALF / 2, ARENA_HALF / 2)
    floorTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x8a93a6, roughness: 0.95, metalness: 0.05 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3142, roughness: 0.7, metalness: 0.2 })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x00d8ff, emissive: 0x00aacc, emissiveIntensity: 1.4 })
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

      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), trimMat)
      trim.position.set(x, WALL_HEIGHT + 0.05, z)
      this.scene.add(trim)
    }

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7c6a45, roughness: 0.85, metalness: 0.1 })
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a4254, roughness: 0.6, metalness: 0.35 })

    const addBox = (x: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, h / 2, z)
      m.castShadow = true
      m.receiveShadow = true
      m.userData = { solid: true }
      this.scene.add(m)
      this.solidMeshes.push(m)
      this.obstacleBoxes.push(new THREE.Box3().setFromObject(m))
    }

    const crates: Array<[number, number]> = [
      [-12, -8], [12, -8], [-12, 8], [12, 8], [0, -18], [0, 18],
    ]
    for (const [x, z] of crates) addBox(x, z, 2.4, 2.4, 2.4, crateMat)

    const stack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), crateMat)
    stack.position.set(-12, 2.4 + 1.1, -8)
    stack.castShadow = true
    stack.receiveShadow = true
    stack.userData = { solid: true }
    this.scene.add(stack)
    this.solidMeshes.push(stack)

    const pillars: Array<[number, number]> = [[-24, 0], [24, 0], [0, 0]]
    for (const [x, z] of pillars) addBox(x, z, 2.0, WALL_HEIGHT, 2.0, pillarMat)

    this.raycastTargets.push(...this.solidMeshes)
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

    this.weapon.position.set(0.32, -0.28, -0.6)
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

  private spawnWaveEnemy() {
    const wave = WAVES[this.waveIndex]
    const enemy = this.getFreeEnemy()
    const pt = this.randomSpawnPoint()
    const ranged = Math.random() < ENEMY_RANGED_CHANCE
    const color = ranged ? RANGED_COLOR : ENEMY_COLORS[(this.spawnedThisWave + this.waveIndex) % ENEMY_COLORS.length]
    enemy.spawnAt(pt.x, pt.z, {
      maxHealth: ENEMY_MAX_HEALTH * wave.healthMul,
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
    enemy.spawnAt(pt.x, pt.z, {
      maxHealth: BOSS_HEALTH,
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
    this.bossMaxHealth = BOSS_HEALTH
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
    this.killSeq++
    if (wasBoss) {
      this.score += BOSS_SCORE
      this.reserve = Math.min(spec.reserveCap, this.reserve + BOSS_RESERVE_BONUS)
      this.spawnDeathPop(enemy.position.clone(), 0xff2d55, 2.4)
      this.bossActive = false
      this.bossEnemy = null
      this.gameOver('win')
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

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.3 }),
    )
    gem.position.y = 0.9
    gem.castShadow = true

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

    group.add(gem, ring, beam)
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
      const gem = p.group.children[0]
      gem.rotation.y += delta * 2.2
      gem.position.y = 0.9 + Math.sin(p.age * 3) * 0.12

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
    window.addEventListener('resize', this.onResize)
    this.controls.addEventListener('lock', this.onLock)
    this.controls.addEventListener('unlock', this.onUnlock)
  }

  private onKeyDown = (e: KeyboardEvent) => {
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
    if (e.button !== 0) return
    if (!this.controls.isLocked || this.status !== 'playing') return
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
    try {
      const res: unknown = this.renderer.domElement.requestPointerLock()
      if (res && typeof (res as Promise<void>).catch === 'function') (res as Promise<void>).catch(() => {})
    } catch {
      /* pointer lock can legitimately fail; the HUD overlay simply stays up */
    }
  }

  // -------------------------------------------------------------------- loop

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)

    const delta = Math.min(this.clock.getDelta(), 0.1)
    const elapsed = this.clock.elapsedTime

    if (this.status === 'playing') this.update(delta, elapsed)
    else this.updateEffects(delta)

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

    this.updateEnemies(delta, elapsed)
    this.updateProjectiles(delta)
    this.updateWaves(delta)
  }

  private updatePlayerMovement(delta: number) {
    this.velocity.x -= this.velocity.x * MOVE_DAMPING * delta
    this.velocity.z -= this.velocity.z * MOVE_DAMPING * delta
    this.velocity.y -= GRAVITY * delta

    this._dir.z = Number(this.move.forward) - Number(this.move.back)
    this._dir.x = Number(this.move.right) - Number(this.move.left)
    this._dir.normalize()

    if (this.move.forward || this.move.back) this.velocity.z -= this._dir.z * MOVE_ACCEL * delta
    if (this.move.left || this.move.right) this.velocity.x -= this._dir.x * MOVE_ACCEL * delta

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

  private shoot() {
    const spec = WEAPONS[this.activeWeapon]
    this.ammo--
    this.fireCooldown = spec.fireInterval
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

    const dmgMult = this.damageBoostTimer > 0 ? DAMAGE_BOOST_MULT : 1
    const muzzleWorld = this.muzzleFlash.getWorldPosition(new THREE.Vector3())

    for (let p = 0; p < spec.pellets; p++) {
      const dir = this._fwd.clone()
      if (spec.spread > 0) {
        dir.addScaledVector(this._right, (Math.random() * 2 - 1) * spec.spread)
        dir.addScaledVector(this._up, (Math.random() * 2 - 1) * spec.spread)
        dir.normalize()
      }
      this.raycaster.set(this._origin, dir)
      this.raycaster.far = 500
      const hits = this.raycaster.intersectObjects(this.raycastTargets, false)

      let endPoint: THREE.Vector3 | null = null
      for (const h of hits) {
        const ud = h.object.userData as { enemy?: Enemy; part?: string; solid?: boolean }
        if (ud.enemy) {
          if (!ud.enemy.alive) continue
          const headshot = ud.part === 'head'
          const dmg = spec.damage * dmgMult * (headshot ? HEADSHOT_MULTIPLIER : 1)
          const res = ud.enemy.takeDamage(dmg, headshot)
          endPoint = h.point.clone()
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
      for (const shot of tick.shots) this.spawnProjectile(shot)
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

  private spawnProjectile(shot: EnemyShot) {
    const color = shot.fromBoss ? 0xff2d6a : 0xff8a3c
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(shot.fromBoss ? 0.3 : 0.2, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    mesh.position.copy(shot.origin)
    this.scene.add(mesh)
    this.projectiles.push({
      mesh,
      vel: shot.dir.clone().multiplyScalar(shot.speed),
      damage: shot.damage,
      age: 0,
      fromBoss: shot.fromBoss,
    })
  }

  private updateProjectiles(delta: number) {
    const player = this.camera.position
    const bound = ARENA_HALF - WALL_THICKNESS / 2
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]
      pr.age += delta
      pr.mesh.position.addScaledVector(pr.vel, delta)
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
    pr.mesh.geometry.dispose()
    ;(pr.mesh.material as THREE.Material).dispose()
    this.projectiles.splice(i, 1)
  }

  private clearProjectiles() {
    for (const pr of this.projectiles) {
      this.scene.remove(pr.mesh)
      pr.mesh.geometry.dispose()
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
    if (this.reloading) {
      const p = 1 - this.reloadTimer / RELOAD_TIME
      const dip = Math.sin(Math.min(1, p) * Math.PI)
      this.weapon.position.set(0.32, -0.28 - dip * 0.16, -0.6 + dip * 0.08)
      this.weapon.rotation.set(-dip * 0.55, dip * 0.4, dip * 0.32)
      const magOut = p < 0.5 ? p * 2 : (1 - p) * 2
      this.magazine.position.y = this.magBaseY - magOut * 0.28
      this.weaponRecoil = 0
      return
    }

    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * 0.5)
    this.magazine.position.y = this.magBaseY

    const moving = (this.move.forward || this.move.back || this.move.left || this.move.right) && this.canJump
    if (moving) this.bobTime += delta * 9
    const bobX = moving ? Math.cos(this.bobTime) * 0.006 : 0
    const bobY = moving ? Math.abs(Math.sin(this.bobTime)) * 0.008 : 0
    this.weapon.position.set(0.32 + bobX, -0.28 + bobY, -0.6 + this.weaponRecoil)
    this.weapon.rotation.set(-this.weaponRecoil * 2.2, 0, 0)
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

    this.camera.position.set(0, PLAYER_HEIGHT, 6)
    this.camera.rotation.set(0, 0, 0)
    this.camera.lookAt(0, PLAYER_HEIGHT, -10)

    if (this.weapon) {
      this.weapon.position.set(0.32, -0.28, -0.6)
      this.weapon.rotation.set(0, 0, 0)
      this.magazine.position.y = this.magBaseY
      this.applyWeaponModel(this.activeWeapon)
    }
  }

  restart() {
    this.resetPlayer()

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

    this.startWaveSystem()

    this.status = 'pointerlock-needed'
    this.emit()
    this.requestLock()
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

  // -------------------------------------------------------------------- state

  private get aliveCount(): number {
    let n = 0
    for (const e of this.enemies) if (e.alive) n++
    return n
  }

  private emit() {
    if (this.disposed) return
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
      maxPlayerHealth: PLAYER_MAX_HEALTH,
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
    }
    this.listener(state)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)

    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
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
