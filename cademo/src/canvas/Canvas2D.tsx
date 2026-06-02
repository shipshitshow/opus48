import { useEffect, useRef, useState } from 'react'
import type { PartModel, ReferenceImage } from '../types'

interface Props {
  model: PartModel
  selectedId: string | null
  referenceImage: ReferenceImage | null
  onSelect: (id: string | null) => void
  onMoveLive: (id: string, x: number, y: number) => void
  onMoveCommit: (id: string, x: number, y: number) => void
}

const r1 = (n: number) => Math.round(n * 100) / 100

function niceStep(extent: number): number {
  const target = extent / 10 || 1
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  for (const c of [1, 2, 2.5, 5, 10]) {
    if (c * pow >= target) return c * pow
  }
  return 10 * pow
}

const COL = {
  plateFill: '#142138',
  plateStroke: '#5577e6',
  grid: '#1b2942',
  gridMajor: '#26395c',
  holeFill: '#0b0e14',
  holeStroke: '#7d9bff',
  dim: '#5f6b85',
  dimText: '#aab4ca',
  label: '#9db4ff',
  sel: '#ffcc55',
  bolt: '#3a4a6b',
}

interface Drag {
  id: string
  pointerId: number
  px: number
  py: number
  ex: number
  ey: number
  nx: number
  ny: number
  moved: boolean
}

export default function Canvas2D({ model, selectedId, referenceImage, onSelect, onMoveLive, onMoveCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const dragRef = useRef<Drag | null>(null)

  const [refVisible, setRefVisible] = useState(true)
  const [refOpacity, setRefOpacity] = useState(0.85)
  useEffect(() => {
    if (referenceImage) setRefVisible(true)
  }, [referenceImage])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const { plate, units } = model
  const isCircle = plate.shape === 'circle'
  const pad = 64
  const availW = Math.max(10, size.w - pad * 2)
  const availH = Math.max(10, size.h - pad * 2)
  const scale = Math.max(0.02, Math.min(availW / plate.width, availH / plate.height))
  const plateW = plate.width * scale
  const plateH = plate.height * scale
  const originX = (size.w - plateW) / 2
  const originYbottom = (size.h + plateH) / 2

  const sx = (mx: number) => originX + mx * scale
  const sy = (my: number) => originYbottom - my * scale

  const toModel = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - originX) / scale, y: (originYbottom - (clientY - rect.top)) / scale }
  }

  function startDrag(e: React.PointerEvent, el: { id: string; x: number; y: number }) {
    e.stopPropagation()
    onSelect(el.id)
    const m = toModel(e.clientX, e.clientY)
    dragRef.current = { id: el.id, pointerId: e.pointerId, px: m.x, py: m.y, ex: el.x, ey: el.y, nx: el.x, ny: el.y, moved: false }
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const m = toModel(e.clientX, e.clientY)
    d.nx = d.ex + (m.x - d.px)
    d.ny = d.ey + (m.y - d.py)
    d.moved = true
    onMoveLive(d.id, d.nx, d.ny)
  }
  function endDrag() {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    try {
      svgRef.current?.releasePointerCapture(d.pointerId)
    } catch {
      /* ignore */
    }
    if (d.moved) onMoveCommit(d.id, d.nx, d.ny) // pure clicks (no move) don't pollute history
  }

  // ---- grid ---------------------------------------------------------------
  const step = niceStep(Math.max(plate.width, plate.height))
  const gridLines: React.ReactNode[] = []
  for (let x = 0, i = 0; x <= plate.width + 1e-6; x += step, i++) {
    gridLines.push(<line key={`v${i}`} x1={sx(x)} y1={sy(0)} x2={sx(x)} y2={sy(plate.height)} stroke={i % 5 === 0 ? COL.gridMajor : COL.grid} strokeWidth={1} />)
  }
  for (let y = 0, i = 0; y <= plate.height + 1e-6; y += step, i++) {
    gridLines.push(<line key={`h${i}`} x1={sx(0)} y1={sy(y)} x2={sx(plate.width)} y2={sy(y)} stroke={i % 5 === 0 ? COL.gridMajor : COL.grid} strokeWidth={1} />)
  }

  // ---- bolt-circle reference ring (flange) --------------------------------
  const bolts = model.holes.filter((h) => h.kind === 'circle' && h.group === 'bolt')
  let boltRing: React.ReactNode = null
  if (bolts.length >= 1) {
    const cx = plate.width / 2
    const cy = plate.height / 2
    const br = Math.hypot(bolts[0].x - cx, bolts[0].y - cy)
    boltRing = <circle cx={sx(cx)} cy={sy(cy)} r={br * scale} fill="none" stroke={COL.bolt} strokeWidth={1} strokeDasharray="6 4" />
  }

  const dimYoff = 32
  const widthDimY = sy(0) + dimYoff
  const heightDimX = sx(0) - 36

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#0b0e14' }}>
      {referenceImage && refVisible && (
        <div style={{ position: 'absolute', top: 36, left: 8, width: '40%', maxWidth: 460, zIndex: 3, border: '1px solid #283242', borderRadius: 8, overflow: 'hidden', background: '#0e1219', boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid #283242', fontSize: 11, color: '#7c8699' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Source drawing</span>
            <span style={{ color: '#5a6478', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{referenceImage.name}</span>
            <input type="range" min={0.15} max={1} step={0.05} value={refOpacity} onChange={(e) => setRefOpacity(+e.target.value)} title="Opacity" style={{ width: 64, accentColor: '#5577e6' }} />
            <button className="btn ghost" style={{ padding: '1px 7px', fontSize: 12 }} onClick={() => setRefVisible(false)}>×</button>
          </div>
          <img src={referenceImage.url} alt="source drawing" style={{ display: 'block', width: '100%', opacity: refOpacity, background: '#fff' }} />
        </div>
      )}
      {referenceImage && !refVisible && (
        <button className="btn" style={{ position: 'absolute', top: 36, left: 8, zIndex: 3, padding: '3px 9px', fontSize: 11 }} onClick={() => setRefVisible(true)}>
          ▣ Show source drawing
        </button>
      )}

      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: 'block', touchAction: 'none', position: 'relative', zIndex: 1 }}
        onPointerDown={() => onSelect(null)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L6,3 L0,6 Z" fill={COL.dim} />
          </marker>
          <marker id="arrowR" markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M6,0 L0,3 L6,6 Z" fill={COL.dim} />
          </marker>
          <clipPath id="plateClip">
            {isCircle ? (
              <circle cx={sx(plate.width / 2)} cy={sy(plate.height / 2)} r={plateW / 2} />
            ) : (
              <rect x={sx(0)} y={sy(plate.height)} width={plateW} height={plateH} rx={plate.cornerRadius * scale} ry={plate.cornerRadius * scale} />
            )}
          </clipPath>
        </defs>

        {/* plate */}
        {isCircle ? (
          <circle cx={sx(plate.width / 2)} cy={sy(plate.height / 2)} r={plateW / 2} fill={COL.plateFill} stroke={COL.plateStroke} strokeWidth={1.5} />
        ) : (
          <rect x={sx(0)} y={sy(plate.height)} width={plateW} height={plateH} rx={plate.cornerRadius * scale} ry={plate.cornerRadius * scale} fill={COL.plateFill} stroke={COL.plateStroke} strokeWidth={1.5} />
        )}

        <g clipPath="url(#plateClip)">{gridLines}</g>
        {boltRing}

        {/* holes & slots */}
        {model.holes.map((h) => {
          const selected = h.id === selectedId
          const stroke = selected ? COL.sel : COL.holeStroke
          if (h.kind === 'circle') {
            return (
              <g key={h.id} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, h)}>
                <circle cx={sx(h.x)} cy={sy(h.y)} r={(h.diameter / 2) * scale} fill={COL.holeFill} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
                {selected && <circle cx={sx(h.x)} cy={sy(h.y)} r={(h.diameter / 2) * scale + 4} fill="none" stroke={COL.sel} strokeWidth={1} strokeDasharray="4 3" />}
              </g>
            )
          }
          const w = h.width * scale
          const hh = h.height * scale
          return (
            <g key={h.id} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, h)}>
              <rect x={sx(h.x - h.width / 2)} y={sy(h.y + h.height / 2)} width={w} height={hh} rx={(Math.min(h.width, h.height) / 2) * scale} ry={(Math.min(h.width, h.height) / 2) * scale} fill={COL.holeFill} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
              {selected && <rect x={sx(h.x - h.width / 2) - 4} y={sy(h.y + h.height / 2) - 4} width={w + 8} height={hh + 8} rx={(Math.min(h.width, h.height) / 2) * scale + 4} fill="none" stroke={COL.sel} strokeWidth={1} strokeDasharray="4 3" />}
            </g>
          )
        })}

        {/* labels */}
        {model.labels.map((l) => (
          <text key={l.id} x={sx(l.x)} y={sy(l.y)} fontSize={Math.max(9, l.size * scale)} fill={l.id === selectedId ? COL.sel : COL.label} textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica, Arial, sans-serif" style={{ cursor: 'grab', userSelect: 'none' }} onPointerDown={(e) => startDrag(e, l)}>
            {l.text}
          </text>
        ))}

        {/* dimensions */}
        {isCircle ? (
          <>
            <line x1={sx(0)} y1={sy(plate.height / 2)} x2={sx(0)} y2={widthDimY + 6} stroke={COL.dim} strokeWidth={1} />
            <line x1={sx(plate.width)} y1={sy(plate.height / 2)} x2={sx(plate.width)} y2={widthDimY + 6} stroke={COL.dim} strokeWidth={1} />
            <line x1={sx(0)} y1={widthDimY} x2={sx(plate.width)} y2={widthDimY} stroke={COL.dim} strokeWidth={1} markerStart="url(#arrowR)" markerEnd="url(#arrow)" />
            <text x={sx(plate.width / 2)} y={widthDimY + 16} fill={COL.dimText} fontSize={12} textAnchor="middle" fontFamily="ui-monospace, monospace">
              ⌀ {r1(plate.width)} {units}
            </text>
          </>
        ) : (
          <>
            <line x1={sx(0)} y1={sy(0)} x2={sx(0)} y2={widthDimY + 6} stroke={COL.dim} strokeWidth={1} />
            <line x1={sx(plate.width)} y1={sy(0)} x2={sx(plate.width)} y2={widthDimY + 6} stroke={COL.dim} strokeWidth={1} />
            <line x1={sx(0)} y1={widthDimY} x2={sx(plate.width)} y2={widthDimY} stroke={COL.dim} strokeWidth={1} markerStart="url(#arrowR)" markerEnd="url(#arrow)" />
            <text x={(sx(0) + sx(plate.width)) / 2} y={widthDimY + 16} fill={COL.dimText} fontSize={12} textAnchor="middle" fontFamily="ui-monospace, monospace">
              {r1(plate.width)} {units}
            </text>
            <line x1={sx(0)} y1={sy(0)} x2={heightDimX - 6} y2={sy(0)} stroke={COL.dim} strokeWidth={1} />
            <line x1={sx(0)} y1={sy(plate.height)} x2={heightDimX - 6} y2={sy(plate.height)} stroke={COL.dim} strokeWidth={1} />
            <line x1={heightDimX} y1={sy(0)} x2={heightDimX} y2={sy(plate.height)} stroke={COL.dim} strokeWidth={1} markerStart="url(#arrow)" markerEnd="url(#arrowR)" />
            <text x={heightDimX - 8} y={(sy(0) + sy(plate.height)) / 2} fill={COL.dimText} fontSize={12} textAnchor="middle" fontFamily="ui-monospace, monospace" transform={`rotate(-90 ${heightDimX - 8} ${(sy(0) + sy(plate.height)) / 2})`}>
              {r1(plate.height)} {units}
            </text>
          </>
        )}
      </svg>

      <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 11, color: '#5f6b85', fontFamily: 'ui-monospace, monospace', pointerEvents: 'none', zIndex: 2 }}>
        {r1(scale)} px/{units} · grid {step} {units} · drag holes/labels to move
      </div>
    </div>
  )
}
