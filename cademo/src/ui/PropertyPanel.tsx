import { useEffect, useRef, useState } from 'react'
import type { PartModel, PlateShape } from '../types'
import {
  addCircleHole,
  addSlot,
  deriveControls,
  moveElement,
  removeElement,
  setBoltCircleDiameter,
  setBoltCount,
  setBoltHoleDiameter,
  setBoltStartAngle,
  setBore,
  setCornerRadius,
  setDiameter,
  setHoleCount,
  setHoleDiameter,
  setHoleSpacing,
  setPlateHeight,
  setPlateWidth,
  setShape,
  setSlotSize,
  setThickness,
  updateHole,
  updateLabel,
} from '../model/ops'
import { maxCornerRadius } from '../model/defaults'

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)
const clampDisp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface Editing {
  setLive: (m: PartModel) => void
  commit: (m: PartModel) => void
}

// ---- low-level inputs -----------------------------------------------------

function NumberInput({ value, min, max, step, onLive, onCommit }: { value: number; min?: number; max?: number; step?: number; onLive: (v: number) => void; onCommit: (v: number) => void }) {
  const [text, setText] = useState(fmt(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(fmt(value))
  }, [value, editing])
  return (
    <input
      className="num"
      type="number"
      min={min}
      max={max}
      step={step ?? 'any'}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) onLive(v)
      }}
      onBlur={() => {
        setEditing(false)
        const v = parseFloat(text)
        onCommit(Number.isNaN(v) ? value : v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function Slider({ value, min, max, step, onLive, onCommit }: { value: number; min: number; max: number; step?: number; onLive: (v: number) => void; onCommit: (v: number) => void }) {
  const latest = useRef(value)
  latest.current = value // keep synced with the model so a no-op release never reverts
  const changed = useRef(false)
  const finish = () => {
    if (changed.current) {
      changed.current = false
      onCommit(latest.current)
    }
  }
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step ?? 'any'}
      value={clampDisp(value, min, max)}
      onPointerDown={() => (changed.current = false)}
      onKeyDown={() => (changed.current = false)}
      onChange={(e) => {
        const v = +e.target.value
        latest.current = v
        changed.current = true
        onLive(v)
      }}
      onPointerUp={finish}
      onKeyUp={finish}
    />
  )
}

function Field(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onLive: (v: number) => void; onCommit: (v: number) => void; disabled?: boolean }) {
  const { label, value, min, max, step, unit = '', onLive, onCommit, disabled } = props
  return (
    <div className="field" style={disabled ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
      <div className="field-head">
        <span className="field-label">{label}</span>
        <span className="field-val">
          {fmt(value)} {unit}
        </span>
      </div>
      <div className="field-row">
        <Slider value={value} min={min} max={max} step={step} onLive={onLive} onCommit={onCommit} />
        <NumberInput value={value} min={min} max={max} step={step} onLive={onLive} onCommit={onCommit} />
      </div>
    </div>
  )
}

// ---- selected-element editor ----------------------------------------------

function SelectedEditor({ model, selectedId, onSelect, setLive, commit }: { model: PartModel; selectedId: string | null; onSelect: (id: string | null) => void } & Editing) {
  const u = model.units
  const hole = model.holes.find((h) => h.id === selectedId)
  const label = model.labels.find((l) => l.id === selectedId)

  if (!hole && !label) {
    return <div className="empty-sel">Nothing selected. Click a hole, slot or label in the 2D view to edit it directly.</div>
  }

  const del = () => {
    commit(removeElement(model, selectedId!))
    onSelect(null)
  }

  if (hole) {
    return (
      <>
        <div className="field-head" style={{ marginBottom: 8 }}>
          <span className="chip">{hole.kind === 'circle' ? hole.group : hole.kind}</span>
          <span className="field-val">{hole.id}</span>
        </div>
        {hole.kind === 'circle' ? (
          <Field label="Diameter" unit={u} value={hole.diameter} min={0.2} max={Math.max(20, model.plate.width)} onLive={(v) => setLive(updateHole(model, hole.id, { diameter: v }))} onCommit={(v) => commit(updateHole(model, hole.id, { diameter: v }))} />
        ) : (
          <div className="row2">
            <Field label="Slot W" unit={u} value={hole.width} min={1} max={Math.max(20, model.plate.width)} onLive={(v) => setLive(updateHole(model, hole.id, { width: v }))} onCommit={(v) => commit(updateHole(model, hole.id, { width: v }))} />
            <Field label="Slot H" unit={u} value={hole.height} min={1} max={Math.max(20, model.plate.height)} onLive={(v) => setLive(updateHole(model, hole.id, { height: v }))} onCommit={(v) => commit(updateHole(model, hole.id, { height: v }))} />
          </div>
        )}
        <div className="row2">
          <Field label="Center X" unit={u} value={hole.x} min={0} max={model.plate.width} onLive={(v) => setLive(moveElement(model, hole.id, v, hole.y))} onCommit={(v) => commit(moveElement(model, hole.id, v, hole.y))} />
          <Field label="Center Y" unit={u} value={hole.y} min={0} max={model.plate.height} onLive={(v) => setLive(moveElement(model, hole.id, hole.x, v))} onCommit={(v) => commit(moveElement(model, hole.id, hole.x, v))} />
        </div>
        <div className="selbar">
          <button className="btn danger" onClick={del}>Delete element</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="field-head" style={{ marginBottom: 8 }}>
        <span className="chip">label</span>
        <span className="field-val">{label!.id}</span>
      </div>
      <div className="field" style={{ marginBottom: 11 }}>
        <div className="field-head">
          <span className="field-label">Text</span>
        </div>
        <input className="num" style={{ width: '100%', textAlign: 'left' }} value={label!.text} onChange={(e) => setLive(updateLabel(model, label!.id, { text: e.target.value }))} onBlur={(e) => commit(updateLabel(model, label!.id, { text: e.target.value }))} />
      </div>
      <Field label="Font size" unit={u} value={label!.size} min={0.5} max={Math.max(20, model.plate.height)} onLive={(v) => setLive(updateLabel(model, label!.id, { size: v }))} onCommit={(v) => commit(updateLabel(model, label!.id, { size: v }))} />
      <div className="row2">
        <Field label="X" unit={u} value={label!.x} min={0} max={model.plate.width} onLive={(v) => setLive(moveElement(model, label!.id, v, label!.y))} onCommit={(v) => commit(moveElement(model, label!.id, v, label!.y))} />
        <Field label="Y" unit={u} value={label!.y} min={0} max={model.plate.height} onLive={(v) => setLive(moveElement(model, label!.id, label!.x, v))} onCommit={(v) => commit(moveElement(model, label!.id, label!.x, v))} />
      </div>
      <div className="selbar">
        <button className="btn danger" onClick={del}>Delete label</button>
      </div>
    </>
  )
}

// ---- shape toggle ---------------------------------------------------------

function ShapeToggle({ shape, onPick }: { shape: PlateShape; onPick: (s: PlateShape) => void }) {
  return (
    <div className="seg">
      <button className={`seg-btn ${shape === 'rect' ? 'on' : ''}`} onClick={() => onPick('rect')}>▭ Rect plate</button>
      <button className={`seg-btn ${shape === 'circle' ? 'on' : ''}`} onClick={() => onPick('circle')}>◯ Round flange</button>
    </div>
  )
}

// ---- main panel -----------------------------------------------------------

interface Props extends Editing {
  model: PartModel
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function PropertyPanel({ model, selectedId, onSelect, setLive, commit }: Props) {
  const c = deriveControls(model)
  const u = model.units
  const rMax = maxCornerRadius(model.plate.width, model.plate.height)
  const big = Math.max(40, model.plate.width)

  return (
    <>
      <div className="section">
        <h3 className="section-title">Plate</h3>
        <ShapeToggle shape={c.shape} onPick={(s) => commit(setShape(model, s))} />
        {c.shape === 'circle' ? (
          <>
            <Field label="Diameter" unit={u} value={c.diameter} min={5} max={big} onLive={(v) => setLive(setDiameter(model, v))} onCommit={(v) => commit(setDiameter(model, v))} />
            <Field label="Thickness" unit={u} value={c.thickness} min={0.1} max={Math.max(10, big / 4)} onLive={(v) => setLive(setThickness(model, v))} onCommit={(v) => commit(setThickness(model, v))} />
          </>
        ) : (
          <>
            <Field label="Width" unit={u} value={c.plateWidth} min={10} max={big} onLive={(v) => setLive(setPlateWidth(model, v))} onCommit={(v) => commit(setPlateWidth(model, v))} />
            <Field label="Height" unit={u} value={c.plateHeight} min={10} max={Math.max(40, model.plate.height)} onLive={(v) => setLive(setPlateHeight(model, v))} onCommit={(v) => commit(setPlateHeight(model, v))} />
            <Field label="Corner radius" unit={u} value={c.cornerRadius} min={0} max={Math.max(1, rMax)} onLive={(v) => setLive(setCornerRadius(model, v))} onCommit={(v) => commit(setCornerRadius(model, v))} />
            <Field label="Thickness" unit={u} value={c.thickness} min={0.1} max={Math.max(10, big / 8)} onLive={(v) => setLive(setThickness(model, v))} onCommit={(v) => commit(setThickness(model, v))} />
          </>
        )}
      </div>

      {c.shape === 'circle' ? (
        <>
          <div className="section">
            <h3 className="section-title">Center bore</h3>
            <Field label="Bore diameter" unit={u} value={c.boreDiameter} min={0.2} max={model.plate.width} onLive={(v) => setLive(setBore(model, v))} onCommit={(v) => commit(setBore(model, v))} />
          </div>
          <div className="section">
            <h3 className="section-title">Bolt circle</h3>
            <Field label="Count" value={c.boltCount} min={0} max={24} step={1} onLive={(v) => setLive(setBoltCount(model, v))} onCommit={(v) => commit(setBoltCount(model, v))} />
            <Field label="Bolt circle ⌀" unit={u} value={c.boltCircleDiameter} min={0} max={model.plate.width} onLive={(v) => setLive(setBoltCircleDiameter(model, v))} onCommit={(v) => commit(setBoltCircleDiameter(model, v))} />
            <Field label="Hole ⌀" unit={u} value={c.boltHoleDiameter} min={0.2} max={Math.max(5, model.plate.width / 4)} onLive={(v) => setLive(setBoltHoleDiameter(model, v))} onCommit={(v) => commit(setBoltHoleDiameter(model, v))} />
            <Field label="Start angle" unit="°" value={c.boltStartAngle} min={0} max={360} onLive={(v) => setLive(setBoltStartAngle(model, v))} onCommit={(v) => commit(setBoltStartAngle(model, v))} />
            <div className="subtle">The bolt holes are regenerated as an evenly-spaced ring. Drag any hole in the 2D view to nudge it.</div>
          </div>
        </>
      ) : (
        <>
          <div className="section">
            <h3 className="section-title">
              Mount holes
              <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => commit(addCircleHole(model))}>+ hole</button>
            </h3>
            <Field label="Count" value={c.holeCount} min={0} max={12} step={1} onLive={(v) => setLive(setHoleCount(model, v))} onCommit={(v) => commit(setHoleCount(model, v))} />
            <Field label="Diameter" unit={u} value={c.holeDiameter} min={0.5} max={Math.max(10, model.plate.height / 2)} onLive={(v) => setLive(setHoleDiameter(model, v))} onCommit={(v) => commit(setHoleDiameter(model, v))} />
            <Field label="Spacing" unit={u} value={c.holeSpacing} min={1} max={model.plate.width} onLive={(v) => setLive(setHoleSpacing(model, v))} onCommit={(v) => commit(setHoleSpacing(model, v))} />
            <div className="subtle">Count &amp; spacing regenerate an evenly-spaced, centered row. Drag individual holes in the 2D view to fine-tune.</div>
          </div>

          <div className="section">
            <h3 className="section-title">
              Slot
              {!c.hasSlot && <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => commit(addSlot(model))}>+ slot</button>}
            </h3>
            {c.hasSlot ? (
              <div className="row2">
                <Field label="Width" unit={u} value={c.slotWidth} min={2} max={model.plate.width} onLive={(v) => setLive(setSlotSize(model, v, c.slotHeight))} onCommit={(v) => commit(setSlotSize(model, v, c.slotHeight))} />
                <Field label="Height" unit={u} value={c.slotHeight} min={2} max={model.plate.height} onLive={(v) => setLive(setSlotSize(model, c.slotWidth, v))} onCommit={(v) => commit(setSlotSize(model, c.slotWidth, v))} />
              </div>
            ) : (
              <div className="empty-sel">No slot. Use “+ slot” to add a rounded-end slot.</div>
            )}
          </div>
        </>
      )}

      <div className="section">
        <h3 className="section-title">Selected element</h3>
        <SelectedEditor model={model} selectedId={selectedId} onSelect={onSelect} setLive={setLive} commit={commit} />
      </div>
    </>
  )
}
