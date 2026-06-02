import * as THREE from 'three'
import type { WeaponId } from './constants'
import type { PlayerAvatarId } from '../net/playerAvatars'

import bossSpriteUrl from '../assets/sprites/boss.webp'
import bossBackSpriteUrl from '../assets/sprites/boss-back.webp'
import bossSideSpriteUrl from '../assets/sprites/boss-side.webp'
import enemyMeleeSpriteUrl from '../assets/sprites/enemy-melee.webp'
import enemyMeleeBackSpriteUrl from '../assets/sprites/enemy-melee-back.webp'
import enemyMeleeSideSpriteUrl from '../assets/sprites/enemy-melee-side.webp'
import enemyRangedSpriteUrl from '../assets/sprites/enemy-ranged.webp'
import enemyRangedBackSpriteUrl from '../assets/sprites/enemy-ranged-back.webp'
import enemyRangedSideSpriteUrl from '../assets/sprites/enemy-ranged-side.webp'
import bossProjectileSpriteUrl from '../assets/sprites/projectile-boss.webp'
import enemyProjectileSpriteUrl from '../assets/sprites/projectile-enemy.webp'
import ammoPickupSpriteUrl from '../assets/sprites/pickup-ammo.webp'
import damagePickupSpriteUrl from '../assets/sprites/pickup-damage.webp'
import healthPickupSpriteUrl from '../assets/sprites/pickup-health.webp'
import playerHeavyBackSpriteUrl from '../assets/sprites/player-heavy-back.webp'
import playerHeavyFrontSpriteUrl from '../assets/sprites/player-heavy-front.webp'
import playerHeavySideSpriteUrl from '../assets/sprites/player-heavy-side.webp'
import playerMedicBackSpriteUrl from '../assets/sprites/player-medic-back.webp'
import playerMedicFrontSpriteUrl from '../assets/sprites/player-medic-front.webp'
import playerMedicSideSpriteUrl from '../assets/sprites/player-medic-side.webp'
import playerRangerBackSpriteUrl from '../assets/sprites/player-ranger-back.webp'
import playerRangerFrontSpriteUrl from '../assets/sprites/player-ranger-front.webp'
import playerRangerSideSpriteUrl from '../assets/sprites/player-ranger-side.webp'
import playerScoutBackSpriteUrl from '../assets/sprites/player-scout-back.webp'
import playerScoutFrontSpriteUrl from '../assets/sprites/player-scout-front.webp'
import playerScoutSideSpriteUrl from '../assets/sprites/player-scout-side.webp'
import cannonSpriteUrl from '../assets/sprites/weapon-cannon.webp'
import rifleSpriteUrl from '../assets/sprites/weapon-rifle.webp'
import shotgunSpriteUrl from '../assets/sprites/weapon-shotgun.webp'
import smgSpriteUrl from '../assets/sprites/weapon-smg.webp'
import arenaBlockTextureUrl from '../assets/textures/arena-block.webp'
import arenaColumnTextureUrl from '../assets/textures/arena-column.webp'
import arenaFloorTextureUrl from '../assets/textures/arena-floor.webp'
import arenaWallTextureUrl from '../assets/textures/arena-wall.webp'

function loadSpriteTexture(url: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

export const ENEMY_SPRITE_TEXTURES = {
  melee: {
    front: loadSpriteTexture(enemyMeleeSpriteUrl),
    side: loadSpriteTexture(enemyMeleeSideSpriteUrl),
    back: loadSpriteTexture(enemyMeleeBackSpriteUrl),
  },
  ranged: {
    front: loadSpriteTexture(enemyRangedSpriteUrl),
    side: loadSpriteTexture(enemyRangedSideSpriteUrl),
    back: loadSpriteTexture(enemyRangedBackSpriteUrl),
  },
  boss: {
    front: loadSpriteTexture(bossSpriteUrl),
    side: loadSpriteTexture(bossSideSpriteUrl),
    back: loadSpriteTexture(bossBackSpriteUrl),
  },
} as const

export const WEAPON_SPRITE_TEXTURES: Record<WeaponId, THREE.Texture> = {
  rifle: loadSpriteTexture(rifleSpriteUrl),
  smg: loadSpriteTexture(smgSpriteUrl),
  shotgun: loadSpriteTexture(shotgunSpriteUrl),
  cannon: loadSpriteTexture(cannonSpriteUrl),
}

export const PROJECTILE_SPRITE_TEXTURES = {
  enemy: loadSpriteTexture(enemyProjectileSpriteUrl),
  boss: loadSpriteTexture(bossProjectileSpriteUrl),
} as const

export const PICKUP_SPRITE_TEXTURES = {
  health: loadSpriteTexture(healthPickupSpriteUrl),
  ammo: loadSpriteTexture(ammoPickupSpriteUrl),
  damage: loadSpriteTexture(damagePickupSpriteUrl),
} as const

export const PLAYER_AVATAR_SPRITES: Record<PlayerAvatarId, { front: THREE.Texture; side: THREE.Texture; back: THREE.Texture }> = {
  ranger: {
    front: loadSpriteTexture(playerRangerFrontSpriteUrl),
    side: loadSpriteTexture(playerRangerSideSpriteUrl),
    back: loadSpriteTexture(playerRangerBackSpriteUrl),
  },
  heavy: {
    front: loadSpriteTexture(playerHeavyFrontSpriteUrl),
    side: loadSpriteTexture(playerHeavySideSpriteUrl),
    back: loadSpriteTexture(playerHeavyBackSpriteUrl),
  },
  scout: {
    front: loadSpriteTexture(playerScoutFrontSpriteUrl),
    side: loadSpriteTexture(playerScoutSideSpriteUrl),
    back: loadSpriteTexture(playerScoutBackSpriteUrl),
  },
  medic: {
    front: loadSpriteTexture(playerMedicFrontSpriteUrl),
    side: loadSpriteTexture(playerMedicSideSpriteUrl),
    back: loadSpriteTexture(playerMedicBackSpriteUrl),
  },
}

export const ARENA_TEXTURES = {
  floor: loadSpriteTexture(arenaFloorTextureUrl),
  wall: loadSpriteTexture(arenaWallTextureUrl),
  column: loadSpriteTexture(arenaColumnTextureUrl),
  block: loadSpriteTexture(arenaBlockTextureUrl),
} as const
