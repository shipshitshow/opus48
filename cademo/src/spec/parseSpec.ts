import { parse as parseYaml } from 'yaml'
import type { Hole, Label, ParseResult, PartModel, PlateShape, Units } from '../types'
import { clamp, maxCornerRadius, nextId } from '../model/defaults'
import { boltCircleHoles } from '../model/ops'

const MAX_HOLES = 500
const MAX_LABELS = 200

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function num(v: unknown, fallback: number): number {
  const n = numOrNull(v)
  return n === null ? fallback : n
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/**
 * Parse a pasted PocketCAD spec (YAML-flavoured) into a normalised PartModel.
 * Tolerant: missing fields fall back to sensible defaults and out-of-range
 * values are clamped, with human-readable warnings collected along the way.
 */
export function parseSpec(text: string): ParseResult {
  const warnings: string[] = []

  if (!text.trim()) {
    return { model: null, warnings, error: 'Spec is empty — paste a part spec or load a sample.' }
  }

  let raw: Record<string, unknown>
  try {
    const parsed = parseYaml(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { model: null, warnings, error: 'Spec must be a key/value document (e.g. "plate:" with nested fields).' }
    }
    raw = parsed as Record<string, unknown>
  } catch (e) {
    return { model: null, warnings, error: `Could not parse spec: ${(e as Error).message}` }
  }

  // ---- units --------------------------------------------------------------
  const rawUnits = str(raw.units, 'mm').toLowerCase()
  let units: Units = 'mm'
  if (rawUnits === 'in' || rawUnits === 'inch' || rawUnits === 'inches' || rawUnits === '"') units = 'in'
  else if (rawUnits !== 'mm') warnings.push(`Unsupported units "${rawUnits}"; using mm.`)

  // ---- plate --------------------------------------------------------------
  const rawPlate = (raw.plate && typeof raw.plate === 'object' ? raw.plate : {}) as Record<string, unknown>
  const shape: PlateShape = str(rawPlate.shape, rawPlate.diameter !== undefined ? 'circle' : 'rect') === 'circle' ? 'circle' : 'rect'
  let width: number
  let height: number
  if (shape === 'circle') {
    const d = clamp(num(rawPlate.diameter ?? rawPlate.width, 100), 1, 100000)
    width = d
    height = d
  } else {
    width = clamp(num(rawPlate.width, 120), 1, 100000)
    height = clamp(num(rawPlate.height, 72), 1, 100000)
  }
  const thickness = clamp(num(rawPlate.thickness, units === 'in' ? 0.25 : 4), 0.05, 100000)
  let cornerRadius = shape === 'rect' ? clamp(num(rawPlate.cornerRadius, 0), 0, maxCornerRadius(width, height)) : 0
  if (!raw.plate) warnings.push('No "plate" section found; using default plate.')

  const cx = width / 2
  const cy = height / 2

  // ---- holes (explicit) ---------------------------------------------------
  const holes: Hole[] = []
  const seen = new Set<string>()
  const claimId = (proposed: string, fallbackPrefix: string): string => {
    let id = proposed
    if (!id || seen.has(id)) {
      const fresh = nextId(fallbackPrefix)
      if (id && seen.has(id)) warnings.push(`Duplicate id "${id}"; renamed to "${fresh}".`)
      id = fresh
    }
    seen.add(id)
    return id
  }

  const rawHoles = Array.isArray(raw.holes) ? raw.holes : []
  if (rawHoles.length > MAX_HOLES) warnings.push(`Spec lists ${rawHoles.length} holes; only the first ${MAX_HOLES} were used.`)
  rawHoles.slice(0, MAX_HOLES).forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Hole #${i + 1} is not an object; skipped.`)
      return
    }
    const h = entry as Record<string, unknown>
    const kind = str(h.type ?? h.kind, 'circle').toLowerCase()
    const id = claimId(str(h.id, ''), kind === 'slot' ? 'slot' : 'hole')
    const x = num(h.x, cx)
    const y = num(h.y, cy)
    if (kind === 'slot') {
      holes.push({ id, kind: 'slot', width: clamp(num(h.width, 30), 0.5, 100000), height: clamp(num(h.height, 10), 0.5, 100000), x, y, group: 'free' })
    } else {
      if (kind !== 'circle') warnings.push(`Hole "${id}" has unknown type "${kind}"; treated as circle.`)
      const dExplicit = numOrNull(h.diameter)
      const rExplicit = numOrNull(h.radius)
      let diameter: number | null = null
      if (dExplicit !== null) diameter = dExplicit
      else if (rExplicit !== null) diameter = rExplicit * 2
      if (diameter === null) diameter = units === 'in' ? 0.25 : 5
      if (diameter <= 0) {
        warnings.push(`Hole "${id}" has a non-positive diameter; skipped.`)
        return
      }
      holes.push({ id, kind: 'circle', diameter: clamp(diameter, 0.05, 100000), x, y, group: 'row' })
    }
  })

  // ---- central bore (flange) ---------------------------------------------
  if (raw.bore && typeof raw.bore === 'object') {
    const b = raw.bore as Record<string, unknown>
    const d = clamp(num(b.diameter ?? (numOrNull(b.radius) ? (b.radius as number) * 2 : undefined), 9), 0.05, 100000)
    holes.unshift({ id: claimId(str(b.id, 'bore'), 'bore'), kind: 'circle', diameter: d, x: num(b.x, cx), y: num(b.y, cy), group: 'bore' })
  }

  // ---- bolt circle (flange) ----------------------------------------------
  if (raw.boltCircle && typeof raw.boltCircle === 'object') {
    const bc = raw.boltCircle as Record<string, unknown>
    const generated = boltCircleHoles(
      num(bc.x, cx),
      num(bc.y, cy),
      clamp(num(bc.count, 4), 0, 200),
      clamp(num(bc.circleDiameter ?? bc.diameter, Math.min(width, height) * 0.7), 0, 100000),
      clamp(num(bc.holeDiameter, units === 'in' ? 0.5 : 5), 0.05, 100000),
      num(bc.startAngle, 45),
    )
    for (const g of generated) {
      g.id = claimId(g.id, 'bolt')
      holes.push(g)
    }
  }

  // ---- labels -------------------------------------------------------------
  const labels: Label[] = []
  const rawLabels = Array.isArray(raw.labels) ? raw.labels : []
  rawLabels.slice(0, MAX_LABELS).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const l = entry as Record<string, unknown>
    const text2 = str(l.text, '')
    if (!text2) return
    labels.push({ id: claimId(str(l.id, ''), 'label'), text: text2, x: num(l.x, cx), y: num(l.y, cy), size: clamp(num(l.size, units === 'in' ? 1 : 8), 0.2, 100000) })
  })

  // ---- sanity warnings ----------------------------------------------------
  for (const h of holes) {
    if (h.x < 0 || h.x > width || h.y < 0 || h.y > height) {
      warnings.push(`Hole "${h.id}" centre (${h.x}, ${h.y}) is outside the plate.`)
    }
  }
  cornerRadius = Math.min(cornerRadius, maxCornerRadius(width, height))

  const model: PartModel = {
    partName: str(raw.part ?? raw.partName, 'untitled-part'),
    units,
    plate: { shape, width: r(width), height: r(height), thickness, cornerRadius },
    holes,
    labels,
  }
  return { model, warnings }
}

const r = (n: number) => Math.round(n * 1000) / 1000
