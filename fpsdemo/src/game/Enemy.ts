import * as THREE from 'three'
import {
  ARENA_HALF,
  BOSS_BARRAGE_COUNT,
  BOSS_BARRAGE_SPREAD,
  BOSS_ENRAGE_HEALTH_FRAC,
  BOSS_ENRAGE_SPEED_MULT,
  BOSS_SHIELD_DURATION,
  BOSS_SKILL_INTERVAL,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_ATTACK_INTERVAL,
  ENEMY_ATTACK_RANGE,
  ENEMY_FIRE_INTERVAL,
  ENEMY_FIRE_RANGE,
  ENEMY_MAX_HEALTH,
  ENEMY_PREFERRED_RANGE,
  ENEMY_PROJECTILE_DAMAGE,
  ENEMY_PROJECTILE_SPEED,
  ENEMY_RADIUS,
  ENEMY_SEPARATION,
  ENEMY_SPEED_MIN,
  ENEMY_SPEED_MAX,
} from './constants'
import { ENEMY_SPRITE_TEXTURES } from './spriteAssets'

const HEALTHBAR_WIDTH = 1.3
type EnemySpriteKind = 'melee' | 'ranged' | 'boss'
type EnemySpriteView = 'front' | 'side' | 'back'

export interface DamageResult {
  died: boolean
  headshot: boolean
  blocked: boolean
}

/** A single shot the enemy wants to fire this frame. */
export interface EnemyShot {
  origin: THREE.Vector3
  dir: THREE.Vector3
  damage: number
  speed: number
  fromBoss: boolean
}

export interface EnemyTick {
  melee: number
  shots: EnemyShot[]
}

export interface SpawnConfig {
  maxHealth?: number
  speed?: number
  scale?: number
  color?: number
  isBoss?: boolean
  ranged?: boolean
  attackDamage?: number
  attackInterval?: number
  attackRange?: number
  projectileDamage?: number
  projectileSpeed?: number
  preferredRange?: number
}

/**
 * A single enemy "bot". Melee bots close in and swipe; ranged bots keep their
 * distance and fire projectiles. The boss does both and runs an ability cycle
 * (shield / enrage / projectile barrage). The {@link Game} owns the pool, spawns
 * per wave, resolves obstacle collision and turns {@link EnemyShot}s into live
 * projectiles.
 */
export class Enemy {
  readonly group = new THREE.Group()
  readonly hitMeshes: THREE.Mesh[] = []

  maxHealth = ENEMY_MAX_HEALTH
  health = ENEMY_MAX_HEALTH
  alive = false
  speed = ENEMY_SPEED_MIN
  isBoss = false
  ranged = false
  radius = ENEMY_RADIUS

  // boss ability state
  shielded = false
  enraged = false

  private attackDamage = ENEMY_ATTACK_DAMAGE
  private attackInterval = ENEMY_ATTACK_INTERVAL
  private attackRange = ENEMY_ATTACK_RANGE
  private projectileDamage = ENEMY_PROJECTILE_DAMAGE
  private projectileSpeed = ENEMY_PROJECTILE_SPEED
  private preferredRange = ENEMY_PREFERRED_RANGE
  private fireInterval = ENEMY_FIRE_INTERVAL

  private baseSpeed = ENEMY_SPEED_MIN
  private baseAttackInterval = ENEMY_ATTACK_INTERVAL
  private shieldTimer = 0
  private skillTimer = BOSS_SKILL_INTERVAL
  private skillToggle = 0

  private attackTimer = 0
  private fireTimer = 0
  private bobPhase = 0
  private strafeSign = 1

  private bodyMat: THREE.MeshStandardMaterial
  private eyeMat: THREE.MeshStandardMaterial
  private healthFill: THREE.Mesh
  private healthBarGroup = new THREE.Group()
  private shieldMesh: THREE.Mesh
  private spriteMat: THREE.SpriteMaterial
  private sprite: THREE.Sprite
  private spriteView: EnemySpriteView = 'front'
  private spriteFlip = 1
  private muzzle = new THREE.Vector3()

  constructor() {
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff5a3c, emissive: 0x000000, roughness: 0.55, metalness: 0.25,
    })

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.55), this.bodyMat)
    legs.position.y = 0.35
    legs.castShadow = true
    legs.userData = { enemy: this, part: 'body' }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.6), this.bodyMat)
    torso.position.y = 1.08
    torso.castShadow = true
    torso.userData = { enemy: this, part: 'body' }

    const headMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.4, metalness: 0.5 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMat)
    head.position.y = 1.78
    head.castShadow = true
    head.userData = { enemy: this, part: 'head' }

    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3b30, emissiveIntensity: 2.2 })
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.06)
    const eyeL = new THREE.Mesh(eyeGeo, this.eyeMat)
    eyeL.position.set(-0.13, 1.82, 0.3)
    const eyeR = new THREE.Mesh(eyeGeo, this.eyeMat)
    eyeR.position.set(0.13, 1.82, 0.3)

    for (const part of [legs, torso, head, eyeL, eyeR]) part.visible = false
    this.group.add(legs, torso, head, eyeL, eyeR)
    this.hitMeshes.push(legs, torso, head)

    this.spriteMat = new THREE.SpriteMaterial({
      map: ENEMY_SPRITE_TEXTURES.melee.front,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.06,
      depthWrite: true,
      toneMapped: false,
    })
    this.sprite = new THREE.Sprite(this.spriteMat)
    this.sprite.center.set(0.5, 0)
    this.sprite.position.y = 0
    this.group.add(this.sprite)

    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(HEALTHBAR_WIDTH + 0.08, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
    )
    this.healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(HEALTHBAR_WIDTH, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x39d353 }),
    )
    this.healthFill.position.z = 0.001
    this.healthBarGroup.add(barBg, this.healthFill)
    this.healthBarGroup.position.y = 2.45
    this.group.add(this.healthBarGroup)

    // Boss shield bubble (hidden unless the boss raises it).
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0x39c7ff, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.shieldMesh.position.y = 1.2
    this.shieldMesh.visible = false
    this.group.add(this.shieldMesh)

    this.group.visible = false
    this.group.position.y = -100
  }

  spawnAt(x: number, z: number, cfg: SpawnConfig = {}) {
    this.maxHealth = cfg.maxHealth ?? ENEMY_MAX_HEALTH
    this.health = this.maxHealth
    this.alive = true
    this.isBoss = cfg.isBoss ?? false
    this.ranged = cfg.ranged ?? false
    this.baseSpeed = cfg.speed ?? ENEMY_SPEED_MIN + Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN)
    this.speed = this.baseSpeed
    this.baseAttackInterval = cfg.attackInterval ?? ENEMY_ATTACK_INTERVAL
    this.attackInterval = this.baseAttackInterval
    this.attackDamage = cfg.attackDamage ?? ENEMY_ATTACK_DAMAGE
    this.attackRange = cfg.attackRange ?? ENEMY_ATTACK_RANGE
    this.projectileDamage = cfg.projectileDamage ?? ENEMY_PROJECTILE_DAMAGE
    this.projectileSpeed = cfg.projectileSpeed ?? ENEMY_PROJECTILE_SPEED
    this.preferredRange = cfg.preferredRange ?? ENEMY_PREFERRED_RANGE
    this.fireInterval = ENEMY_FIRE_INTERVAL

    this.attackTimer = this.attackInterval
    this.fireTimer = this.fireInterval * (0.5 + Math.random())
    this.bobPhase = Math.random() * Math.PI * 2
    this.strafeSign = Math.random() < 0.5 ? -1 : 1

    this.shielded = false
    this.enraged = false
    this.shieldTimer = 0
    this.skillTimer = BOSS_SKILL_INTERVAL
    this.skillToggle = 0
    this.shieldMesh.visible = false

    const scale = cfg.scale ?? 1
    this.group.scale.setScalar(scale)
    this.radius = ENEMY_RADIUS * (this.isBoss ? scale * 0.8 : 1)

    this.applyStyle(cfg.color ?? 0xff5a3c)
    this.applySprite()
    this.group.position.set(x, 0, z)
    this.group.visible = true
    this.updateHealthBar()
  }

  private spriteKind(): EnemySpriteKind {
    if (this.isBoss) return 'boss'
    return this.ranged ? 'ranged' : 'melee'
  }

  private spriteScale(kind: EnemySpriteKind, view: EnemySpriteView): [number, number] {
    if (kind === 'boss') {
      if (view === 'side') return [1.85, 2.55]
      if (view === 'back') return [2.05, 2.55]
      return [2.15, 2.55]
    }
    if (kind === 'ranged') {
      if (view === 'side') return [1.18, 2.2]
      if (view === 'back') return [1.28, 2.2]
      return [1.38, 2.2]
    }
    if (view === 'side') return [1.48, 2.18]
    if (view === 'back') return [1.58, 2.18]
    return [1.65, 2.18]
  }

  private applySprite(view: EnemySpriteView = 'front', flip = 1, elapsed = 0, moving = false) {
    const kind = this.spriteKind()
    const texture = ENEMY_SPRITE_TEXTURES[kind][view]

    if (this.spriteMat.map !== texture) {
      this.spriteMat.map = texture
      this.spriteMat.needsUpdate = true
    }
    this.spriteView = view
    this.spriteFlip = flip

    const [baseW, baseH] = this.spriteScale(kind, view)
    const step = moving ? Math.sin(elapsed * (this.speed * 2.8) + this.bobPhase) : 0
    const squash = Math.abs(step)
    this.spriteMat.color.setHex(0xffffff)
    this.spriteMat.rotation = moving ? step * 0.035 * flip : 0
    this.sprite.scale.set(baseW * (1 + squash * 0.025) * flip, baseH * (1 - squash * 0.035), 1)
    this.sprite.position.y = moving ? squash * 0.035 : 0
  }

  private chooseSpriteFrame(moveX: number, moveZ: number, dirX: number, dirZ: number): { view: EnemySpriteView; flip: number } {
    const moveLen = Math.hypot(moveX, moveZ)
    if (moveLen < 0.05) return { view: this.spriteView, flip: this.spriteFlip }

    const mx = moveX / moveLen
    const mz = moveZ / moveLen
    const dot = mx * dirX + mz * dirZ
    if (dot > 0.5) return { view: 'front', flip: 1 }
    if (dot < -0.45) return { view: 'back', flip: 1 }

    const cross = dirX * mz - dirZ * mx
    return { view: 'side', flip: cross >= 0 ? 1 : -1 }
  }

  private applyStyle(color: number) {
    if (this.isBoss) {
      this.bodyMat.color.setHex(color)
      this.bodyMat.emissive.setHex(color)
      this.bodyMat.emissiveIntensity = 0.9
      this.bodyMat.metalness = 0.1
      this.bodyMat.roughness = 0.45
      this.eyeMat.emissive.setHex(0xffe000)
      this.eyeMat.emissiveIntensity = 4
      ;(this.healthFill.material as THREE.MeshBasicMaterial).color.setHex(0xff2d55)
    } else {
      const c = new THREE.Color(color)
      this.bodyMat.color.setHex(color)
      this.bodyMat.emissive.copy(c).multiplyScalar(this.ranged ? 0.45 : 0.22)
      this.bodyMat.emissiveIntensity = 1
      this.bodyMat.metalness = 0.25
      this.bodyMat.roughness = 0.55
      this.eyeMat.emissive.setHex(this.ranged ? 0x35e0ff : 0xff3b30)
      this.eyeMat.emissiveIntensity = this.ranged ? 3 : 2.2
    }
  }

  /** Advance one frame. Obstacle collision is resolved by the Game afterwards. */
  update(
    delta: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    peers: Enemy[],
    cameraQuat: THREE.Quaternion,
  ): EnemyTick {
    const tick: EnemyTick = { melee: 0, shots: [] }
    if (!this.alive) return tick

    const pos = this.group.position
    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const dist = Math.hypot(dx, dz)
    const dirX = dist > 0.0001 ? dx / dist : 0
    const dirZ = dist > 0.0001 ? dz / dist : 0

    // separation
    let sepX = 0
    let sepZ = 0
    for (const other of peers) {
      if (other === this || !other.alive) continue
      const ox = pos.x - other.group.position.x
      const oz = pos.z - other.group.position.z
      const od = Math.hypot(ox, oz)
      const minGap = ENEMY_SEPARATION + (this.isBoss || other.isBoss ? 1.2 : 0)
      if (od > 0.0001 && od < minGap) {
        const push = (minGap - od) / minGap
        sepX += (ox / od) * push
        sepZ += (oz / od) * push
      }
    }

    // movement intent
    let moveX = sepX * this.speed * 0.6
    let moveZ = sepZ * this.speed * 0.6
    let retreating = false
    if (this.ranged && !this.isBoss) {
      // kite: hold preferred range, strafe around the player
      if (dist > this.preferredRange + 1.5) {
        moveX += dirX * this.speed
        moveZ += dirZ * this.speed
      } else if (dist < this.preferredRange - 2) {
        moveX -= dirX * this.speed * 0.8
        moveZ -= dirZ * this.speed * 0.8
        retreating = true
      } else {
        // strafe perpendicular to the player direction
        moveX += -dirZ * this.strafeSign * this.speed * 0.7
        moveZ += dirX * this.strafeSign * this.speed * 0.7
      }
    } else {
      const closing = dist > this.attackRange * 0.85 ? 1 : 0
      moveX += dirX * this.speed * closing
      moveZ += dirZ * this.speed * closing
    }
    pos.x += moveX * delta
    pos.z += moveZ * delta

    const limit = ARENA_HALF - 1.5
    pos.x = Math.max(-limit, Math.min(limit, pos.x))
    pos.z = Math.max(-limit, Math.min(limit, pos.z))

    this.group.rotation.y = Math.atan2(dirX, dirZ)
    pos.y = Math.abs(Math.sin(elapsed * (this.speed * 1.6) + this.bobPhase)) * 0.07
    const frame = this.chooseSpriteFrame(moveX, moveZ, dirX, dirZ)
    this.applySprite(frame.view, frame.flip, elapsed, Math.hypot(moveX, moveZ) > 0.05)
    this.healthBarGroup.quaternion.copy(cameraQuat)

    // ---- boss abilities
    if (this.isBoss) this.updateBoss(delta, elapsed, dirX, dirZ, dist, playerPos, tick)

    // ---- melee
    if (dist <= this.attackRange) {
      this.attackTimer -= delta
      if (this.attackTimer <= 0) {
        tick.melee += this.attackDamage
        this.attackTimer = this.attackInterval
        this.eyeMat.emissiveIntensity = this.isBoss ? 7 : 4.5
      }
    }
    const restEye = this.isBoss ? 4 : this.ranged ? 3 : 2.2
    if (this.eyeMat.emissiveIntensity > restEye) {
      this.eyeMat.emissiveIntensity = Math.max(restEye, this.eyeMat.emissiveIntensity - delta * 12)
    }

    // ---- ranged fire (mobs and boss). Mobs hold fire while backing away.
    if ((this.isBoss || (this.ranged && !retreating)) && dist <= ENEMY_FIRE_RANGE) {
      this.fireTimer -= delta
      if (this.fireTimer <= 0) {
        tick.shots.push(this.makeShot(playerPos, 0))
        this.fireTimer = this.fireInterval * (this.enraged ? 0.6 : 1)
      }
    }

    return tick
  }

  private updateBoss(
    delta: number,
    elapsed: number,
    dirX: number,
    dirZ: number,
    dist: number,
    playerPos: THREE.Vector3,
    tick: EnemyTick,
  ) {
    // Enrage once below the health threshold.
    if (!this.enraged && this.health / this.maxHealth < BOSS_ENRAGE_HEALTH_FRAC) {
      this.enraged = true
      this.speed = this.baseSpeed * BOSS_ENRAGE_SPEED_MULT
      this.attackInterval = this.baseAttackInterval * 0.6
    }

    // Shield lifetime + pulse.
    if (this.shielded) {
      this.shieldTimer -= delta
      const m = this.shieldMesh.material as THREE.MeshBasicMaterial
      m.opacity = 0.22 + Math.sin(elapsed * 10) * 0.1
      if (this.shieldTimer <= 0) {
        this.shielded = false
        this.shieldMesh.visible = false
      }
    }

    // Ability cycle.
    this.skillTimer -= delta
    if (this.skillTimer <= 0) {
      if (this.skillToggle % 2 === 0) {
        // raise shield
        this.shielded = true
        this.shieldTimer = BOSS_SHIELD_DURATION
        this.shieldMesh.visible = true
      } else {
        // projectile barrage fanned around the player direction
        const base = Math.atan2(dirX, dirZ)
        const denom = Math.max(1, BOSS_BARRAGE_COUNT - 1)
        for (let i = 0; i < BOSS_BARRAGE_COUNT; i++) {
          const t = i / denom - 0.5
          const ang = base + t * BOSS_BARRAGE_SPREAD
          tick.shots.push(this.makeShotAngle(playerPos, ang))
        }
      }
      this.skillToggle++
      this.skillTimer = BOSS_SKILL_INTERVAL * (this.enraged ? 0.7 : 1)
    }
  }

  private chestOrigin(): THREE.Vector3 {
    const s = this.group.scale.y
    return this.muzzle.set(this.group.position.x, 1.25 * s, this.group.position.z)
  }

  private makeShot(playerPos: THREE.Vector3, jitter: number): EnemyShot {
    const origin = this.chestOrigin().clone()
    const dir = new THREE.Vector3(playerPos.x - origin.x, playerPos.y - origin.y, playerPos.z - origin.z).normalize()
    const j = jitter || (this.isBoss ? 0.02 : 0.045)
    dir.x += (Math.random() * 2 - 1) * j
    dir.y += (Math.random() * 2 - 1) * j * 0.5
    dir.z += (Math.random() * 2 - 1) * j
    dir.normalize()
    return { origin, dir, damage: this.projectileDamage, speed: this.projectileSpeed, fromBoss: this.isBoss }
  }

  private makeShotAngle(playerPos: THREE.Vector3, yaw: number): EnemyShot {
    const origin = this.chestOrigin().clone()
    // aim slightly up toward the player's height, fanned on the yaw
    const dy = (playerPos.y - origin.y) * 0.15
    const dir = new THREE.Vector3(Math.sin(yaw), dy, Math.cos(yaw)).normalize()
    return { origin, dir, damage: this.projectileDamage, speed: this.projectileSpeed, fromBoss: this.isBoss }
  }

  takeDamage(amount: number, headshot: boolean): DamageResult {
    if (!this.alive) return { died: false, headshot, blocked: false }
    if (this.shielded) {
      // flash the shield to acknowledge the blocked hit
      const m = this.shieldMesh.material as THREE.MeshBasicMaterial
      m.opacity = 0.6
      return { died: false, headshot, blocked: true }
    }
    this.health = Math.max(0, this.health - amount)
    this.updateHealthBar()
    if (this.health <= 0) {
      this.kill()
      return { died: true, headshot, blocked: false }
    }
    return { died: false, headshot, blocked: false }
  }

  kill() {
    // isBoss left intact so death handlers can detect a boss kill; reset on next spawn.
    this.alive = false
    this.shielded = false
    this.shieldMesh.visible = false
    this.group.visible = false
    this.group.position.y = -100
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  private updateHealthBar() {
    const frac = Math.max(0, this.health / this.maxHealth)
    this.healthFill.scale.x = frac
    this.healthFill.position.x = -(HEALTHBAR_WIDTH / 2) * (1 - frac)
    const mat = this.healthFill.material as THREE.MeshBasicMaterial
    if (this.isBoss) mat.color.setHex(0xff2d55)
    else mat.color.setHSL(0.33 * frac, 0.75, 0.5)
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
  }
}
