import * as THREE from 'three'
import type { StateListener } from './types'
import type { PlayerAvatarId } from '../net/playerAvatars'
import { GameContext } from './context'
import type { GameSystems } from './systems'
import { DEFAULT_MAP_ID, getMap } from './data/maps'
import { RenderSystem } from './render/RenderSystem'
import { ArenaSystem } from './render/ArenaSystem'
import { PlayerSystem } from './entities/PlayerSystem'
import { WeaponSystem } from './entities/WeaponSystem'
import { ProjectilesSystem } from './entities/ProjectilesSystem'
import { PickupsSystem } from './entities/PickupsSystem'
import { FxSystem } from './entities/FxSystem'
import { PveDirectorSystem } from './modes/PveDirectorSystem'
import { SurvivorsSystem } from './modes/SurvivorsSystem'
import { MultiplayerSystem } from './modes/MultiplayerSystem'
import { GameOverSystem } from './modes/GameOverSystem'
import { InputSystem } from './systems/InputSystem'
import { HudSystem } from './systems/HudSystem'

/**
 * Thin orchestrator: owns the shared GameContext + the system registry, runs the
 * rAF loop, and exposes the public API (delegating to systems). All gameplay
 * lives in the systems under ./render ./entities ./modes ./systems.
 */
export class Game {
  private ctx: GameContext
  private sys: GameSystems

  constructor(container: HTMLElement, listener: StateListener) {
    const ctx = new GameContext(container, listener)
    this.ctx = ctx
    // Systems only call siblings at runtime, so the construction order is
    // irrelevant — every entry of `sys` is populated before the loop starts.
    const sys = {} as GameSystems
    this.sys = sys
    sys.render = new RenderSystem(ctx, sys)
    sys.arena = new ArenaSystem(ctx, sys)
    sys.player = new PlayerSystem(ctx, sys)
    sys.weapon = new WeaponSystem(ctx, sys)
    sys.projectiles = new ProjectilesSystem(ctx, sys)
    sys.pickups = new PickupsSystem(ctx, sys)
    sys.fx = new FxSystem(ctx, sys)
    sys.pve = new PveDirectorSystem(ctx, sys)
    sys.survivors = new SurvivorsSystem(ctx, sys)
    sys.multiplayer = new MultiplayerSystem(ctx, sys)
    sys.input = new InputSystem(ctx, sys)
    sys.hud = new HudSystem(ctx, sys)
    sys.gameOver = new GameOverSystem(ctx, sys)
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.sys.render.setupRenderer()
    this.sys.render.setupScene()
    this.sys.arena.buildArena(getMap(DEFAULT_MAP_ID))
    this.sys.weapon.buildWeapon()
    this.sys.input.bindEvents()
    this.sys.survivors.init()
    this.sys.player.resetPlayer()
    this.sys.pve.startWaveSystem()
    this.ctx.clock.start()
    this.sys.hud.emit()
    this.loop()
  }

  private loop = () => {
    if (this.ctx.disposed) return
    this.ctx.raf = requestAnimationFrame(this.loop)

    const delta = Math.min(this.ctx.clock.getDelta(), 0.1)
    const elapsed = this.ctx.clock.elapsedTime

    if (this.ctx.status === 'playing') this.update(delta, elapsed)
    else if (this.ctx.status !== 'paused') this.sys.fx.updateEffects(delta)
    // When paused, nothing simulates — the frame is just re-rendered as-is.

    this.sys.hud.emitAccumulator += delta
    if (this.sys.hud.emitAccumulator >= 0.1) {
      this.sys.hud.emitAccumulator = 0
      this.sys.hud.emit()
    }

    this.sys.render.render()
  }

  private update(delta: number, elapsed: number) {
    this.ctx.time += delta
    if (this.ctx.damageBoostTimer > 0) this.ctx.damageBoostTimer = Math.max(0, this.ctx.damageBoostTimer - delta)
    this.sys.weapon.tickMeleeTimers(delta)

    this.sys.player.updatePlayerMovement(delta)
    this.sys.player.resolveCollisions()
    this.sys.weapon.updateWeapon(delta)
    this.sys.fx.updateEffects(delta)
    this.sys.pickups.updatePickups(delta)

    this.sys.weapon.tickFireReload(delta)

    if (this.ctx.multiplayer) {
      this.sys.multiplayer.updateMultiplayer(delta)
    } else if (this.ctx.survivors) {
      this.sys.pve.updateEnemies(delta, elapsed)
      this.sys.projectiles.updateProjectiles(delta)
      this.sys.survivors.updateSurvivors(delta)
    } else {
      this.sys.pve.updateEnemies(delta, elapsed)
      this.sys.projectiles.updateProjectiles(delta)
      this.sys.pve.updateWaves(delta)
    }
  }

  // ------------------------------------------------------ public API (App.tsx)

  requestLock() {
    this.sys.input.requestLock()
  }

  startCampaign(startMapId?: string) {
    this.sys.pve.startCampaign(startMapId)
  }

  startSurvivors() {
    this.sys.survivors.startSurvivors()
  }

  startMultiplayer(room: string, name: string, avatar: PlayerAvatarId = 'ranger') {
    this.sys.multiplayer.startMultiplayer(room, name, avatar)
  }

  leaveMultiplayer(toMenu = true) {
    this.sys.multiplayer.leaveMultiplayer(toMenu)
  }

  setShopUpgrades(tiers: Record<string, number>) {
    this.sys.survivors.setShopUpgrades(tiers)
  }

  pickUpgrade(id: string) {
    this.sys.survivors.pickUpgrade(id)
  }

  restart() {
    this.sys.gameOver.restart()
  }

  returnToMenu() {
    this.sys.gameOver.returnToMenu()
  }

  dispose() {
    this.ctx.disposed = true
    cancelAnimationFrame(this.ctx.raf)

    this.sys.multiplayer.leaveMultiplayer(false)
    this.sys.input.removeListeners()

    if (this.ctx.controls.isLocked) this.ctx.controls.unlock()
    this.ctx.controls.dispose()

    for (const enemy of this.ctx.enemies) enemy.dispose()
    this.ctx.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })

    this.ctx.renderer.dispose()
    if (this.ctx.renderer.domElement.parentElement === this.ctx.container) {
      this.ctx.container.removeChild(this.ctx.renderer.domElement)
    }
  }
}
