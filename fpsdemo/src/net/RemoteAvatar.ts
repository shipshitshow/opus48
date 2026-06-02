import * as THREE from 'three'
import { normalizePlayerAvatar, playerColorHex, type PlayerAvatarId } from './playerAvatars'

const HB_WIDTH = 1.4

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

interface AvatarBuild {
  bodyRadius: number
  bodyHeight: number
  chest: [number, number, number]
  shoulders: [number, number, number]
  armRadius: number
  helmet: 'round' | 'square' | 'visor' | 'medic'
  pack?: boolean
}

const AVATAR_BUILDS: Record<PlayerAvatarId, AvatarBuild> = {
  ranger: {
    bodyRadius: 0.34,
    bodyHeight: 0.95,
    chest: [0.72, 0.58, 0.34],
    shoulders: [0.34, 0.22, 0.32],
    armRadius: 0.1,
    helmet: 'visor',
    pack: true,
  },
  heavy: {
    bodyRadius: 0.44,
    bodyHeight: 1.05,
    chest: [0.88, 0.68, 0.42],
    shoulders: [0.46, 0.3, 0.42],
    armRadius: 0.13,
    helmet: 'square',
    pack: true,
  },
  scout: {
    bodyRadius: 0.29,
    bodyHeight: 0.9,
    chest: [0.58, 0.52, 0.3],
    shoulders: [0.26, 0.18, 0.28],
    armRadius: 0.08,
    helmet: 'round',
  },
  medic: {
    bodyRadius: 0.34,
    bodyHeight: 0.95,
    chest: [0.7, 0.58, 0.34],
    shoulders: [0.32, 0.22, 0.32],
    armRadius: 0.09,
    helmet: 'medic',
    pack: true,
  },
}

function material(color: number | THREE.Color, emissive?: THREE.Color | number, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: emissive ?? 0x000000,
    emissiveIntensity: intensity,
    roughness: 0.48,
    metalness: 0.38,
  })
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
  private visual = new THREE.Group()
  private color: THREE.Color

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

    this.group.add(bodyHit, headHit, this.visual)
    this.hitMeshes.push(bodyHit, headHit)
    this.rebuildVisual()

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
    this.redrawName()
    this.setHealth(info.health)
  }

  private disposeVisual() {
    this.visual.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m.dispose()
      }
    })
    this.visual.clear()
  }

  private rebuildVisual() {
    this.disposeVisual()

    const build = AVATAR_BUILDS[this.avatar]
    const suit = material(0x171b24)
    const armor = material(0x2a3140)
    const accent = material(this.color, this.color.clone().multiplyScalar(0.45), 1.2)
    const visor = material(0xf2f7ff, this.color, 1.8)
    const light = material(0xffffff, this.color, 2.4)
    const white = material(0xdbe6ef, this.color.clone().multiplyScalar(0.15), 0.4)

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(build.bodyRadius, build.bodyHeight, 8, 14), suit)
    body.position.y = 1.0
    body.castShadow = true

    const chest = new THREE.Mesh(new THREE.BoxGeometry(...build.chest), this.avatar === 'medic' ? white : armor)
    chest.position.set(0, 1.25, 0.02)
    chest.castShadow = true

    const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.045), accent)
    chestCore.position.set(0, 1.28, 0.22)

    const shoulderGeo = new THREE.BoxGeometry(...build.shoulders)
    const shoulderL = new THREE.Mesh(shoulderGeo, armor)
    shoulderL.position.set(-build.chest[0] * 0.56, 1.48, 0)
    const shoulderR = new THREE.Mesh(shoulderGeo, armor)
    shoulderR.position.set(build.chest[0] * 0.56, 1.48, 0)

    const armGeo = new THREE.CapsuleGeometry(build.armRadius, 0.58, 5, 10)
    const armL = new THREE.Mesh(armGeo, suit)
    armL.position.set(-build.chest[0] * 0.66, 1.06, 0.02)
    armL.rotation.z = 0.08
    const armR = new THREE.Mesh(armGeo, suit)
    armR.position.set(build.chest[0] * 0.66, 1.06, 0.02)
    armR.rotation.z = -0.08

    const legGeo = new THREE.CapsuleGeometry(build.bodyRadius * 0.34, 0.55, 5, 9)
    const legL = new THREE.Mesh(legGeo, suit)
    legL.position.set(-build.bodyRadius * 0.45, 0.38, 0)
    const legR = new THREE.Mesh(legGeo, suit)
    legR.position.set(build.bodyRadius * 0.45, 0.38, 0)

    const helmet =
      build.helmet === 'square'
        ? new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.5), armor)
        : new THREE.Mesh(new THREE.SphereGeometry(build.helmet === 'round' ? 0.29 : 0.33, 16, 12), armor)
    helmet.position.y = 1.93
    helmet.castShadow = true

    const visorBar = new THREE.Mesh(new THREE.BoxGeometry(build.helmet === 'square' ? 0.42 : 0.36, 0.11, 0.055), visor)
    visorBar.position.set(0, 1.95, 0.31)

    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.045), accent)
    antenna.position.set(build.helmet === 'round' ? 0.2 : 0.27, 2.28, 0)

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, this.avatar === 'heavy' ? 0.72 : 0.58), material(0x10131a))
    gun.position.set(0.34, 1.17, -0.34)
    gun.rotation.y = -0.08

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), light)
    muzzle.position.set(0.34, 1.17, -0.72)

    this.visual.add(body, chest, chestCore, shoulderL, shoulderR, armL, armR, legL, legR, helmet, visorBar, antenna, gun, muzzle)

    if (build.pack) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.2), armor)
      pack.position.set(0, 1.2, -0.28)
      this.visual.add(pack)
    }

    if (this.avatar === 'medic') {
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.055), accent)
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.055), accent)
      crossV.position.set(0, 1.3, 0.25)
      crossH.position.set(0, 1.3, 0.255)
      this.visual.add(crossV, crossH)
    }

    for (const child of this.visual.children) {
      if (child instanceof THREE.Mesh) child.castShadow = true
    }
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
    const nextSlot = slot || this.slot
    const visualChanged = nextAvatar !== this.avatar || nextSlot !== this.slot
    this.name = name
    this.kills = kills
    this.avatar = nextAvatar
    this.slot = nextSlot
    if (visualChanged) {
      this.color = new THREE.Color(playerColorHex(this.slot, this.id))
      this.rebuildVisual()
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

  update(delta: number, cameraQuat: THREE.Quaternion) {
    const k = 1 - Math.pow(0.001, delta)
    this.group.position.lerp(this.target, k)
    let dy = this.targetYaw - this.group.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    this.group.rotation.y += dy * k
    this.billboard.quaternion.copy(cameraQuat)
    this.nameSprite.quaternion.copy(cameraQuat)
  }

  dispose() {
    this.disposeVisual()
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m.dispose()
      } else if (o instanceof THREE.Sprite) {
        o.material.map?.dispose()
        o.material.dispose()
      }
    })
  }
}
