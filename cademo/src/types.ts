// ---------------------------------------------------------------------------
// PocketCAD core type contract.
//
// Coordinate system (the single source of truth across 2D, 3D and export):
//   * Units are millimetres OR inches (see PartModel.units) — purely a label +
//     export header; geometry numbers are unit-agnostic.
//   * Origin [0,0] is the BOTTOM-LEFT corner of the plate bounding box.
//   * +X points right, +Y points up (standard CAD orientation).
//   * The plate bounding box occupies [0, width] x [0, height].
//     For a circular plate, width === height === diameter and the disc is
//     centred at (width/2, height/2).
//   * Hole / slot / label positions are CENTRES.
// ---------------------------------------------------------------------------

export type Units = 'mm' | 'in'
export type PlateShape = 'rect' | 'circle'

export interface PlateSpec {
  shape: PlateShape
  /** Bounding-box width. For a circular plate this is the diameter. */
  width: number
  /** Bounding-box height. For a circular plate this equals width (diameter). */
  height: number
  thickness: number
  /** Rounded-corner radius (rectangular plate only). */
  cornerRadius: number
}

/**
 * How a hole is managed by the aggregate controls:
 *   'row'  — part of the linear mount-hole row (rect plate controls regenerate it)
 *   'bolt' — part of a bolt circle (flange controls regenerate it)
 *   'bore' — the single central bore of a flange
 *   'free' — standalone; never touched by pattern generators
 */
export type HoleGroup = 'row' | 'bolt' | 'bore' | 'free'

export interface CircleHole {
  id: string
  kind: 'circle'
  diameter: number
  x: number
  y: number
  group: HoleGroup
}

export interface SlotHole {
  id: string
  kind: 'slot'
  /** Overall length of the stadium slot (the long axis). */
  width: number
  /** Overall width of the stadium slot (the short axis); also the cap diameter. */
  height: number
  x: number
  y: number
  group: HoleGroup
}

export type Hole = CircleHole | SlotHole

export interface Label {
  id: string
  text: string
  x: number
  y: number
  /** Font size in model units. */
  size: number
}

export interface PartModel {
  partName: string
  units: Units
  plate: PlateSpec
  holes: Hole[]
  labels: Label[]
}

/**
 * Flat aggregate controls shown in the property panel. The PartModel is the
 * single source of truth; these are derived from it and edits flow back into
 * the model (pattern controls like holeCount / boltCount regenerate holes).
 */
export interface Controls {
  shape: PlateShape
  plateWidth: number
  plateHeight: number
  diameter: number
  cornerRadius: number
  thickness: number
  // linear mount-hole row (rect)
  holeCount: number
  holeDiameter: number
  holeSpacing: number
  // slot
  slotWidth: number
  slotHeight: number
  hasSlot: boolean
  // flange (circular plate)
  boreDiameter: number
  boltCount: number
  boltCircleDiameter: number
  boltHoleDiameter: number
  boltStartAngle: number
}

export interface ParseResult {
  model: PartModel | null
  warnings: string[]
  error?: string
}

export interface ReferenceImage {
  url: string
  name: string
}
