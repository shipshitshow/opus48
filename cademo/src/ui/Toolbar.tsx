import type { Units } from '../types'

interface Props {
  partName: string
  units: Units
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onExportSVG: () => void
  onExportDXF: () => void
}

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      <div className="brand">
        <span className="brand-name">
          Pocket<span className="brand-dot">CAD</span>
        </span>
        <span className="brand-sub">laser-cut plate designer</span>
      </div>

      <div className="toolbar-sep" />
      <span className="chip" title="Active part">{p.partName}</span>
      <span className="chip" title="Units">{p.units}</span>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (⌘Z)">↶ Undo</button>
        <button className="btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (⇧⌘Z)">↷ Redo</button>
        <button className="btn ghost" onClick={p.onReset} title="Reset to sample">Reset</button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button className="btn" onClick={p.onExportSVG} title="Download SVG">⤓ SVG</button>
        <button className="btn primary" onClick={p.onExportDXF} title="Download DXF">⤓ DXF</button>
      </div>
    </div>
  )
}
