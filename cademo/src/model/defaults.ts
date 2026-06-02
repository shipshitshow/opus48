import type { PartModel, Units } from '../types'

let idCounter = 0
/** Stable, collision-free id generator for holes/labels created in-app. */
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

/** Largest legal corner radius for a given plate (can't exceed half the short side). */
export function maxCornerRadius(width: number, height: number): number {
  return Math.max(0, Math.min(width, height) / 2)
}

export function unitLabel(u: Units): string {
  return u
}

export const DEFAULT_MODEL: PartModel = {
  partName: 'untitled-part',
  units: 'mm',
  plate: { shape: 'rect', width: 120, height: 72, thickness: 4, cornerRadius: 6 },
  holes: [
    { id: 'hole-1', kind: 'circle', diameter: 6, x: 18, y: 18, group: 'row' },
    { id: 'hole-2', kind: 'circle', diameter: 6, x: 102, y: 18, group: 'row' },
    { id: 'slot-1', kind: 'slot', width: 32, height: 10, x: 60, y: 52, group: 'free' },
  ],
  labels: [{ id: 'label-1', text: 'PocketCAD', x: 60, y: 36, size: 8 }],
}

export function cloneModel(m: PartModel): PartModel {
  return {
    partName: m.partName,
    units: m.units,
    plate: { ...m.plate },
    holes: m.holes.map((h) => ({ ...h })),
    labels: m.labels.map((l) => ({ ...l })),
  }
}
