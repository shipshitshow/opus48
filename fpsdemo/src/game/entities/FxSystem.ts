import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import type { Pop, Tracer } from '../data/internalTypes'

/** Transient visual FX: bullet tracers, death pops, muzzle-flash decay, teardown. */
export class FxSystem {
  tracers: Tracer[] = []
  pops: Pop[] = []

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  addTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1b5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const line = new THREE.Line(geo, mat)
    this.ctx.scene.add(line)
    this.tracers.push({ line, age: 0, ttl: 0.07 })
  }

  spawnDeathPop(pos: THREE.Vector3, color: number, scale: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 * scale, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    mesh.position.copy(pos)
    mesh.position.y = 1.0 * scale
    this.ctx.scene.add(mesh)
    this.pops.push({ mesh, age: 0, ttl: 0.35 })
  }

  updateEffects(delta: number) {
    if (this.ctx.muzzleTimer > 0) {
      this.ctx.muzzleTimer -= delta
      this.ctx.muzzleLight.intensity = Math.max(0, this.ctx.muzzleLight.intensity - delta * 160)
      if (this.ctx.muzzleTimer <= 0) {
        this.ctx.muzzleFlash.visible = false
        this.ctx.muzzleLight.intensity = 0
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.age += delta
      const k = 1 - t.age / t.ttl
      ;(t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, k * 0.9)
      if (t.age >= t.ttl) {
        this.ctx.scene.remove(t.line)
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
        this.ctx.scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        ;(p.mesh.material as THREE.Material).dispose()
        this.pops.splice(i, 1)
      }
    }
  }

  clearTransientFx() {
    for (const t of this.tracers) {
      this.ctx.scene.remove(t.line)
      t.line.geometry.dispose()
      ;(t.line.material as THREE.Material).dispose()
    }
    this.tracers = []
    for (const p of this.pops) {
      this.ctx.scene.remove(p.mesh)
      p.mesh.geometry.dispose()
      ;(p.mesh.material as THREE.Material).dispose()
    }
    this.pops = []
    this.sys.projectiles.clearProjectiles()
    while (this.sys.pickups.pickups.length) this.sys.pickups.removePickup(this.sys.pickups.pickups.length - 1)
  }
}
