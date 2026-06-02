import * as THREE from 'three'

const HB_WIDTH = 1.4

function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

/**
 * Another player in the room. The Game lerps it toward the latest networked
 * transform and billboards its nametag / health bar at the camera. Its body and
 * head are registered as raycast targets (userData.remoteId) so it can be shot.
 */
export class RemoteAvatar {
  readonly group = new THREE.Group()
  readonly hitMeshes: THREE.Mesh[] = []
  readonly id: string

  name: string
  kills = 0
  health = 100

  private target = new THREE.Vector3()
  private targetYaw = 0
  private nameSprite: THREE.Sprite
  private nameTex: THREE.CanvasTexture
  private nameCanvas: HTMLCanvasElement
  private healthFill: THREE.Mesh
  private billboard = new THREE.Group()
  private color: THREE.Color

  constructor(info: { id: string; name: string; x: number; y: number; z: number; yaw: number; health: number; kills: number }) {
    this.id = info.id
    this.name = info.name
    this.kills = info.kills
    this.health = info.health
    this.color = new THREE.Color().setHSL(hueFromId(info.id) / 360, 0.7, 0.55)

    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color.clone().multiplyScalar(0.3),
      roughness: 0.5,
      metalness: 0.3,
    })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 12), bodyMat)
    body.position.y = 1.0
    body.castShadow = true
    body.userData = { remoteId: info.id, part: 'body' }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.4, metalness: 0.5 }))
    head.position.y = 1.95
    head.castShadow = true
    head.userData = { remoteId: info.id, part: 'head' }

    // visor + a little gun nub so you can read facing
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: this.color, emissiveIntensity: 1.4 }),
    )
    visor.position.set(0, 1.98, 0.3)
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.7, roughness: 0.4 }))
    gun.position.set(0.28, 1.2, -0.35)

    this.group.add(body, head, visor, gun)
    this.hitMeshes.push(body, head)

    // billboarded nametag + health bar
    this.nameCanvas = document.createElement('canvas')
    this.nameCanvas.width = 256
    this.nameCanvas.height = 64
    this.nameTex = new THREE.CanvasTexture(this.nameCanvas)
    this.nameTex.colorSpace = THREE.SRGBColorSpace
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTex, transparent: true, depthTest: false }))
    this.nameSprite.scale.set(2.2, 0.55, 1)
    this.nameSprite.position.y = 2.95

    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(HB_WIDTH + 0.08, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
    )
    this.healthFill = new THREE.Mesh(new THREE.PlaneGeometry(HB_WIDTH, 0.13), new THREE.MeshBasicMaterial({ color: 0x39d353 }))
    this.healthFill.position.z = 0.001
    this.billboard.add(barBg, this.healthFill)
    this.billboard.position.y = 2.55
    this.group.add(this.billboard)
    this.group.add(this.nameSprite)

    this.group.position.set(info.x, info.y - 1.8, info.z) // group origin at feet
    this.target.copy(this.group.position)
    this.targetYaw = info.yaw
    this.group.rotation.y = info.yaw
    this.redrawName()
    this.setHealth(info.health)
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

  setMeta(name: string, kills: number) {
    this.name = name
    this.kills = kills
    this.redrawName()
  }

  private redrawName() {
    const ctx = this.nameCanvas.getContext('2d')!
    ctx.clearRect(0, 0, 256, 64)
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = `${this.name}  ·  ${this.kills}`
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(label, 128, 32)
    ctx.fillStyle = '#' + this.color.getHexString()
    ctx.fillText(label, 128, 32)
    this.nameTex.needsUpdate = true
  }

  update(delta: number, cameraQuat: THREE.Quaternion) {
    const k = 1 - Math.pow(0.001, delta) // smooth, framerate-independent lerp
    this.group.position.lerp(this.target, k)
    // shortest-arc yaw lerp
    let dy = this.targetYaw - this.group.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    this.group.rotation.y += dy * k
    this.billboard.quaternion.copy(cameraQuat)
  }

  dispose() {
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
