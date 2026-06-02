import * as THREE from 'three'
import type { PartModel } from '../types'

/** CCW point loop for a rounded rectangle from (0,0) to (w,h). */
function roundedRectPoints(w: number, h: number, r: number, seg = 10): THREE.Vector2[] {
  const rr = Math.min(r, Math.min(w, h) / 2)
  if (rr <= 1e-4) {
    return [new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h), new THREE.Vector2(0, h)]
  }
  const pts: THREE.Vector2[] = []
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg)
      pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)))
    }
  }
  arc(w - rr, rr, -Math.PI / 2, 0) // bottom-right
  arc(w - rr, h - rr, 0, Math.PI / 2) // top-right
  arc(rr, h - rr, Math.PI / 2, Math.PI) // top-left
  arc(rr, rr, Math.PI, 1.5 * Math.PI) // bottom-left
  return pts
}

/** Clockwise circle loop (opposite winding to the CCW outer contour → a hole). */
function circlePointsCW(cx: number, cy: number, radius: number, seg = 48): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < seg; i++) {
    const a = -(i / seg) * Math.PI * 2
    pts.push(new THREE.Vector2(cx + radius * Math.cos(a), cy + radius * Math.sin(a)))
  }
  return pts
}

/** Counter-clockwise circle loop for the outer contour of a circular plate. */
function circlePointsCCW(cx: number, cy: number, radius: number, seg = 96): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push(new THREE.Vector2(cx + radius * Math.cos(a), cy + radius * Math.sin(a)))
  }
  return pts
}

/**
 * Build a centered, flat-lying extruded geometry of the part. Holes and the
 * slot are cut through the plate. Returns geometry centered at the origin with
 * the plate lying on the XZ ground plane (thickness along +/-Y).
 */
export function buildPartGeometry(part: PartModel): THREE.ExtrudeGeometry {
  const { plate } = part
  const shape =
    plate.shape === 'circle'
      ? new THREE.Shape(circlePointsCCW(plate.width / 2, plate.height / 2, plate.width / 2))
      : new THREE.Shape(roundedRectPoints(plate.width, plate.height, plate.cornerRadius))

  for (const hole of part.holes) {
    if (hole.kind === 'circle') {
      const path = new THREE.Path(circlePointsCW(hole.x, hole.y, Math.max(0.05, hole.diameter / 2)))
      shape.holes.push(path)
    } else {
      // Stadium = rounded rect whose corner radius equals half the short side.
      const rr = Math.min(hole.width, hole.height) / 2
      const pts = roundedRectPoints(hole.width, hole.height, rr)
        .map((p) => new THREE.Vector2(p.x + hole.x - hole.width / 2, p.y + hole.y - hole.height / 2))
        .reverse() // reverse CCW -> CW so it reads as a hole
      shape.holes.push(new THREE.Path(pts))
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: plate.thickness,
    bevelEnabled: false,
    curveSegments: 24,
  })
  geo.center()
  geo.rotateX(-Math.PI / 2) // lay flat: plate face on XZ, thickness along Y
  geo.computeVertexNormals()
  return geo
}
