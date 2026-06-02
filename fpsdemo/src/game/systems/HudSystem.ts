import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { audio } from '../../audio/AudioEngine'
import { RELOAD_TIME, TOTAL_WAVES, WEAPON_ORDER, WEAPONS } from '../constants'
import type { HUDState } from '../types'

export class HudSystem {
  // HUD sync
  emitAccumulator = 0
  hitMarkerSeq = 0
  headshotSeq = 0
  killSeq = 0
  damageSeq = 0
  damageNumbers: { id: number; x: number; y: number; amount: number; kind: 'normal' | 'head' | 'crit'; t: number }[] = []
  damageNumberId = 0
  banner = ''
  bannerSeq = 0
  toast = ''
  toastSeq = 0

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  /** Drop the current centre banner (bannerSeq 0 = nothing to render). Called on
   *  run start so a prior "DEFEAT"/"VICTORY" can't re-flash in the new run. */
  clearBanner() {
    this.banner = ''
    this.bannerSeq = 0
  }

  announce(text: string) {
    this.banner = text
    this.bannerSeq++
    if (text === 'VICTORY') audio.sfx('victory')
    else if (text === 'DEFEAT') audio.sfx('defeat')
    else if (text.includes('BOSS')) audio.sfx('boss')
    else if (text.startsWith('WAVE') && !text.includes('CLEARED')) audio.sfx('wave')
    this.emit()
  }

  showToast(text: string) {
    this.toast = text
    this.toastSeq++
    this.emit()
  }

  static readonly DAMAGE_NUMBER_TTL = 0.9
  /** Spawn a floating damage number at a world position (projected to screen). */
  addDamageNumber(world: THREE.Vector3, amount: number, kind: 'normal' | 'head' | 'crit') {
    const v = world.clone().project(this.ctx.camera)
    if (v.z > 1) return // behind the camera — don't show
    const x = (v.x * 0.5 + 0.5) * 100
    const y = (-v.y * 0.5 + 0.5) * 100
    this.damageNumbers.push({ id: ++this.damageNumberId, x, y, amount: Math.max(1, Math.round(amount)), kind, t: this.ctx.time })
    if (this.damageNumbers.length > 40) this.damageNumbers.shift()
  }

  emit() {
    if (this.ctx.disposed) return
    // Drop floating damage numbers once their CSS animation has finished.
    if (this.damageNumbers.length) {
      this.damageNumbers = this.damageNumbers.filter((d) => this.ctx.time - d.t < HudSystem.DAMAGE_NUMBER_TTL)
    }
    const spec = WEAPONS[this.ctx.activeWeapon]
    const weapons = WEAPON_ORDER.filter((id) => this.ctx.unlocked.has(id)).map((id) => ({
      id,
      name: WEAPONS[id].name,
      key: WEAPON_ORDER.indexOf(id) + 1,
      active: id === this.ctx.activeWeapon,
    }))
    const state: HUDState = {
      status: this.ctx.status,
      playerHealth: Math.round(this.ctx.health),
      maxPlayerHealth: this.ctx.maxHealthValue,
      ammo: this.ctx.ammo,
      magazineSize: spec.magazineSize,
      reserve: this.ctx.reserve,
      reloading: this.ctx.reloading,
      reloadProgress: this.ctx.reloading ? Math.min(1, 1 - this.ctx.reloadTimer / RELOAD_TIME) : 0,
      score: this.ctx.score,
      kills: this.ctx.kills,
      headshots: this.ctx.headshots,
      enemiesAlive: this.ctx.aliveCount,
      time: Math.floor(this.ctx.time),
      wave: Math.min(this.sys.pve.waveIndex + 1, TOTAL_WAVES),
      totalWaves: TOTAL_WAVES,
      campaignStage: this.ctx.campaignStage + 1,
      campaignTotalStages: this.ctx.campaignMaps.length,
      mapName: this.ctx.currentMap.name,
      bossActive: this.sys.pve.bossActive,
      bossHealthFrac: this.sys.pve.bossActive && this.sys.pve.bossEnemy && this.sys.pve.bossEnemy.alive ? this.sys.pve.bossEnemy.health / this.sys.pve.bossMaxHealth : 0,
      outcome: this.ctx.outcome,
      weapon: spec.name,
      weapons,
      damageBoost: Math.ceil(this.ctx.damageBoostTimer),
      bossShielded: !!(this.sys.pve.bossEnemy && this.sys.pve.bossEnemy.alive && this.sys.pve.bossEnemy.shielded),
      bossEnraged: !!(this.sys.pve.bossEnemy && this.sys.pve.bossEnemy.alive && this.sys.pve.bossEnemy.enraged),
      hitMarkerSeq: this.hitMarkerSeq,
      headshotSeq: this.headshotSeq,
      killSeq: this.killSeq,
      damageSeq: this.damageSeq,
      banner: this.banner,
      bannerSeq: this.bannerSeq,
      toast: this.toast,
      toastSeq: this.toastSeq,
      damageNumbers: this.damageNumbers.map(({ t, ...d }) => d),
      multiplayer: this.ctx.multiplayer,
      connected: this.sys.multiplayer.connected,
      room: this.sys.multiplayer.roomName,
      scoreboard: this.ctx.multiplayer ? this.sys.multiplayer.buildScoreboard() : [],
      survivors: this.ctx.survivors,
      level: this.sys.survivors.level,
      xp: Math.floor(this.sys.survivors.xp),
      xpToNext: this.sys.survivors.xpToNext,
      build: this.ctx.survivors ? this.sys.survivors.buildList() : [],
      choices: this.ctx.status === 'levelup' ? this.sys.survivors.choices : [],
    }
    this.ctx.listener(state)
  }
}
