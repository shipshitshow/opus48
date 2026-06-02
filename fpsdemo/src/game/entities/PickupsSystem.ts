import * as THREE from 'three'
import { audio } from '../../audio/AudioEngine'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { PICKUP_COLORS, type Pickup } from '../data/internalTypes'
import { PICKUP_SPRITE_TEXTURES, WEAPON_SPRITE_TEXTURES } from '../spriteAssets'
import {
  DAMAGE_BOOST_TIME,
  HEALTH_PICKUP_AMOUNT,
  PICKUP_DROP_CHANCE,
  PICKUP_RADIUS,
  PICKUP_TTL,
  PLAYER_MAX_HEALTH,
  WEAPON_ORDER,
  WEAPONS,
  type PickupKind,
} from '../constants'

/** Drops (health / ammo / damage / weapons): spawn, bob, collect. */
export class PickupsSystem {
  pickups: Pickup[] = []

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  maybeDropPickup(pos: THREE.Vector3) {
    if (Math.random() > PICKUP_DROP_CHANCE) return
    // weighted bag; locked weapons are extra appealing
    const bag: PickupKind[] = ['health', 'health', 'ammo', 'ammo', 'damage']
    for (const id of WEAPON_ORDER) {
      if (id !== 'rifle' && !this.ctx.unlocked.has(id)) bag.push(id, id)
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
    this.ctx.scene.add(group)
    this.pickups.push({ group, kind, age: 0 })
  }

  updatePickups(delta: number) {
    const px = this.ctx.camera.position.x
    const pz = this.ctx.camera.position.z
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

  removePickup(i: number) {
    const p = this.pickups[i]
    this.ctx.scene.remove(p.group)
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

  collectPickup(kind: PickupKind) {
    if (kind === 'health') {
      this.ctx.health = Math.min(PLAYER_MAX_HEALTH, this.ctx.health + HEALTH_PICKUP_AMOUNT)
      this.sys.hud.showToast(`+${HEALTH_PICKUP_AMOUNT} HEALTH`)
    } else if (kind === 'ammo') {
      const spec = WEAPONS[this.ctx.activeWeapon]
      this.ctx.reserve = Math.min(spec.reserveCap, this.ctx.reserve + Math.ceil(spec.reserveCap * 0.5))
      this.sys.hud.showToast('+ AMMO')
    } else if (kind === 'damage') {
      this.ctx.damageBoostTimer = DAMAGE_BOOST_TIME
      this.sys.hud.showToast('2× DAMAGE')
    } else {
      // weapon
      this.sys.weapon.unlockWeapon(kind)
      this.sys.hud.showToast(`+ ${WEAPONS[kind].name.toUpperCase()}`)
    }
    audio.sfx('pickup')
    this.sys.hud.emit()
  }
}
