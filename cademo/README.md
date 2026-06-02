# PocketCAD

A browser CAD tool for designing simple **laser-cut / flat parts** — a rectangular
bracket/enclosure plate or a round flange face — with a live 2D drawing, a live 3D
extrusion preview, and real **SVG + DXF** export.

Built with **React + TypeScript + Vite**, **Three.js** (3D preview) and
**[Maker.js](https://maker.js.org)** (2D geometry + SVG/DXF export). No CAD export
math is hand-rolled — Maker.js produces the SVG/DXF.

## Run

```bash
npm install      # installs deps
npm run dev      # http://localhost:5173 (or next free port)
npm run build    # type-checks (tsc -b) + production build
npm run preview  # serve the production build
```

The first screen **is** the tool (no landing page).

## Layout

```
┌─────────────────────────── top toolbar (part · units · undo/redo · reset · export) ┐
│ left: spec box + property │      center: 2D drawing       │   right: 3D preview      │
│ controls                  │  (grid, holes, slot, dims)    │  (extruded part, orbit) │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Spec paste box** — paste a small YAML-ish part spec and click **Generate**. Parsed
  values populate the normal controls, so you can keep editing after generation.
- **Two samples** — *bracket* (the original `laser-cut-controller-bracket` demo) and
  *flange* (a round flange face extracted from an engineering drawing).
- **Import drawing** — load a source image; it appears as a *Source drawing* overlay on
  the 2D canvas (toggle + opacity) and the spec card is auto-filled from offline
  extraction so you can edit the values directly.
- **Two plate shapes**
  - *Rectangular plate*: width, height, corner radius, thickness; a centered, evenly
    spaced **mount-hole row** (count / diameter / spacing); a rounded-end **slot**.
  - *Round flange*: diameter, thickness; a central **bore**; a **bolt circle**
    (count / bolt-circle ⌀ / hole ⌀ / start angle), shown with a dashed reference ring.
- **Units** — `mm` or `in` (drives the export unit header and on-screen labels).
- **Direct manipulation** — click any hole/slot/label in the 2D view to select and edit
  it; drag to reposition. Per-element editor (size, center X/Y, delete).
- **Live 3D** — the extrusion always matches the 2D dimensions and is auto-framed so the
  preview is never blank.
- **Undo / redo** (⌘/Ctrl+Z, ⇧⌘/Ctrl+Z), **Reset**, **Delete** selected (Del/Backspace).
- **Export SVG and DXF** — both produce real, openable files (a Blob download), with the
  correct unit header (`$INSUNITS`) in the DXF.

## Spec format

```yaml
# rectangular bracket
part: laser-cut-controller-bracket
units: mm
plate: { width: 120, height: 72, thickness: 4, cornerRadius: 6 }
holes:
  - { id: mount-left,  type: circle, diameter: 6,  x: 18,  y: 18 }
  - { id: cable-pass,  type: slot,   width: 32, height: 10, x: 60, y: 52 }
labels:
  - { text: PocketCAD, x: 60, y: 36 }
```

```yaml
# round flange face (front view of a flanged cross)
part: flanged-cross-flange-face
units: in
plate:    { shape: circle, diameter: 16, thickness: 2 }
bore:     { diameter: 9 }
boltCircle: { count: 4, circleDiameter: 14, holeDiameter: 1, startAngle: 45 }
```

The parser is tolerant: missing fields fall back to sensible defaults, out-of-range
values are clamped, duplicate ids are renamed, and notes are surfaced under the spec box.

## Architecture

| Area | File |
|------|------|
| Shared type contract | `src/types.ts` |
| Spec parser (YAML → model) | `src/spec/parseSpec.ts` |
| Model + pattern generators | `src/model/ops.ts`, `src/model/defaults.ts` |
| Undo/redo (transient + commit) | `src/state/history.ts` |
| 2D drawing + interaction | `src/canvas/Canvas2D.tsx` |
| 3D extrusion | `src/three/geometry.ts`, `src/three/Viewer3D.tsx` |
| Maker.js geometry | `src/geometry/maker.ts` |
| SVG/DXF export | `src/export/exporters.ts`, `src/export/download.ts` |
| UI | `src/ui/*`, `src/App.tsx` |

The `PartModel` is the single source of truth; 2D, 3D and export all read the same model
(mm/in, Y-up, origin at the plate bounding box's bottom-left).

## Known limitations

- **DXF text** — DXF export contains cut geometry only (LINE / ARC / CIRCLE). Text labels
  are included in the **SVG** as an engrave-layer `<text>`, but omitted from DXF, because
  vector text in DXF would require bundling an OpenType font (Maker.js `models.Text` needs
  an opentype.js font). This is the standard laser workflow (engrave text as a separate
  pass). The SVG is fully self-contained.
- **Image → spec** — extraction is **offline / pre-computed** for the supplied flanged-cross
  drawing (per the chosen approach). Importing an image displays it and loads that
  extracted flange card; arbitrary drawings are not OCR'd at runtime.
- **Bolt-circle / mount-row controls regenerate** their holes (count/spacing/angle), so they
  intentionally replace per-hole positions; fine-tune individual holes by dragging them.
- The bundled JS is ~1 MB (mostly Three.js + Maker.js); fine for a tool, not code-split.
