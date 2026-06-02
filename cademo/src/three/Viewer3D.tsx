import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PartModel } from '../types'
import { buildPartGeometry } from './geometry'

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  group: THREE.Group
  grid: THREE.GridHelper | null
  raf: number
  plateKey: string
}

function disposeChildren(group: THREE.Object3D) {
  const trash: THREE.Object3D[] = []
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
    if (o !== group) trash.push(o)
  })
  trash.forEach((o) => o.parent?.remove(o))
}

function fitCamera(ctx: Ctx, geo: THREE.BufferGeometry) {
  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z)
  const fitH = maxSize / (2 * Math.atan((Math.PI * ctx.camera.fov) / 360))
  const fitW = fitH / ctx.camera.aspect
  const distance = 1.5 * Math.max(fitH, fitW)
  const dir = new THREE.Vector3(0.55, 0.6, 1).normalize()
  ctx.camera.position.copy(center).add(dir.multiplyScalar(distance))
  ctx.camera.near = Math.max(0.01, distance / 1000)
  ctx.camera.far = distance * 100
  ctx.camera.updateProjectionMatrix()
  // Let the zoom limits track the part size so large or tiny plates both frame.
  ctx.controls.maxDistance = Math.max(6000, distance * 6)
  ctx.controls.minDistance = Math.max(0.01, maxSize * 0.05)
  ctx.controls.target.copy(center)
  ctx.controls.update()
}

export default function Viewer3D({ model }: { model: PartModel }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<Ctx | null>(null)

  // ---- one-time scene setup ----------------------------------------------
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const width = mount.clientWidth || 1
    const height = mount.clientHeight || 1

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1017)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000)
    camera.position.set(120, 120, 180)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxDistance = 6000

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a2230, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.35)
    key.position.set(70, 140, 90)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-90, 50, -70)
    scene.add(fill)
    scene.add(new THREE.AmbientLight(0xffffff, 0.22))

    const group = new THREE.Group()
    scene.add(group)

    const ctx: Ctx = { renderer, scene, camera, controls, group, grid: null, raf: 0, plateKey: '' }
    ctxRef.current = ctx

    const animate = () => {
      ctx.raf = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(ctx.raf)
      ro.disconnect()
      controls.dispose()
      disposeChildren(group)
      if (ctx.grid) {
        ctx.grid.geometry.dispose()
        ;(ctx.grid.material as THREE.Material).dispose()
      }
      renderer.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      ctxRef.current = null
    }
  }, [])

  // ---- rebuild mesh whenever the model changes ---------------------------
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    disposeChildren(ctx.group)

    const geo = buildPartGeometry(model)
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b8cff, metalness: 0.15, roughness: 0.55 })
    ctx.group.add(new THREE.Mesh(geo, mat))

    const edges = new THREE.EdgesGeometry(geo, 30)
    ctx.group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x14223f })))

    const plateKey = `${model.plate.width}x${model.plate.height}x${model.plate.thickness}x${model.plate.cornerRadius}`
    if (plateKey !== ctx.plateKey) {
      if (ctx.grid) {
        ctx.scene.remove(ctx.grid)
        ctx.grid.geometry.dispose()
        ;(ctx.grid.material as THREE.Material).dispose()
      }
      const span = Math.max(model.plate.width, model.plate.height, 20) * 2
      const grid = new THREE.GridHelper(span, 20, 0x2a3550, 0x1b2236)
      grid.position.y = -model.plate.thickness / 2 - 0.4
      ctx.scene.add(grid)
      ctx.grid = grid
      fitCamera(ctx, geo)
      ctx.plateKey = plateKey
    }
  }, [model])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
