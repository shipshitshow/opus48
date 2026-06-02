import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import type { Projectile } from '../data/internalTypes'
import type { Enemy, EnemyShot } from './Enemy'
import { PROJECTILE_SPRITE_TEXTURES } from '../spriteAssets'
import { ARENA_HALF, PROJECTILE_HIT_RADIUS, PROJECTILE_TTL, WALL_THICKNESS } from '../constants'

/** Enemy / boss projectiles: spawn, fly, hit the player or get blocked. */
export class ProjectilesSystem {
  projectiles: Projectile[] = []

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  spawnProjectile(shot: EnemyShot, owner: Enemy | null = null) {
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
    this.ctx.scene.add(mesh)
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
  removeProjectilesFrom(enemy: Enemy) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].owner === enemy) this.removeProjectile(i)
    }
  }

  updateProjectiles(delta: number) {
    const player = this.ctx.camera.position
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
        this.sys.player.damagePlayer(pr.damage)
        continue
      }
      // expired / out of bounds / into an obstacle?
      if (pr.age >= PROJECTILE_TTL || Math.abs(p.x) > bound || Math.abs(p.z) > bound || p.y < 0.05) {
        this.removeProjectile(i)
        continue
      }
      let blocked = false
      for (const box of this.ctx.obstacleBoxes) {
        if (p.x > box.min.x - 0.1 && p.x < box.max.x + 0.1 && p.z > box.min.z - 0.1 && p.z < box.max.z + 0.1 && p.y < box.max.y + 0.1) {
          blocked = true
          break
        }
      }
      if (blocked) this.removeProjectile(i)
    }
  }

  removeProjectile(i: number) {
    const pr = this.projectiles[i]
    this.ctx.scene.remove(pr.mesh)
    ;(pr.mesh.material as THREE.Material).dispose()
    this.projectiles.splice(i, 1)
  }

  clearProjectiles() {
    for (const pr of this.projectiles) {
      this.ctx.scene.remove(pr.mesh)
      ;(pr.mesh.material as THREE.Material).dispose()
    }
    this.projectiles = []
  }
}
