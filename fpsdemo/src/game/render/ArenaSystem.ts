import * as THREE from 'three'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'
import { ARENA_TEXTURES } from '../spriteAssets'
import { type ArenaMap, type ObstacleMat } from '../data/maps'
import { ARENA_HALF, PLAYER_HEIGHT, WALL_HEIGHT, WALL_THICKNESS } from '../constants'

export class ArenaSystem {
  arenaObjects: THREE.Mesh[] = []
  arenaMaterials: THREE.Material[] = []
  arenaTextures: THREE.Texture[] = []

  constructor(private ctx: GameContext, private sys: GameSystems) {}

  /** Tear down the current arena (meshes, materials, textures) so a new map can
   *  be built in its place. Leaves enemies, pickups, and the player untouched. */
  clearArena() {
    for (const o of this.arenaObjects) {
      this.ctx.scene.remove(o)
      o.geometry.dispose()
    }
    for (const m of this.arenaMaterials) m.dispose()
    for (const t of this.arenaTextures) t.dispose()
    // Strip the old arena solids from the shooting targets, keeping enemy hit
    // meshes (solidMeshes only ever holds arena geometry).
    if (this.ctx.solidMeshes.length) {
      const solidSet = new Set<THREE.Object3D>(this.ctx.solidMeshes)
      this.ctx.raycastTargets = this.ctx.raycastTargets.filter((o) => !solidSet.has(o))
    }
    this.arenaObjects = []
    this.arenaMaterials = []
    this.arenaTextures = []
    this.ctx.solidMeshes = []
    this.ctx.obstacleBoxes = []
  }

  /** Build (or rebuild) the arena from a map definition: theme + boundary walls
   *  + interior obstacles. All campaign maps share the 80x80 footprint. */
  buildArena(map: ArenaMap) {
    this.clearArena()
    this.ctx.currentMap = map
    const t = map.theme

    // --- theme: background, fog, rim lights ---
    const bg = new THREE.Color(t.bg)
    this.ctx.scene.background = bg
    if (this.ctx.scene.fog instanceof THREE.Fog) {
      this.ctx.scene.fog.color.copy(bg)
      this.ctx.scene.fog.near = t.fogNear
      this.ctx.scene.fog.far = t.fogFar
    } else {
      this.ctx.scene.fog = new THREE.Fog(bg.getHex(), t.fogNear, t.fogFar)
    }
    this.ctx.accentA.color.setHex(t.accentA.color)
    this.ctx.accentA.position.set(t.accentA.x, t.accentA.y, t.accentA.z)
    this.ctx.accentB.color.setHex(t.accentB.color)
    this.ctx.accentB.position.set(t.accentB.x, t.accentB.y, t.accentB.z)

    // --- materials ---
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.floor, ARENA_HALF / 3.5, ARENA_HALF / 3.5),
      color: t.floorTint, roughness: 0.9, metalness: 0.08,
    })
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.wall, 16, 1),
      color: t.wallTint, roughness: 0.65, metalness: 0.22,
    })
    const trimMat = new THREE.MeshStandardMaterial({ color: t.trim, emissive: t.trim, emissiveIntensity: 1.4 })
    const crateMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.block, 1, 1),
      color: t.wallTint, roughness: 0.72, metalness: 0.24,
    })
    const pillarMat = new THREE.MeshStandardMaterial({
      map: this.makeRepeatingTexture(ARENA_TEXTURES.column, 1, 3),
      color: t.wallTint, roughness: 0.58, metalness: 0.32,
    })
    this.arenaMaterials.push(floorMat, wallMat, trimMat, crateMat, pillarMat)

    // --- floor ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.ctx.scene.add(floor)
    this.arenaObjects.push(floor)

    // --- boundary walls (+ neon trim) ---
    const span = ARENA_HALF * 2 + WALL_THICKNESS
    const wallDefs: Array<[number, number, number, number]> = [
      [0, -ARENA_HALF, span, WALL_THICKNESS],
      [0, ARENA_HALF, span, WALL_THICKNESS],
      [-ARENA_HALF, 0, WALL_THICKNESS, span],
      [ARENA_HALF, 0, WALL_THICKNESS, span],
    ]
    for (const [x, z, w, d] of wallDefs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat)
      wall.position.set(x, WALL_HEIGHT / 2, z)
      wall.castShadow = true
      wall.receiveShadow = true
      wall.userData = { solid: true }
      this.ctx.scene.add(wall)
      this.ctx.solidMeshes.push(wall)
      this.arenaObjects.push(wall)

      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), trimMat)
      trim.position.set(x, WALL_HEIGHT + 0.05, z)
      this.ctx.scene.add(trim)
      this.arenaObjects.push(trim)
    }

    // --- interior obstacles ---
    const matFor = (m: ObstacleMat) => (m === 'pillar' ? pillarMat : m === 'wall' ? wallMat : crateMat)
    const groundTop = new Map<string, number>() // tracks box-top heights so stacks sit on top
    for (const o of map.obstacles) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), matFor(o.mat))
      const key = `${o.x}:${o.z}`
      let y = o.h / 2
      if (o.elevated) {
        y = (groundTop.get(key) ?? 0) + o.h / 2 // rest on the box below it
      } else {
        groundTop.set(key, o.h)
      }
      mesh.position.set(o.x, y, o.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { solid: true }
      this.ctx.scene.add(mesh)
      this.ctx.solidMeshes.push(mesh)
      this.arenaObjects.push(mesh)
      // Elevated boxes are decorative silhouette — drawn + shootable, not colliders.
      if (!o.elevated) this.ctx.obstacleBoxes.push(new THREE.Box3().setFromObject(mesh))
    }

    this.ctx.raycastTargets.push(...this.ctx.solidMeshes)
  }

  /** Position the player at the current map's spawn, facing the arena centre. */
  placeAtSpawn() {
    const s = this.ctx.currentMap.spawn
    this.ctx.velocity.set(0, 0, 0)
    this.ctx.canJump = false
    this.ctx.camera.position.set(s.x, PLAYER_HEIGHT, s.z)
    this.ctx.camera.rotation.set(0, 0, 0)
    if (Math.abs(s.x) < 0.001 && Math.abs(s.z) < 0.001) this.ctx.camera.lookAt(0, PLAYER_HEIGHT, -10)
    else this.ctx.camera.lookAt(0, PLAYER_HEIGHT, 0)
  }

  makeRepeatingTexture(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
    const tex = source.clone()
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatX, repeatY)
    tex.anisotropy = this.ctx.renderer.capabilities.getMaxAnisotropy()
    tex.needsUpdate = true
    this.arenaTextures.push(tex) // tracked so clearArena disposes the clone (not the shared source)
    return tex
  }

  makeGridTexture(): THREE.CanvasTexture {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1a2030'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#222a3d'
    ctx.fillRect(6, 6, size - 12, size - 12)
    ctx.strokeStyle = '#3da3c4'
    ctx.lineWidth = 4
    ctx.strokeRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(90,180,210,0.35)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const p = (size / 4) * i
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, size)
      ctx.moveTo(0, p)
      ctx.lineTo(size, p)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
}
