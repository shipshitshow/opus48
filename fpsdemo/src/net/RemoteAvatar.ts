import * as THREE from 'three'
import { PLAYER_AVATAR_SPRITES } from '../game/spriteAssets'
import { normalizePlayerAvatar, playerColorHex, type PlayerAvatarId } from './playerAvatars'

const HB_WIDTH = 1.4
type PlayerSpriteView = 'front' | 'side' | 'back'

interface RemoteAvatarInfo {
  id: string
  name: string
  avatar?: string
  slot?: number
  x: number
  y: number
  z: number
  yaw: number
  health: number
  kills: number
}

const AVATAR_SCALES: Record<PlayerAvatarId, Record<PlayerSpriteView, [number, number]>> = {
  ranger: {
    front: [1.32, 2.34],
    side: [1.54, 2.34],
    back: [1.34, 2.34],
  },
  heavy: {
    front: [1.55, 2.48],
    side: [1.82, 2.48],
    back: [1.56, 2.48],
  },
  scout: {
    front: [1.14, 2.26],
    side: [1.64, 2.26],
    back: [1.14, 2.26],
  },
  medic: {
    front: [1.18, 2.32],
    side: [1.7, 2.32],
    back: [1.2, 2.32],
  },
}

/**
 * Another player in the room. The Game lerps it toward the latest networked
 * transform and billboards its nametag / health bar at the camera. Its hidden
 * body and head meshes are registered as raycast targets (userData.remoteId).
 */
export class RemoteAvatar {
  readonly group = new THREE.Group()
  readonly hitMeshes: THREE.Mesh[] = []
  readonly id: string

  name: string
  kills = 0
  health = 100
  avatar: PlayerAvatarId
  slot: number

  private target = new THREE.Vector3()
  private targetYaw = 0
  private nameSprite: THREE.Sprite
  private nameTex: THREE.CanvasTexture
  private nameCanvas: HTMLCanvasElement
  private healthFill: THREE.Mesh
  private billboard = new THREE.Group()
  private spriteMat: THREE.SpriteMaterial
  private sprite: THREE.Sprite
  private spriteView: PlayerSpriteView = 'front'
  private spriteFlip = 1
  private color: THREE.Color
  private tint = new THREE.Color()
  private slotRing: THREE.Mesh
  private shadow: THREE.Mesh

  constructor(info: RemoteAvatarInfo) {
    this.id = info.id
    this.name = info.name
    this.kills = info.kills
    this.health = info.health
    this.avatar = normalizePlayerAvatar(info.avatar)
    this.slot = info.slot ?? 0
    this.color = new THREE.Color(playerColorHex(this.slot, info.id))

    const bodyHit = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.1, 6, 12), new THREE.MeshBasicMaterial())
    bodyHit.visible = false
    bodyHit.position.y = 1.0
    bodyHit.userData = { remoteId: info.id, part: 'body' }

    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial())
    headHit.visible = false
    headHit.position.y = 1.95
    headHit.userData = { remoteId: info.id, part: 'head' }

    this.spriteMat = new THREE.SpriteMaterial({
      map: PLAYER_AVATAR_SPRITES[this.avatar].front,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.055,
      depthWrite: true,
      toneMapped: false,
    })
    this.sprite = new THREE.Sprite(this.spriteMat)
    this.sprite.center.set(0.5, 0)
    this.sprite.position.y = 0

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.015

    this.slotRing = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.68, 40),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.slotRing.rotation.x = -Math.PI / 2
    this.slotRing.position.y = 0.025

    this.group.add(this.shadow, this.slotRing, bodyHit, headHit, this.sprite)
    this.hitMeshes.push(bodyHit, headHit)

    this.nameCanvas = document.createElement('canvas')
    this.nameCanvas.width = 320
    this.nameCanvas.height = 72
    this.nameTex = new THREE.CanvasTexture(this.nameCanvas)
    this.nameTex.colorSpace = THREE.SRGBColorSpace
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTex, transparent: true, depthTest: false }))
    this.nameSprite.scale.set(2.7, 0.6, 1)
    this.nameSprite.position.y = 3.02

    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(HB_WIDTH + 0.08, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
    )
    this.healthFill = new THREE.Mesh(new THREE.PlaneGeometry(HB_WIDTH, 0.13), new THREE.MeshBasicMaterial({ color: 0x39d353 }))
    this.healthFill.position.z = 0.001
    this.billboard.add(barBg, this.healthFill)
    this.billboard.position.y = 2.58
    this.group.add(this.billboard)
    this.group.add(this.nameSprite)

    this.group.position.set(info.x, info.y - 1.8, info.z)
    this.target.copy(this.group.position)
    this.targetYaw = info.yaw
    this.group.rotation.y = info.yaw
    this.applyTeamColor()
    this.applySprite('front')
    this.redrawName()
    this.setHealth(info.health)
  }

  private applyTeamColor() {
    this.color.setHex(playerColorHex(this.slot, this.id))
    this.tint.setHex(0xffffff).lerp(this.color, 0.28)
    this.spriteMat.color.copy(this.tint)
    ;(this.slotRing.material as THREE.MeshBasicMaterial).color.copy(this.color)
  }

  private applySprite(view: PlayerSpriteView = this.spriteView, flip = this.spriteFlip, elapsed = 0, moving = false) {
    const texture = PLAYER_AVATAR_SPRITES[this.avatar][view]
    if (this.spriteMat.map !== texture) {
      this.spriteMat.map = texture
      this.spriteMat.needsUpdate = true
    }

    this.spriteView = view
    this.spriteFlip = flip

    const [baseW, baseH] = AVATAR_SCALES[this.avatar][view]
    const step = moving ? Math.sin(elapsed * 9) : 0
    const squash = Math.abs(step)
    this.spriteMat.rotation = moving ? step * 0.025 * flip : 0
    this.sprite.scale.set(baseW * (1 + squash * 0.018) * flip, baseH * (1 - squash * 0.022), 1)
    this.sprite.position.y = moving ? squash * 0.025 : 0
  }

  private chooseSpriteFrame(cameraPos: THREE.Vector3): { view: PlayerSpriteView; flip: number } {
    const pos = this.group.position
    const vx = cameraPos.x - pos.x
    const vz = cameraPos.z - pos.z
    const dist = Math.hypot(vx, vz)
    if (dist < 0.0001) return { view: this.spriteView, flip: this.spriteFlip }

    const toCameraX = vx / dist
    const toCameraZ = vz / dist
    const yaw = this.group.rotation.y
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const dot = forwardX * toCameraX + forwardZ * toCameraZ
    if (dot > 0.48) return { view: 'front', flip: 1 }
    if (dot < -0.48) return { view: 'back', flip: 1 }

    const cross = forwardX * toCameraZ - forwardZ * toCameraX
    return { view: 'side', flip: cross >= 0 ? 1 : -1 }
  }

  setTarget(x: number, y: number, z: number, yaw: number) {
    this.target.set(x, y - 1.8, z)
    this.targetYaw = yaw
  }

  setHealth(h: number) {
    this.health = h
    const frac = Math.max(0, Math.min(1, h / 100))
    this.healthFill.scale.x = frac
    this.healthFill.position.x = -(HB_WIDTH / 2) * (1 - frac)
    ;(this.healthFill.material as THREE.MeshBasicMaterial).color.setHSL(0.33 * frac, 0.75, 0.5)
  }

  setMeta(name: string, kills: number, avatar?: string, slot?: number) {
    const nextAvatar = avatar === undefined ? this.avatar : normalizePlayerAvatar(avatar)
    const nextSlot = slot ?? this.slot
    const visualChanged = nextAvatar !== this.avatar || nextSlot !== this.slot
    this.name = name
    this.kills = kills
    this.avatar = nextAvatar
    this.slot = nextSlot
    if (visualChanged) {
      this.applyTeamColor()
      this.applySprite()
    }
    this.redrawName()
  }

  private redrawName() {
    const ctx = this.nameCanvas.getContext('2d')!
    ctx.clearRect(0, 0, 320, 72)
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const slot = this.slot > 0 ? `P${this.slot}  ` : ''
    const label = `${slot}${this.name}  ·  ${this.kills}`
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(0,0,0,0.88)'
    ctx.strokeText(label, 160, 36)
    ctx.fillStyle = '#' + this.color.getHexString()
    ctx.fillText(label, 160, 36)
    this.nameTex.needsUpdate = true
  }

  update(delta: number, cameraQuat: THREE.Quaternion, cameraPos: THREE.Vector3) {
    const beforeX = this.group.position.x
    const beforeZ = this.group.position.z
    const k = 1 - Math.pow(0.001, delta)
    this.group.position.lerp(this.target, k)
    let dy = this.targetYaw - this.group.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    this.group.rotation.y += dy * k

    const frame = this.chooseSpriteFrame(cameraPos)
    const moved = Math.hypot(this.group.position.x - beforeX, this.group.position.z - beforeZ) > 0.002
    this.applySprite(frame.view, frame.flip, performance.now() * 0.001, moved)

    this.billboard.quaternion.copy(cameraQuat)
    this.nameSprite.quaternion.copy(cameraQuat)
  }

  dispose() {
    for (const hit of this.hitMeshes) {
      hit.geometry.dispose()
      const mat = hit.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
    for (const child of [...this.billboard.children]) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mat = child.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    }
    this.shadow.geometry.dispose()
    ;(this.shadow.material as THREE.Material).dispose()
    this.slotRing.geometry.dispose()
    ;(this.slotRing.material as THREE.Material).dispose()
    this.spriteMat.dispose()
    this.nameTex.dispose()
    this.nameSprite.material.dispose()
  }
}
