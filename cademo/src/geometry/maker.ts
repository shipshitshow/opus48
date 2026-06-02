import * as makerjs from 'makerjs'
import type { PartModel, Units } from '../types'

export function makerUnit(u: Units): string {
  return u === 'in' ? makerjs.unitType.Inch : makerjs.unitType.Millimeter
}

/**
 * Build a Maker.js model representing the laser-cut PROFILE of the part:
 * the plate outline (rounded rect OR circle) plus every hole/slot as an
 * interior cut path. Kept pure (no grid/dimensions/labels — presentation only).
 *
 * Maker.js uses the same Y-up, bottom-left-origin convention as our model and
 * its exporters handle the Y flip for SVG automatically.
 */
export function buildMakerModel(part: PartModel): makerjs.IModel {
  const { plate } = part
  const models: makerjs.IModelMap = {}
  const paths: makerjs.IPathMap = {}

  if (plate.shape === 'circle') {
    paths.outline = new makerjs.paths.Circle([plate.width / 2, plate.height / 2], plate.width / 2)
  } else {
    const r = Math.min(plate.cornerRadius, Math.min(plate.width, plate.height) / 2)
    models.plate =
      r > 0.01
        ? new makerjs.models.RoundRectangle(plate.width, plate.height, r)
        : new makerjs.models.Rectangle(plate.width, plate.height)
  }

  part.holes.forEach((h, i) => {
    if (h.kind === 'circle') {
      paths[`hole_${i}`] = new makerjs.paths.Circle([h.x, h.y], Math.max(0.025, h.diameter / 2))
    } else {
      // Oval(width, height) draws a stadium with cap radius = min/2 — exactly a
      // rounded-end slot. Its native origin is bottom-left, so offset to centre.
      const oval: makerjs.IModel = new makerjs.models.Oval(Math.max(0.1, h.width), Math.max(0.1, h.height))
      oval.origin = [h.x - h.width / 2, h.y - h.height / 2]
      models[`slot_${i}`] = oval
    }
  })

  return { units: makerUnit(part.units), models, paths }
}
