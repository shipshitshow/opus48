import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { audio } from '../../audio/AudioEngine'
import { Enemy } from './Enemy'
import {
  DAMAGE_BOOST_MULT,
  HEADSHOT_MULTIPLIER,
  MELEE_ARC_DOT,
  MELEE_COOLDOWN,
  MELEE_DAMAGE,
  MELEE_RANGE,
  RELOAD_TIME,
  WEAPONS,
  type WeaponId,
} from '../constants'
import { WEAPON_SPRITE_TEXTURES } from '../spriteAssets'
import { WEAPON_SPRITE_CONFIG, WEAPON_VIEW_X, WEAPON_VIEW_Y, WEAPON_VIEW_Z } from '../data/internalTypes'

export class WeaponSystem {
  // Weapon view model
  weapon!: THREE.Group
  weaponBarrel!: THREE.Mesh
  weaponAccentMat!: THREE.MeshStandardMaterial
  magazine!: THREE.Mesh
  weaponSprite!: THREE.Sprite
  weaponSpriteMat!: THREE.SpriteMaterial
  weaponRecoil = 0
  bobTime = 0
  readonly magBaseY = -0.17
  meleeCd = 0
  meleeAnim = 0

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  buildWeapon() {
    this.weapon = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.5, metalness: 0.7 })
    this.weaponAccentMat = new THREE.MeshStandardMaterial({ color: 0x00d8ff, emissive: 0x00aacc, emissiveIntensity: 1.2 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), bodyMat)
    body.position.set(0, 0, -0.1)
    this.weaponBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.45), bodyMat)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), bodyMat)
    grip.position.set(0, -0.16, 0.04)
    grip.rotation.x = 0.25
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.2), this.weaponAccentMat)
    sight.position.set(0, 0.12, -0.1)

    this.magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.6 }),
    )
    this.magazine.position.set(0, this.magBaseY, -0.04)

    for (const part of [body, this.weaponBarrel, grip, sight, this.magazine]) part.visible = false
    this.weapon.add(body, this.weaponBarrel, grip, sight, this.magazine)

    this.weaponSpriteMat = new THREE.SpriteMaterial({
      map: WEAPON_SPRITE_TEXTURES.rifle,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.04,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.weaponSprite = new THREE.Sprite(this.weaponSpriteMat)
    this.weaponSprite.renderOrder = 20
    this.weapon.add(this.weaponSprite)

    this.ctx.muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.ctx.muzzleFlash.renderOrder = 21
    this.ctx.muzzleFlash.visible = false
    this.weapon.add(this.ctx.muzzleFlash)

    this.ctx.muzzleLight = new THREE.PointLight(0xffcc66, 0, 12, 2)
    this.ctx.muzzleLight.castShadow = false
    this.weapon.add(this.ctx.muzzleLight)

    this.weapon.position.set(WEAPON_VIEW_X, WEAPON_VIEW_Y, WEAPON_VIEW_Z)
    this.ctx.camera.add(this.weapon)
    this.applyWeaponModel(this.ctx.activeWeapon)
  }

  applyWeaponModel(id: WeaponId) {
    const spec = WEAPONS[id]
    this.weaponAccentMat.color.setHex(spec.accent)
    this.weaponAccentMat.emissive.setHex(spec.accent)
    // anchor the barrel at the front of the body and extend it forward by barrelLen
    this.weaponBarrel.scale.z = spec.barrelLen / 0.45
    this.weaponBarrel.position.set(0, 0.02, -0.2 - spec.barrelLen / 2)

    const sprite = WEAPON_SPRITE_CONFIG[id]
    this.weaponSpriteMat.map = WEAPON_SPRITE_TEXTURES[id]
    this.weaponSpriteMat.needsUpdate = true
    this.weaponSprite.scale.set(sprite.scale[0], sprite.scale[1], 1)
    this.weaponSprite.position.set(sprite.offset[0], sprite.offset[1], sprite.offset[2])
    this.ctx.muzzleFlash.position.set(sprite.muzzle[0], sprite.muzzle[1], sprite.muzzle[2])
    this.ctx.muzzleFlash.scale.setScalar(sprite.flashScale)
    this.ctx.muzzleLight.position.set(sprite.muzzle[0], sprite.muzzle[1], sprite.muzzle[2])
  }

  unlockWeapon(id: WeaponId) {
    if (!this.ctx.unlocked.has(id)) {
      this.ctx.unlocked.add(id)
      this.ctx.weaponMag[id] = WEAPONS[id].magazineSize
      this.ctx.weaponReserve[id] = WEAPONS[id].reserve
    } else {
      // already owned -> top it up
      this.ctx.weaponReserve[id] = Math.min(WEAPONS[id].reserveCap, this.ctx.weaponReserve[id] + WEAPONS[id].reserve)
    }
    this.switchWeapon(id)
  }

  switchWeapon(id: WeaponId) {
    if (!this.ctx.unlocked.has(id) || id === this.ctx.activeWeapon) return
    // stash current
    this.ctx.weaponMag[this.ctx.activeWeapon] = this.ctx.ammo
    this.ctx.weaponReserve[this.ctx.activeWeapon] = this.ctx.reserve
    this.ctx.activeWeapon = id
    this.ctx.ammo = this.ctx.weaponMag[id]
    this.ctx.reserve = this.ctx.weaponReserve[id]
    this.ctx.reloading = false
    this.ctx.reloadTimer = 0
    this.ctx.fireCooldown = 0.05
    this.applyWeaponModel(id)
    audio.sfx('switch')
    this.sys.hud.emit()
  }

  tryMelee() {
    if (this.ctx.status !== 'playing' || this.meleeCd > 0) return
    this.doMelee()
  }

  /** Knife swing: always available (no ammo). Hits a frontal cluster of enemies. */
  doMelee() {
    this.meleeCd = MELEE_COOLDOWN
    this.meleeAnim = 0.22
    audio.sfx('hit')

    this.ctx.camera.getWorldDirection(this.ctx._fwd)
    const flen = Math.hypot(this.ctx._fwd.x, this.ctx._fwd.z) || 1
    const dirX = this.ctx._fwd.x / flen
    const dirZ = this.ctx._fwd.z / flen
    const px = this.ctx.camera.position.x
    const pz = this.ctx.camera.position.z
    const dmgMul = this.ctx.statDamageMul
    let hitAny = false

    for (const enemy of this.ctx.enemies) {
      if (!enemy.alive) continue
      const ex = enemy.position.x - px
      const ez = enemy.position.z - pz
      const d = Math.hypot(ex, ez)
      if (d > MELEE_RANGE + enemy.radius) continue
      if (d > 0.0001 && (ex * dirX + ez * dirZ) / d < MELEE_ARC_DOT) continue
      const crit = this.ctx.statCrit > 0 && Math.random() < this.ctx.statCrit ? 2 : 1
      const dmg = MELEE_DAMAGE * dmgMul * crit
      const res = enemy.takeDamage(dmg, false)
      hitAny = true
      this.sys.hud.addDamageNumber(enemy.position.clone().setY(1.6), dmg, crit > 1 ? 'crit' : 'normal')
      if (res.died) this.sys.pve.onEnemyDeath(enemy, false)
    }

    if (this.ctx.multiplayer && this.sys.multiplayer.net) {
      for (const r of this.sys.multiplayer.remotePlayers.values()) {
        const rx = r.group.position.x - px
        const rz = r.group.position.z - pz
        const d = Math.hypot(rx, rz)
        if (d > MELEE_RANGE + 0.6) continue
        if (d > 0.0001 && (rx * dirX + rz * dirZ) / d < MELEE_ARC_DOT) continue
        this.sys.multiplayer.net.sendHit(r.id, MELEE_DAMAGE * dmgMul)
        hitAny = true
      }
    }

    if (hitAny) this.sys.hud.hitMarkerSeq++
    this.sys.hud.emit()
  }

  shoot() {
    const spec = WEAPONS[this.ctx.activeWeapon]
    if (!this.ctx.survivors) this.ctx.ammo-- // Survivors: the sidearm has no ammo system
    this.ctx.fireCooldown = spec.fireInterval / this.ctx.statFireRateMul
    this.weaponRecoil = Math.min(0.16, this.weaponRecoil + (spec.pellets > 1 ? 0.12 : 0.05))
    audio.sfx('shoot')

    this.ctx.muzzleTimer = 0.05
    this.ctx.muzzleFlash.visible = true
    this.ctx.muzzleFlash.rotation.z = Math.random() * Math.PI
    this.ctx.muzzleLight.intensity = 8

    this.ctx.scene.updateMatrixWorld()
    this.ctx.camera.getWorldPosition(this.ctx._origin)
    this.ctx.camera.getWorldDirection(this.ctx._fwd)
    this.ctx._right.crossVectors(this.ctx._fwd, this.ctx._worldUp).normalize()
    this.ctx._up.crossVectors(this.ctx._right, this.ctx._fwd).normalize()

    const dmgMult = (this.ctx.damageBoostTimer > 0 ? DAMAGE_BOOST_MULT : 1) * this.ctx.statDamageMul
    const muzzleWorld = this.ctx.muzzleFlash.getWorldPosition(new THREE.Vector3())
    const pellets = spec.pellets + (this.ctx.survivors ? this.ctx.statMultishot : 0)
    const spread = pellets > 1 ? Math.max(spec.spread, 0.03) : spec.spread

    for (let p = 0; p < pellets; p++) {
      const dir = this.ctx._fwd.clone()
      if (spread > 0) {
        dir.addScaledVector(this.ctx._right, (Math.random() * 2 - 1) * spread)
        dir.addScaledVector(this.ctx._up, (Math.random() * 2 - 1) * spread)
        dir.normalize()
      }
      this.ctx.raycaster.set(this.ctx._origin, dir)
      this.ctx.raycaster.far = 500
      const hits = this.ctx.raycaster.intersectObjects(this.ctx.raycastTargets, false)

      let endPoint: THREE.Vector3 | null = null
      for (const h of hits) {
        const ud = h.object.userData as { enemy?: Enemy; part?: string; solid?: boolean; remoteId?: string }
        if (ud.remoteId) {
          // PvP: report the hit to the server (authoritative health/kills).
          const headshot = ud.part === 'head'
          const dmg = spec.damage * dmgMult * (headshot ? HEADSHOT_MULTIPLIER : 1)
          this.sys.multiplayer.net?.sendHit(ud.remoteId, dmg)
          endPoint = h.point.clone()
          this.sys.hud.addDamageNumber(h.point, dmg, headshot ? 'head' : 'normal')
          if (headshot) {
            this.ctx.headshots++
            this.sys.hud.headshotSeq++
            audio.sfx('headshot')
          } else {
            this.sys.hud.hitMarkerSeq++
            audio.sfx('hit')
          }
          break
        } else if (ud.enemy) {
          if (!ud.enemy.alive) continue
          const headshot = ud.part === 'head'
          const crit = this.ctx.statCrit > 0 && Math.random() < this.ctx.statCrit ? 2 : 1
          const dmg = spec.damage * dmgMult * crit * (headshot ? HEADSHOT_MULTIPLIER : 1)
          const res = ud.enemy.takeDamage(dmg, headshot)
          endPoint = h.point.clone()
          if (!res.blocked) this.sys.hud.addDamageNumber(h.point, dmg, headshot ? 'head' : crit > 1 ? 'crit' : 'normal')
          if (res.blocked) {
            this.sys.hud.hitMarkerSeq++ // shield ping (no damage)
            audio.sfx('shieldhit')
          } else if (res.died) {
            if (headshot) {
              this.ctx.headshots++
              this.sys.hud.headshotSeq++
              this.sys.hud.showToast('HEADSHOT!')
              audio.sfx('headshot')
            }
            this.sys.pve.onEnemyDeath(ud.enemy, headshot)
            audio.sfx('kill')
          } else if (headshot) {
            this.ctx.headshots++
            this.sys.hud.headshotSeq++
            audio.sfx('headshot')
          } else {
            this.sys.hud.hitMarkerSeq++
            audio.sfx('hit')
          }
          break
        } else if (ud.solid) {
          endPoint = h.point.clone()
          break
        }
      }
      if (!endPoint) endPoint = this.ctx.raycaster.ray.at(120, new THREE.Vector3())
      this.sys.fx.addTracer(muzzleWorld, endPoint)
    }

    if (this.ctx.ammo <= 0) this.startReload()
    this.sys.hud.emit()
  }

  startReload() {
    if (this.ctx.survivors) return // no reloads in Survivors — the gun is infinite
    const spec = WEAPONS[this.ctx.activeWeapon]
    if (this.ctx.reloading || this.ctx.reserve <= 0 || this.ctx.ammo >= spec.magazineSize) return
    this.ctx.reloading = true
    this.ctx.reloadTimer = RELOAD_TIME
    this.ctx.firing = false
    audio.sfx('reload')
    this.sys.hud.emit()
  }

  finishReload() {
    const spec = WEAPONS[this.ctx.activeWeapon]
    const need = spec.magazineSize - this.ctx.ammo
    const taken = Math.min(need, this.ctx.reserve)
    this.ctx.ammo += taken
    this.ctx.reserve -= taken
    this.ctx.reloading = false
    this.magazine.position.y = this.magBaseY
    this.weapon.rotation.set(0, 0, 0)
    this.sys.hud.emit()
  }

  tickMeleeTimers(delta: number) {
    if (this.meleeCd > 0) this.meleeCd -= delta
    if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - delta)
  }

  tickFireReload(delta: number) {
    const spec = WEAPONS[this.ctx.activeWeapon]
    this.ctx.fireCooldown -= delta
    if (this.ctx.reloading) {
      this.ctx.reloadTimer -= delta
      if (this.ctx.reloadTimer <= 0) this.finishReload()
    } else if (this.ctx.ammo > 0) {
      if (spec.auto) {
        if (this.ctx.firing && this.ctx.fireCooldown <= 0) this.shoot()
      } else if (this.ctx.triggerQueued && this.ctx.fireCooldown <= 0) {
        this.shoot()
        this.ctx.triggerQueued = false
      }
    } else if (this.ctx.firing || this.ctx.triggerQueued) {
      this.ctx.triggerQueued = false
      this.startReload()
    }
  }

  updateWeapon(delta: number) {
    if (this.meleeAnim > 0) {
      // quick knife swipe (takes priority over reload/idle pose)
      const t = 1 - this.meleeAnim / 0.22
      const slash = Math.sin(Math.min(1, t) * Math.PI)
      this.weapon.position.set(WEAPON_VIEW_X - slash * 0.12, WEAPON_VIEW_Y + slash * 0.06, WEAPON_VIEW_Z - slash * 0.18)
      this.weapon.rotation.set(-slash * 0.5, slash * 0.7, -slash * 0.9)
      this.weaponSpriteMat.opacity = 1
      return
    }
    if (this.ctx.reloading) {
      const p = 1 - this.ctx.reloadTimer / RELOAD_TIME
      const dip = Math.sin(Math.min(1, p) * Math.PI)
      this.weapon.position.set(WEAPON_VIEW_X + dip * 0.03, WEAPON_VIEW_Y - dip * 0.22, WEAPON_VIEW_Z + dip * 0.08)
      this.weapon.rotation.set(-dip * 0.45, dip * 0.24, dip * 0.2)
      const magOut = p < 0.5 ? p * 2 : (1 - p) * 2
      this.magazine.position.y = this.magBaseY - magOut * 0.28
      this.weaponSpriteMat.opacity = 0.72 + (1 - dip) * 0.28
      this.weaponRecoil = 0
      return
    }

    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * 0.5)
    this.magazine.position.y = this.magBaseY
    this.weaponSpriteMat.opacity = 1

    const moving = (this.ctx.move.forward || this.ctx.move.back || this.ctx.move.left || this.ctx.move.right) && this.ctx.canJump
    if (moving) this.bobTime += delta * 9
    const bobX = moving ? Math.cos(this.bobTime) * 0.008 : 0
    const bobY = moving ? Math.abs(Math.sin(this.bobTime)) * 0.01 : 0
    this.weapon.position.set(WEAPON_VIEW_X + bobX, WEAPON_VIEW_Y + bobY, WEAPON_VIEW_Z + this.weaponRecoil * 0.65)
    this.weapon.rotation.set(-this.weaponRecoil * 1.45, 0, this.weaponRecoil * 0.25)
  }

  resetView() {
    if (this.weapon) {
      this.weapon.position.set(WEAPON_VIEW_X, WEAPON_VIEW_Y, WEAPON_VIEW_Z)
      this.weapon.rotation.set(0, 0, 0)
      this.weaponSpriteMat.opacity = 1
      this.magazine.position.y = this.magBaseY
      this.applyWeaponModel(this.ctx.activeWeapon)
    }
  }
}
