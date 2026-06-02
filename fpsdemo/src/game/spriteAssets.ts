import * as THREE from 'three'
import type { WeaponId } from './constants'

import bossSpriteUrl from '../assets/sprites/boss.png'
import enemyMeleeSpriteUrl from '../assets/sprites/enemy-melee.png'
import enemyRangedSpriteUrl from '../assets/sprites/enemy-ranged.png'
import cannonSpriteUrl from '../assets/sprites/weapon-cannon.png'
import rifleSpriteUrl from '../assets/sprites/weapon-rifle.png'
import shotgunSpriteUrl from '../assets/sprites/weapon-shotgun.png'
import smgSpriteUrl from '../assets/sprites/weapon-smg.png'

function loadSpriteTexture(url: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

export const ENEMY_SPRITE_TEXTURES = {
  melee: loadSpriteTexture(enemyMeleeSpriteUrl),
  ranged: loadSpriteTexture(enemyRangedSpriteUrl),
  boss: loadSpriteTexture(bossSpriteUrl),
} as const

export const WEAPON_SPRITE_TEXTURES: Record<WeaponId, THREE.Texture> = {
  rifle: loadSpriteTexture(rifleSpriteUrl),
  smg: loadSpriteTexture(smgSpriteUrl),
  shotgun: loadSpriteTexture(shotgunSpriteUrl),
  cannon: loadSpriteTexture(cannonSpriteUrl),
}
