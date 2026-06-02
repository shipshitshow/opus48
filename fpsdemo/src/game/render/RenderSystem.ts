import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import type { GameContext } from '../context'
import type { GameSystems } from '../systems'

/** Owns the renderer/scene/camera/controls bootstrap and the per-frame draw. */
export class RenderSystem {
  constructor(private ctx: GameContext, private sys: GameSystems) {}

  setupRenderer() {
    this.ctx.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.ctx.renderer.setSize(this.ctx.container.clientWidth, this.ctx.container.clientHeight)
    this.ctx.renderer.shadowMap.enabled = true
    this.ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.ctx.renderer.toneMappingExposure = 1.15
    this.ctx.container.appendChild(this.ctx.renderer.domElement)
  }

  setupScene() {
    this.ctx.scene = new THREE.Scene()
    const bg = new THREE.Color(0x0e1320)
    this.ctx.scene.background = bg
    this.ctx.scene.fog = new THREE.Fog(bg.getHex(), 35, 170)

    this.ctx.camera = new THREE.PerspectiveCamera(75, this.ctx.container.clientWidth / this.ctx.container.clientHeight, 0.05, 500)
    this.ctx.controls = new PointerLockControls(this.ctx.camera, this.ctx.renderer.domElement)
    this.ctx.scene.add(this.ctx.camera)

    this.ctx.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x202028, 1.1))
    this.ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.35))

    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.position.set(38, 58, 22)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 200
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    sun.shadow.bias = -0.0004
    this.ctx.scene.add(sun)
    this.ctx.scene.add(sun.target)

    // Two coloured rim lights — recoloured/repositioned per map by buildArena.
    this.ctx.accentA = new THREE.PointLight(0x00d8ff, 60, 90, 2)
    this.ctx.accentA.position.set(-28, 8, -28)
    this.ctx.scene.add(this.ctx.accentA)
    this.ctx.accentB = new THREE.PointLight(0xff4d6d, 60, 90, 2)
    this.ctx.accentB.position.set(28, 8, 28)
    this.ctx.scene.add(this.ctx.accentB)
  }

  render() {
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera)
  }
}
