// Shared module-level constants + transient-entity interfaces, lifted verbatim
// from the top of the old Game.ts so the extracted systems can share them.
import * as THREE from 'three'
import type { Enemy } from '../entities/Enemy'
import type { PickupKind, WeaponId } from '../constants'

export const ENEMY_COLORS = [0xff5a3c, 0xffb02e, 0xff3b6b, 0x9b5cff, 0x2ee6a6, 0x4d9bff]
export const RANGED_COLOR = 0x35e0ff
export const WEAPON_VIEW_X = 0.45
export const WEAPON_VIEW_Y = -0.5
export const WEAPON_VIEW_Z = -0.72

export const WEAPON_SPRITE_CONFIG: Record<WeaponId, {
  scale: [number, number]
  offset: [number, number, number]
  muzzle: [number, number, number]
  flashScale: number
}> = {
  rifle: {
    scale: [0.56, 0.65],
    offset: [0.11, -0.07, 0],
    muzzle: [-0.18, 0.2, -0.1],
    flashScale: 0.85,
  },
  smg: {
    scale: [0.48, 0.72],
    offset: [0.11, -0.09, 0],
    muzzle: [-0.16, 0.17, -0.1],
    flashScale: 0.75,
  },
  shotgun: {
    scale: [0.64, 0.7],
    offset: [0.12, -0.08, 0],
    muzzle: [-0.15, 0.18, -0.1],
    flashScale: 1.05,
  },
  cannon: {
    scale: [0.64, 0.58],
    offset: [0.15, -0.13, 0],
    muzzle: [-0.17, 0.15, -0.1],
    flashScale: 1.15,
  },
}

export const PICKUP_COLORS: Record<PickupKind, number> = {
  health: 0xff4d6d,
  ammo: 0x35e0ff,
  damage: 0xff7a1a,
  rifle: 0x00d8ff,
  smg: 0x9b5cff,
  shotgun: 0xffb02e,
  cannon: 0xff3b6b,
}

export interface Tracer {
  line: THREE.Line
  age: number
  ttl: number
}
export interface Pop {
  mesh: THREE.Mesh
  age: number
  ttl: number
}
export interface Pickup {
  group: THREE.Group
  kind: PickupKind
  age: number
}
export interface Projectile {
  mesh: THREE.Sprite
  vel: THREE.Vector3
  damage: number
  age: number
  fromBoss: boolean
  baseScale: number
  spin: number
  owner: Enemy | null
}
