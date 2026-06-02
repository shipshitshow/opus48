// The exact demo spec required by the original brief (laser-cut bracket).
export const SAMPLE_SPEC = `part: laser-cut-controller-bracket
units: mm
plate:
  width: 120
  height: 72
  thickness: 4
  cornerRadius: 6
holes:
  - id: mount-left
    type: circle
    diameter: 6
    x: 18
    y: 18
  - id: mount-right
    type: circle
    diameter: 6
    x: 102
    y: 18
  - id: cable-pass
    type: slot
    width: 32
    height: 10
    x: 60
    y: 52
labels:
  - text: PocketCAD
    x: 60
    y: 36
`

// Pre-extracted from the supplied engineering drawing of a flanged pipe cross.
// This models the FRONT-VIEW flange face: a round flange with a central bore
// and a 4-hole bolt circle ("1.00 DIA THRU, 4 HOLES EQ. SPACED"). Values are in
// inches, exactly as dimensioned on the drawing ("DIMENSIONS TYPICAL BOTH ENDS").
export const FLANGE_SPEC = `part: flanged-cross-flange-face
units: in
plate:
  shape: circle
  diameter: 16
  thickness: 2
bore:
  diameter: 9
boltCircle:
  count: 4
  circleDiameter: 14
  holeDiameter: 1
  startAngle: 45
labels:
  - text: TYP BOTH ENDS
    x: 8
    y: 1.4
    size: 0.9
`
