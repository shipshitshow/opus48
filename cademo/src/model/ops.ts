import type { CircleHole, Controls, Hole, PartModel, PlateShape, SlotHole } from '../types'
import { clamp, cloneModel, maxCornerRadius, nextId } from './defaults'

const r3 = (n: number) => Math.round(n * 1000) / 1000
const BIG = 100000

export const isCircle = (h: Hole): h is CircleHole => h.kind === 'circle'
export const isSlot = (h: Hole): h is SlotHole => h.kind === 'slot'
const isRow = (h: Hole): h is CircleHole => h.kind === 'circle' && h.group === 'row'
const isBolt = (h: Hole): h is CircleHole => h.kind === 'circle' && h.group === 'bolt'
const isBore = (h: Hole): h is CircleHole => h.kind === 'circle' && h.group === 'bore'

export function plateCenter(m: PartModel): [number, number] {
  return [m.plate.width / 2, m.plate.height / 2]
}

/** Derive the flat property-panel controls from the authoritative model. */
export function deriveControls(m: PartModel): Controls {
  const [cx, cy] = plateCenter(m)
  const row = m.holes.filter(isRow)
  const bolts = m.holes.filter(isBolt)
  const bore = m.holes.find(isBore)
  const slots = m.holes.filter(isSlot)

  let holeSpacing = 30
  if (row.length >= 2) {
    const xs = row.map((c) => c.x).sort((a, b) => a - b)
    holeSpacing = r3((xs[xs.length - 1] - xs[0]) / (row.length - 1))
  }

  let boltCircleDiameter = r3(Math.min(m.plate.width, m.plate.height) * 0.7)
  let boltStartAngle = 45
  if (bolts.length) {
    const b0 = bolts[0]
    boltCircleDiameter = r3(2 * Math.hypot(b0.x - cx, b0.y - cy))
    boltStartAngle = r3(((Math.atan2(b0.y - cy, b0.x - cx) * 180) / Math.PI + 360) % 360)
  }

  return {
    shape: m.plate.shape,
    plateWidth: m.plate.width,
    plateHeight: m.plate.height,
    diameter: m.plate.width,
    cornerRadius: m.plate.cornerRadius,
    thickness: m.plate.thickness,
    holeCount: row.length,
    holeDiameter: row[0]?.diameter ?? 6,
    holeSpacing,
    slotWidth: slots[0]?.width ?? 32,
    slotHeight: slots[0]?.height ?? 10,
    hasSlot: slots.length > 0,
    boreDiameter: bore?.diameter ?? r3(Math.min(m.plate.width, m.plate.height) * 0.3),
    boltCount: bolts.length,
    boltCircleDiameter,
    boltHoleDiameter: bolts[0]?.diameter ?? 1,
    boltStartAngle,
  }
}

// ---- plate edits ----------------------------------------------------------

export function setShape(m: PartModel, shape: PlateShape): PartModel {
  const next = cloneModel(m)
  next.plate.shape = shape
  if (shape === 'circle') {
    // Treat current width as the diameter; force a square bounding box.
    next.plate.height = next.plate.width
  }
  return next
}

export function setPlateWidth(m: PartModel, v: number): PartModel {
  const next = cloneModel(m)
  next.plate.width = clamp(v, 1, BIG)
  next.plate.cornerRadius = Math.min(next.plate.cornerRadius, maxCornerRadius(next.plate.width, next.plate.height))
  return next
}

export function setPlateHeight(m: PartModel, v: number): PartModel {
  const next = cloneModel(m)
  next.plate.height = clamp(v, 1, BIG)
  next.plate.cornerRadius = Math.min(next.plate.cornerRadius, maxCornerRadius(next.plate.width, next.plate.height))
  return next
}

/** Circular plate: set the diameter (keeps the bounding box square). */
export function setDiameter(m: PartModel, v: number): PartModel {
  const next = cloneModel(m)
  const d = clamp(v, 1, BIG)
  next.plate.width = d
  next.plate.height = d
  return next
}

export function setThickness(m: PartModel, v: number): PartModel {
  const next = cloneModel(m)
  next.plate.thickness = clamp(v, 0.05, BIG)
  return next
}

export function setCornerRadius(m: PartModel, v: number): PartModel {
  const next = cloneModel(m)
  next.plate.cornerRadius = clamp(v, 0, maxCornerRadius(next.plate.width, next.plate.height))
  return next
}

// ---- linear mount-hole row (rect) -----------------------------------------

function circleRow(width: number, height: number, count: number, spacing: number, diameter: number, y: number): CircleHole[] {
  const n = clamp(Math.round(count), 0, 200)
  const s = clamp(spacing, 0, BIG)
  const d = clamp(diameter, 0.05, BIG)
  const total = (n - 1) * s
  const startX = width / 2 - total / 2
  const out: CircleHole[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      id: nextId('hole'),
      kind: 'circle',
      diameter: d,
      x: r3(clamp(startX + i * s, 0, width)),
      y: r3(clamp(y, 0, height)),
      group: 'row',
    })
  }
  return out
}

function regenerateRow(m: PartModel, override: Partial<Controls>): PartModel {
  const c = { ...deriveControls(m), ...override }
  const existing = m.holes.filter(isRow)
  const rowY = existing[0]?.y ?? Math.min(18, m.plate.height / 4)
  const next = cloneModel(m)
  const others = next.holes.filter((h) => !isRow(h))
  next.holes = [...others, ...circleRow(m.plate.width, m.plate.height, c.holeCount, c.holeSpacing, c.holeDiameter, rowY)]
  return next
}

export const setHoleCount = (m: PartModel, count: number) => regenerateRow(m, { holeCount: count })
export const setHoleSpacing = (m: PartModel, spacing: number) => regenerateRow(m, { holeSpacing: spacing })

export function setHoleDiameter(m: PartModel, diameter: number): PartModel {
  const d = clamp(diameter, 0.05, BIG)
  const next = cloneModel(m)
  next.holes = next.holes.map((h) => (isRow(h) ? { ...h, diameter: d } : h))
  return next
}

// ---- bolt circle (flange) -------------------------------------------------

export function boltCircleHoles(
  cx: number,
  cy: number,
  count: number,
  circleDiameter: number,
  holeDiameter: number,
  startAngleDeg: number,
): CircleHole[] {
  const n = clamp(Math.round(count), 0, 200)
  const r = Math.max(0, circleDiameter / 2)
  const d = clamp(holeDiameter, 0.05, BIG)
  const out: CircleHole[] = []
  for (let i = 0; i < n; i++) {
    const a = ((startAngleDeg + (i * 360) / n) * Math.PI) / 180
    out.push({ id: nextId('bolt'), kind: 'circle', diameter: d, x: r3(cx + r * Math.cos(a)), y: r3(cy + r * Math.sin(a)), group: 'bolt' })
  }
  return out
}

function regenerateBolt(m: PartModel, override: Partial<Controls>): PartModel {
  const c = { ...deriveControls(m), ...override }
  const [cx, cy] = plateCenter(m)
  const next = cloneModel(m)
  const others = next.holes.filter((h) => !isBolt(h))
  next.holes = [...others, ...boltCircleHoles(cx, cy, c.boltCount, c.boltCircleDiameter, c.boltHoleDiameter, c.boltStartAngle)]
  return next
}

export const setBoltCount = (m: PartModel, v: number) => regenerateBolt(m, { boltCount: v })
export const setBoltCircleDiameter = (m: PartModel, v: number) => regenerateBolt(m, { boltCircleDiameter: v })
export const setBoltStartAngle = (m: PartModel, v: number) => regenerateBolt(m, { boltStartAngle: v })

export function setBoltHoleDiameter(m: PartModel, v: number): PartModel {
  const d = clamp(v, 0.05, BIG)
  const next = cloneModel(m)
  next.holes = next.holes.map((h) => (isBolt(h) ? { ...h, diameter: d } : h))
  return next
}

// ---- central bore (flange) ------------------------------------------------

export function setBore(m: PartModel, diameter: number): PartModel {
  const [cx, cy] = plateCenter(m)
  const d = clamp(diameter, 0.05, BIG)
  const next = cloneModel(m)
  const bore = next.holes.find(isBore)
  if (bore) bore.diameter = d
  else next.holes.unshift({ id: nextId('bore'), kind: 'circle', diameter: d, x: r3(cx), y: r3(cy), group: 'bore' })
  return next
}

// ---- slot edits -----------------------------------------------------------

/** Resize the first slot. No-op when there is no slot (use addSlot to create). */
export function setSlotSize(m: PartModel, width: number, height: number): PartModel {
  const firstSlot = m.holes.find(isSlot)
  if (!firstSlot) return m
  const next = cloneModel(m)
  const slot = next.holes.find(isSlot)!
  slot.width = clamp(width, 0.5, BIG)
  slot.height = clamp(height, 0.5, BIG)
  return next
}

// ---- per-element edits (selection / drag) ---------------------------------

export function moveElement(m: PartModel, id: string, x: number, y: number): PartModel {
  const next = cloneModel(m)
  const hole = next.holes.find((h) => h.id === id)
  if (hole) {
    hole.x = r3(clamp(x, 0, m.plate.width))
    hole.y = r3(clamp(y, 0, m.plate.height))
    return next
  }
  const label = next.labels.find((l) => l.id === id)
  if (label) {
    label.x = r3(clamp(x, 0, m.plate.width))
    label.y = r3(clamp(y, 0, m.plate.height))
    return next
  }
  return m
}

export type HolePatch = { diameter?: number; width?: number; height?: number; x?: number; y?: number }

export function updateHole(m: PartModel, id: string, patch: HolePatch): PartModel {
  const next = cloneModel(m)
  const hole = next.holes.find((h) => h.id === id)
  if (!hole) return m
  if (hole.kind === 'circle') {
    if (patch.diameter !== undefined) hole.diameter = clamp(patch.diameter, 0.05, BIG)
  } else {
    if (patch.width !== undefined) hole.width = clamp(patch.width, 0.5, BIG)
    if (patch.height !== undefined) hole.height = clamp(patch.height, 0.5, BIG)
  }
  if (patch.x !== undefined) hole.x = r3(clamp(patch.x, 0, m.plate.width))
  if (patch.y !== undefined) hole.y = r3(clamp(patch.y, 0, m.plate.height))
  return next
}

export function updateLabel(m: PartModel, id: string, patch: Partial<{ text: string; size: number }>): PartModel {
  const next = cloneModel(m)
  const label = next.labels.find((l) => l.id === id)
  if (!label) return m
  if (patch.text !== undefined) label.text = patch.text
  if (patch.size !== undefined) label.size = clamp(patch.size, 0.2, BIG)
  return next
}

export function addCircleHole(m: PartModel): PartModel {
  const [cx, cy] = plateCenter(m)
  const next = cloneModel(m)
  next.holes.push({ id: nextId('hole'), kind: 'circle', diameter: m.units === 'in' ? 0.5 : 6, x: r3(cx), y: r3(cy), group: 'free' })
  return next
}

export function addSlot(m: PartModel): PartModel {
  const [cx, cy] = plateCenter(m)
  const next = cloneModel(m)
  const big = m.units === 'in' ? 2 : 30
  next.holes.push({ id: nextId('slot'), kind: 'slot', width: big, height: big / 3, x: r3(cx), y: r3(cy), group: 'free' })
  return next
}

export function removeElement(m: PartModel, id: string): PartModel {
  const next = cloneModel(m)
  next.holes = next.holes.filter((h) => h.id !== id)
  next.labels = next.labels.filter((l) => l.id !== id)
  return next
}
