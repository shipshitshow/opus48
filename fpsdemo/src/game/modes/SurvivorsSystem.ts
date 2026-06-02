import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { audio } from '../../audio/AudioEngine'
import { Enemy } from '../entities/Enemy'
import { ARENA_HALF, WEAPONS } from '../constants'
import { DEFAULT_MAP_ID, getMap } from '../data/maps'
import { ENEMY_COLORS, RANGED_COLOR } from '../data/internalTypes'
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
} from '../data/survivors'
import type { BuildEntry, UpgradeChoice } from '../types'

export class SurvivorsSystem {
  level = 1
  xp = 0
  xpToNext = xpForLevel(1)
  pendingLevels = 0
  choices: UpgradeChoice[] = []
  upgradeLevels: Partial<Record<UpgradeId, number>> = {}
  orbitLevel = 0
  boltLevel = 0
  novaLevel = 0
  // auto-weapon runtime
  orbitGroup!: THREE.Group
  orbitOrbs: THREE.Mesh[] = []
  orbitAngle = 0
  orbitCd = new WeakMap<Enemy, number>()
  bolts: { mesh: THREE.Mesh; vel: THREE.Vector3; dmg: number; age: number; pierce: number }[] = []
  boltTimer = 0
  novas: { mesh: THREE.Mesh; age: number; ttl: number; hit: Set<Enemy>; dmg: number; maxR: number }[] = []
  novaTimer = NOVA_INTERVAL
  survSpawnTimer = 0
  survClock = 0
  eliteTimer = SURV_ELITE_INTERVAL
  xpGems: { mesh: THREE.Mesh; value: number; age: number }[] = []
  enemyXp = new WeakMap<Enemy, number>()
  shopTiers: Record<string, number> = {} // permanent meta-upgrades

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  init() {
    this.orbitGroup = new THREE.Group()
    this.orbitGroup.visible = false
    this.ctx.scene.add(this.orbitGroup)
  }

  startSurvivors() {
    this.sys.multiplayer.leaveMultiplayer(false)
    this.ctx.survivors = true
    this.ctx.campaignStage = 0
    this.sys.arena.buildArena(getMap(DEFAULT_MAP_ID))
    this.sys.player.resetPlayer()
    this.initSurvivorsRun()
    this.ctx.status = 'pointerlock-needed'
    this.sys.hud.emit()
    this.sys.input.requestLock()
  }

  initSurvivorsRun() {
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
    for (const e of this.ctx.enemies) e.kill()
    this.clearSurvivorsEntities()
    this.recomputeStats()
    this.ctx.health = this.ctx.maxHealthValue
    // No ammo economy in Survivors — the sidearm is infinite (shown as ∞).
    // Depth comes from the drafted auto-weapons + melee, not from reloading.
    this.ctx.ammo = WEAPONS[this.ctx.activeWeapon].magazineSize
    this.ctx.reserve = 0
    this.ctx.reloading = false
  }

  clearSurvivorsEntities() {
    for (const g of this.xpGems) {
      this.ctx.scene.remove(g.mesh)
      g.mesh.geometry.dispose()
      ;(g.mesh.material as THREE.Material).dispose()
    }
    this.xpGems = []
    for (const b of this.bolts) {
      this.ctx.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      ;(b.mesh.material as THREE.Material).dispose()
    }
    this.bolts = []
    for (const n of this.novas) {
      this.ctx.scene.remove(n.mesh)
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
    if (this.ctx.survivors) this.recomputeStats()
  }

  recomputeStats() {
    const lv = (id: UpgradeId) => this.upgradeLevels[id] ?? 0
    const sh = (id: string) => this.shopTiers[id] ?? 0
    this.ctx.statDamageMul = (1 + 0.25 * lv('dmg')) * (1 + 0.08 * sh('might'))
    this.ctx.statFireRateMul = 1 + 0.18 * lv('rate')
    this.ctx.statMoveMul = (1 + 0.12 * lv('speed')) * (1 + 0.06 * sh('swift'))
    this.ctx.statMaxHpBonus = 25 * lv('maxhp') + 15 * sh('vigor')
    this.ctx.statRegen = 1.5 * lv('regen') + 0.6 * sh('regenP')
    this.ctx.statMagnet = SURV_BASE_MAGNET * (1 + 0.45 * lv('magnet')) * (1 + 0.2 * sh('magnetP'))
    this.ctx.statXpMul = (1 + 0.2 * lv('xpgain')) * (1 + 0.1 * sh('scholar'))
    this.ctx.statCrit = 0.12 * lv('crit')
    this.ctx.statMultishot = lv('multishot')
    this.orbitLevel = lv('orbit')
    this.boltLevel = lv('bolt')
    this.novaLevel = lv('nova')
    this.rebuildOrbit(this.orbitLevel ? this.orbitLevel + 1 : 0) // L1 = 2 blades
    if (this.ctx.survivors) this.orbitGroup.visible = this.orbitLevel > 0
  }

  rebuildOrbit(count: number) {
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

  gainXp(v: number) {
    this.xp += v * this.ctx.statXpMul
    let leveled = false
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = xpForLevel(this.level)
      this.pendingLevels++
      leveled = true
    }
    if (leveled && this.ctx.status === 'playing') this.triggerLevelUp()
  }

  triggerLevelUp() {
    this.ctx.status = 'levelup'
    this.rollChoices()
    if (this.ctx.controls.isLocked) this.ctx.controls.unlock()
    audio.sfx('victory')
    this.sys.hud.emit()
  }

  rollChoices() {
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
    if (this.ctx.status !== 'levelup') return
    const uid = id as UpgradeId
    if (UPGRADE_BY_ID[uid]) {
      const prev = this.upgradeLevels[uid] ?? 0
      this.upgradeLevels[uid] = prev + 1
      this.recomputeStats()
      if (uid === 'maxhp') this.ctx.health = Math.min(this.ctx.maxHealthValue, this.ctx.health + 25)
      audio.sfx('pickup')
    }
    this.pendingLevels = Math.max(0, this.pendingLevels - 1)
    if (this.pendingLevels > 0) {
      this.rollChoices()
      this.sys.hud.emit()
    } else {
      this.choices = []
      this.ctx.status = 'playing'
      this.sys.hud.emit()
      this.sys.input.lockPointer()
    }
  }

  updateSurvivors(delta: number) {
    this.survClock += delta

    // regen
    if (this.ctx.statRegen > 0 && this.ctx.health > 0) {
      this.ctx.health = Math.min(this.ctx.maxHealthValue, this.ctx.health + this.ctx.statRegen * delta)
    }

    // escalating swarm spawns
    this.survSpawnTimer -= delta
    const interval = Math.max(SURV_SPAWN_MIN, SURV_SPAWN_START - this.survClock * 0.012)
    if (this.survSpawnTimer <= 0 && this.ctx.aliveCount < SURV_SPAWN_CAP) {
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

  spawnSwarmEnemy(elite: boolean) {
    const enemy = this.sys.pve.getFreeEnemy()
    // spawn on a ring around the player, just out of immediate sight
    const a = Math.random() * Math.PI * 2
    const r = 26 + Math.random() * 10
    let x = this.ctx.camera.position.x + Math.cos(a) * r
    let z = this.ctx.camera.position.z + Math.sin(a) * r
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
  autoDamageEnemy(enemy: Enemy, dmg: number) {
    if (!enemy.alive) return
    const crit = this.ctx.statCrit > 0 && Math.random() < this.ctx.statCrit
    const total = dmg * this.ctx.statDamageMul * (crit ? 2 : 1)
    const res = enemy.takeDamage(total, false)
    this.sys.hud.addDamageNumber(enemy.position.clone().setY(1.6), total, crit ? 'crit' : 'normal')
    if (res.died) this.sys.pve.onEnemyDeath(enemy, false)
  }

  updateOrbit(delta: number) {
    if (this.orbitLevel <= 0) {
      this.orbitGroup.visible = false
      return
    }
    this.orbitGroup.visible = true
    this.orbitGroup.position.set(this.ctx.camera.position.x, 1.2, this.ctx.camera.position.z)
    this.orbitAngle += ORBIT_SPEED * delta
    const n = this.orbitOrbs.length
    for (let i = 0; i < n; i++) {
      const ang = this.orbitAngle + (i / n) * Math.PI * 2
      this.orbitOrbs[i].position.set(Math.cos(ang) * ORBIT_RADIUS, 0, Math.sin(ang) * ORBIT_RADIUS)
    }
    const dmg = ORBIT_DMG * (1 + 0.25 * (this.orbitLevel - 1))
    const now = this.survClock
    for (const enemy of this.ctx.enemies) {
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

  updateBolts(delta: number) {
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
      for (const enemy of this.ctx.enemies) {
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

  fireBolt() {
    const tgt = this.nearestEnemy(this.ctx.camera.position)
    if (!tgt) return
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x8affff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    mesh.position.set(this.ctx.camera.position.x, 1.3, this.ctx.camera.position.z)
    const dx = tgt.position.x - mesh.position.x
    const dz = tgt.position.z - mesh.position.z
    const d = Math.hypot(dx, dz) || 1
    const vel = new THREE.Vector3((dx / d) * BOLT_SPEED, 0, (dz / d) * BOLT_SPEED)
    this.ctx.scene.add(mesh)
    this.bolts.push({ mesh, vel, dmg: BOLT_DMG * (1 + 0.18 * (this.boltLevel - 1)), age: 0, pierce: Math.floor((this.boltLevel - 1) / 2) })
    audio.sfx('hit')
  }

  removeBolt(i: number) {
    const b = this.bolts[i]
    this.ctx.scene.remove(b.mesh)
    b.mesh.geometry.dispose()
    ;(b.mesh.material as THREE.Material).dispose()
    this.bolts.splice(i, 1)
  }

  updateNovas(delta: number) {
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
      for (const enemy of this.ctx.enemies) {
        if (!enemy.alive || nv.hit.has(enemy)) continue
        const d = Math.hypot(enemy.position.x - nv.mesh.position.x, enemy.position.z - nv.mesh.position.z)
        if (d <= radius) {
          nv.hit.add(enemy)
          this.autoDamageEnemy(enemy, nv.dmg)
        }
      }
      if (nv.age >= nv.ttl) {
        this.ctx.scene.remove(nv.mesh)
        nv.mesh.geometry.dispose()
        ;(nv.mesh.material as THREE.Material).dispose()
        this.novas.splice(i, 1)
      }
    }
  }

  castNova() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(this.ctx.camera.position.x, 0.2, this.ctx.camera.position.z)
    ring.scale.setScalar(0.001)
    this.ctx.scene.add(ring)
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

  nearestEnemy(from: THREE.Vector3): Enemy | null {
    let best: Enemy | null = null
    let bestD = Infinity
    for (const e of this.ctx.enemies) {
      if (!e.alive) continue
      const d = (e.position.x - from.x) ** 2 + (e.position.z - from.z) ** 2
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  dropXpGem(pos: THREE.Vector3, value: number) {
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
    this.ctx.scene.add(mesh)
    this.xpGems.push({ mesh, value, age: 0 })
  }

  updateXpGems(delta: number) {
    const px = this.ctx.camera.position.x
    const pz = this.ctx.camera.position.z
    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      const g = this.xpGems[i]
      g.age += delta
      g.mesh.rotation.y += delta * 3
      g.mesh.position.y = 0.6 + Math.sin(g.age * 4) * 0.1
      const d = Math.hypot(g.mesh.position.x - px, g.mesh.position.z - pz)
      if (d < this.ctx.statMagnet) {
        // magnet pull
        const pull = (1 - d / this.ctx.statMagnet) * 26 + 4
        g.mesh.position.x += ((px - g.mesh.position.x) / (d || 1)) * pull * delta
        g.mesh.position.z += ((pz - g.mesh.position.z) / (d || 1)) * pull * delta
      }
      if (d < 1.3) {
        this.gainXp(g.value)
        this.ctx.scene.remove(g.mesh)
        g.mesh.geometry.dispose()
        ;(g.mesh.material as THREE.Material).dispose()
        this.xpGems.splice(i, 1)
      }
    }
  }

  /** Build summary for the HUD level-up / loadout panels. */
  buildList(): BuildEntry[] {
    const out: BuildEntry[] = []
    for (const u of UPGRADES) {
      const lvl = this.upgradeLevels[u.id] ?? 0
      if (lvl > 0) out.push({ id: u.id, name: u.name, icon: u.icon, level: lvl, max: u.max })
    }
    return out
  }
}
