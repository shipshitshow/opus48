import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { audio } from '../../audio/AudioEngine'
import {
  ARENA_HALF,
  GRAVITY,
  MOVE_ACCEL,
  MOVE_DAMPING,
  PLAYER_HEIGHT,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  STARTING_WEAPON,
  WALL_THICKNESS,
  WEAPON_ORDER,
  WEAPONS,
  type WeaponId,
} from '../constants'

export class PlayerSystem {
  constructor(private ctx: GameContext, private sys: GameSystems) {}

  updatePlayerMovement(delta: number) {
    this.ctx.velocity.x -= this.ctx.velocity.x * MOVE_DAMPING * delta
    this.ctx.velocity.z -= this.ctx.velocity.z * MOVE_DAMPING * delta
    this.ctx.velocity.y -= GRAVITY * delta

    this.ctx._dir.z = Number(this.ctx.move.forward) - Number(this.ctx.move.back)
    this.ctx._dir.x = Number(this.ctx.move.right) - Number(this.ctx.move.left)
    this.ctx._dir.normalize()

    const accel = MOVE_ACCEL * this.ctx.statMoveMul
    if (this.ctx.move.forward || this.ctx.move.back) this.ctx.velocity.z -= this.ctx._dir.z * accel * delta
    if (this.ctx.move.left || this.ctx.move.right) this.ctx.velocity.x -= this.ctx._dir.x * accel * delta

    this.ctx.controls.moveRight(-this.ctx.velocity.x * delta)
    this.ctx.controls.moveForward(-this.ctx.velocity.z * delta)

    this.ctx.camera.position.y += this.ctx.velocity.y * delta
    if (this.ctx.camera.position.y < PLAYER_HEIGHT) {
      this.ctx.velocity.y = 0
      this.ctx.camera.position.y = PLAYER_HEIGHT
      this.ctx.canJump = true
    }
  }

  pushOutOfObstacles(pos: THREE.Vector3, radius: number) {
    for (const box of this.ctx.obstacleBoxes) {
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

  resolveCollisions() {
    const pos = this.ctx.camera.position
    const limit = ARENA_HALF - WALL_THICKNESS / 2 - PLAYER_RADIUS
    pos.x = Math.max(-limit, Math.min(limit, pos.x))
    pos.z = Math.max(-limit, Math.min(limit, pos.z))
    this.pushOutOfObstacles(pos, PLAYER_RADIUS)
  }

  damagePlayer(amount: number) {
    this.ctx.health = Math.max(0, this.ctx.health - amount)
    this.sys.hud.damageSeq++
    audio.sfx('hurt')
    this.sys.hud.emit()
    if (this.ctx.health <= 0) this.sys.gameOver.gameOver('dead')
  }

  randomSpawnPoint(): { x: number; z: number } {
    const playerPos = this.ctx.camera.position
    const limit = ARENA_HALF - 3
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (Math.random() * 2 - 1) * limit
      const z = (Math.random() * 2 - 1) * limit
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 16) continue
      let inObstacle = false
      for (const box of this.ctx.obstacleBoxes) {
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

  resetPlayer() {
    this.ctx.health = PLAYER_MAX_HEALTH
    this.ctx.score = 0
    this.ctx.kills = 0
    this.ctx.headshots = 0
    this.ctx.time = 0
    this.ctx.outcome = null
    this.ctx.damageBoostTimer = 0
    this.sys.hud.clearBanner() // drop any stale terminal banner (e.g. "DEFEAT") so it can't re-flash next run
    this.ctx.firing = false
    this.ctx.triggerQueued = false
    this.ctx.velocity.set(0, 0, 0)
    this.ctx.canJump = false
    this.ctx.move.forward = this.ctx.move.back = this.ctx.move.left = this.ctx.move.right = false

    // reset arsenal
    this.ctx.unlocked = new Set<WeaponId>([STARTING_WEAPON])
    for (const id of WEAPON_ORDER) {
      this.ctx.weaponMag[id] = WEAPONS[id].magazineSize
      this.ctx.weaponReserve[id] = WEAPONS[id].reserve
    }
    this.ctx.activeWeapon = STARTING_WEAPON
    this.ctx.ammo = this.ctx.weaponMag[STARTING_WEAPON]
    this.ctx.reserve = this.ctx.weaponReserve[STARTING_WEAPON]
    this.ctx.reloading = false
    this.ctx.reloadTimer = 0
    this.ctx.fireCooldown = 0

    this.sys.arena.placeAtSpawn()

    this.sys.weapon.resetView()
  }
}
