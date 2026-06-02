import { Enemy } from '../entities/Enemy'
import {
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
  ENEMY_MAX_HEALTH,
  ENEMY_PROJECTILE_DAMAGE,
  ENEMY_PROJECTILE_SPEED,
  ENEMY_RANGED_CHANCE,
  ENEMY_SCORE,
  ENEMY_SPEED_MAX,
  ENEMY_SPEED_MIN,
  FIRST_WAVE_DELAY,
  STAGE_CLEAR_HEAL,
  STAGE_DIFFICULTY_STEP,
  TOTAL_WAVES,
  WAVE_BREAK,
  WAVE_SPAWN_INTERVAL,
  WAVES,
  WEAPONS,
} from '../constants'
import {
  CAMPAIGN_ORDER,
  campaignSequence,
} from '../data/maps'
import { SURV_XP_GEM_VALUE } from '../data/survivors'
import { ENEMY_COLORS, RANGED_COLOR } from '../data/internalTypes'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'

export class PveDirectorSystem {
  // Wave state
  waveIndex = 0
  waveActive = false
  waveBreakTimer = FIRST_WAVE_DELAY
  spawnTimer = 0
  killsThisWave = 0
  spawnedThisWave = 0
  bossActive = false
  bossEnemy: Enemy | null = null
  bossMaxHealth = BOSS_HEALTH

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  startWaveSystem() {
    for (const e of this.ctx.enemies) e.kill()
    this.waveIndex = 0
    this.waveActive = false
    this.waveBreakTimer = FIRST_WAVE_DELAY
    this.spawnTimer = 0
    this.killsThisWave = 0
    this.spawnedThisWave = 0
    this.bossActive = false
    this.bossEnemy = null
  }

  updateWaves(delta: number) {
    if (!this.waveActive) {
      this.waveBreakTimer -= delta
      if (this.waveBreakTimer <= 0) this.startWave()
      return
    }
    if (this.waveIndex >= TOTAL_WAVES) return // boss wave: victory handled on death

    const wave = WAVES[this.waveIndex]
    this.spawnTimer -= delta
    if (this.spawnedThisWave < wave.count && this.ctx.aliveCount < wave.concurrent && this.spawnTimer <= 0) {
      this.spawnWaveEnemy()
      this.spawnedThisWave++
      this.spawnTimer = WAVE_SPAWN_INTERVAL
    }
    if (this.killsThisWave >= wave.count) this.completeWave()
  }

  startWave() {
    this.waveActive = true
    this.killsThisWave = 0
    this.spawnedThisWave = 0
    this.spawnTimer = 0
    if (this.waveIndex < TOTAL_WAVES) {
      this.sys.hud.announce(`WAVE ${this.waveIndex + 1}`)
    } else {
      this.bossActive = true
      this.sys.hud.announce('⚠  BOSS')
      this.spawnBoss()
    }
  }

  completeWave() {
    this.waveActive = false
    const cleared = this.waveIndex + 1
    this.waveIndex++
    this.waveBreakTimer = WAVE_BREAK
    this.sys.hud.announce(cleared >= TOTAL_WAVES ? 'FINAL WAVE CLEARED' : `WAVE ${cleared} CLEARED`)
  }

  /** Per-stage difficulty scalar for the campaign (1.0 on stage 1, no effect elsewhere). */
  stageMul(): number {
    return 1 + STAGE_DIFFICULTY_STEP * this.ctx.campaignStage
  }

  spawnWaveEnemy() {
    const wave = WAVES[this.waveIndex]
    const enemy = this.getFreeEnemy()
    const pt = this.sys.player.randomSpawnPoint()
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

  spawnBoss() {
    const enemy = this.getFreeEnemy()
    const pt = this.sys.player.randomSpawnPoint()
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

  getFreeEnemy(): Enemy {
    let e = this.ctx.enemies.find((en) => !en.alive)
    if (!e) {
      e = new Enemy()
      this.ctx.scene.add(e.group)
      this.ctx.enemies.push(e)
      this.ctx.raycastTargets.push(...e.hitMeshes)
    }
    return e
  }

  onEnemyDeath(enemy: Enemy, headshot: boolean) {
    const wasBoss = enemy.isBoss
    const spec = WEAPONS[this.ctx.activeWeapon]
    this.ctx.kills++
    // a dead mob's in-flight projectiles should fizzle out
    this.sys.projectiles.removeProjectilesFrom(enemy)

    if (this.ctx.survivors) {
      this.ctx.score += wasBoss ? 250 : 10
      this.sys.fx.spawnDeathPop(enemy.position.clone(), wasBoss ? 0xff2d55 : 0xffd166, wasBoss ? 2.0 : 0.8)
      this.sys.survivors.dropXpGem(enemy.position.clone(), this.sys.survivors.enemyXp.get(enemy) ?? SURV_XP_GEM_VALUE)
      // NOTE: no ammo on kill in Survivors — the sidearm is meant to run dry.
      return
    }

    this.sys.hud.killSeq++
    if (wasBoss) {
      this.ctx.score += BOSS_SCORE
      this.ctx.reserve = Math.min(spec.reserveCap, this.ctx.reserve + BOSS_RESERVE_BONUS)
      this.sys.fx.spawnDeathPop(enemy.position.clone(), 0xff2d55, 2.4)
      this.bossActive = false
      this.bossEnemy = null
      this.advanceCampaignOrWin()
    } else {
      this.ctx.score += ENEMY_SCORE + (headshot ? 50 : 0)
      this.ctx.reserve = Math.min(spec.reserveCap, this.ctx.reserve + spec.ammoPerKill)
      this.sys.fx.spawnDeathPop(enemy.position.clone(), 0xffd166, 1)
      this.killsThisWave++
      this.sys.pickups.maybeDropPickup(enemy.position)
    }
  }

  startCampaign(startMapId?: string) {
    this.sys.multiplayer.leaveMultiplayer(false)
    this.ctx.survivors = false
    this.sys.survivors.recomputeStats()
    this.ctx.campaignMaps = campaignSequence(startMapId ?? CAMPAIGN_ORDER[0])
    this.ctx.campaignStage = 0
    this.sys.arena.buildArena(this.ctx.campaignMaps[0])
    this.sys.player.resetPlayer()
    this.sys.fx.clearTransientFx()
    this.sys.survivors.clearSurvivorsEntities()
    this.startWaveSystem()
    this.ctx.status = 'pointerlock-needed'
    this.sys.hud.emit()
    this.sys.input.requestLock()
  }

  /** Boss down: advance to the next campaign map, or win if this was the last. */
  advanceCampaignOrWin() {
    if (this.ctx.campaignStage < this.ctx.campaignMaps.length - 1) {
      this.ctx.campaignStage++
      const next = this.ctx.campaignMaps[this.ctx.campaignStage]
      this.ctx.health = Math.min(this.ctx.maxHealthValue, this.ctx.health + STAGE_CLEAR_HEAL)
      this.sys.arena.buildArena(next)
      this.sys.fx.clearTransientFx()
      this.sys.arena.placeAtSpawn()
      this.startWaveSystem()
      this.sys.hud.announce(`STAGE ${this.ctx.campaignStage + 1}/${this.ctx.campaignMaps.length} · ${next.name.toUpperCase()}`)
      this.sys.hud.emit()
    } else {
      this.sys.gameOver.gameOver('win')
    }
  }

  updateEnemies(delta: number, elapsed: number) {
    let damageToPlayer = 0
    const playerPos = this.ctx.camera.position
    const quat = this.ctx.camera.quaternion
    for (const enemy of this.ctx.enemies) {
      if (!enemy.alive) continue
      const tick = enemy.update(delta, elapsed, playerPos, this.ctx.enemies, quat)
      damageToPlayer += tick.melee
      for (const shot of tick.shots) this.sys.projectiles.spawnProjectile(shot, enemy)
      this.sys.player.pushOutOfObstacles(enemy.position, enemy.radius)
    }
    if (damageToPlayer > 0) this.sys.player.damagePlayer(damageToPlayer)
  }
}
