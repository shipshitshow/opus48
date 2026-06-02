import * as makerjs from 'makerjs'
import type { PartModel } from '../types'
import { buildMakerModel, makerUnit } from '../geometry/maker'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Labels are rendered as SVG <text> (an "engrave" layer). Maker.js's own Text
 * model would require bundling an OpenType font, so for SVG we inject upright
 * text directly. Maker.js positions geometry using the MODEL's actual bounding
 * box: a model point (mx,my) maps to SVG (mx - low[0], high[1] - my). We must
 * use those extents (NOT the plate size) or labels drift when a hole/slot
 * overshoots the plate edge.
 */
function buildLabelGroup(part: PartModel, low: [number, number], high: [number, number]): string {
  if (!part.labels.length) return ''
  const texts = part.labels
    .map((l) => {
      const sx = l.x - low[0]
      const sy = high[1] - l.y
      return (
        `<text x="${sx}" y="${sy}" font-size="${l.size}" ` +
        `text-anchor="middle" dominant-baseline="central" ` +
        `font-family="Helvetica, Arial, sans-serif" fill="#1d4ed8" stroke="none">` +
        `${escapeXml(l.text)}</text>`
      )
    })
    .join('')
  return `<g id="labels">${texts}</g>`
}

/** Produce a real, openable SVG: cut profile (Maker.js) + engrave labels. */
export function exportSVG(part: PartModel): string {
  const model = buildMakerModel(part)
  const ext = makerjs.measure.modelExtents(model)
  const low: [number, number] = ext ? [ext.low[0], ext.low[1]] : [0, 0]
  const high: [number, number] = ext ? [ext.high[0], ext.high[1]] : [part.plate.width, part.plate.height]
  const svg = makerjs.exporter.toSVG(model, { units: makerUnit(part.units) })
  const group = buildLabelGroup(part, low, high)
  return group ? svg.replace('</svg>', `${group}</svg>`) : svg
}

/**
 * Produce a real, openable DXF (LINE/ARC/CIRCLE entities with a units header).
 * Note: DXF contains cut geometry only — text labels are omitted because vector
 * text would require bundling a font. See known limitations in the report.
 */
export function exportDXF(part: PartModel): string {
  return makerjs.exporter.toDXF(buildMakerModel(part), { units: makerUnit(part.units) })
}
