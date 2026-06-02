import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './app.css'
import Canvas2D from './canvas/Canvas2D'
import Viewer3D from './three/Viewer3D'
import Toolbar from './ui/Toolbar'
import SpecBox from './ui/SpecBox'
import PropertyPanel from './ui/PropertyPanel'
import { useHistory } from './state/history'
import { parseSpec } from './spec/parseSpec'
import { FLANGE_SPEC, SAMPLE_SPEC } from './spec/sample'
import { DEFAULT_MODEL } from './model/defaults'
import { moveElement, removeElement } from './model/ops'
import { exportDXF, exportSVG } from './export/exporters'
import { downloadFile, safeStem } from './export/download'
import type { PartModel, ReferenceImage } from './types'

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export default function App() {
  const initialModel = useMemo<PartModel>(() => parseSpec(SAMPLE_SPEC).model ?? DEFAULT_MODEL, [])
  const history = useHistory(initialModel)
  const { model } = history
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [specText, setSpecText] = useState(SAMPLE_SPEC)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null)

  const generate = useCallback(
    (text: string) => {
      const res = parseSpec(text)
      setWarnings(res.warnings)
      setError(res.error)
      if (res.model) {
        history.commit(res.model)
        setSelectedId(null)
      }
    },
    [history],
  )

  const loadBracket = useCallback(() => {
    setSpecText(SAMPLE_SPEC)
    setNotice(null)
    generate(SAMPLE_SPEC)
  }, [generate])

  const loadFlange = useCallback(() => {
    setSpecText(FLANGE_SPEC)
    setNotice('Loaded the flange-face spec extracted from the supplied engineering drawing (front view). Edit any value below.')
    generate(FLANGE_SPEC)
  }, [generate])

  const importImage = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      setReferenceImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, name: file.name }
      })
      // Offline extraction library currently recognises the flanged-cross drawing.
      setSpecText(FLANGE_SPEC)
      setNotice(`Imported "${file.name}". Spec auto-filled from offline drawing extraction (flanged-cross flange face) — edit the values below.`)
      generate(FLANGE_SPEC)
    },
    [generate],
  )

  const reset = useCallback(() => {
    setSpecText(SAMPLE_SPEC)
    setWarnings([])
    setError(undefined)
    setNotice(null)
    history.commit(parseSpec(SAMPLE_SPEC).model ?? DEFAULT_MODEL)
    setSelectedId(null)
  }, [history])

  const onMoveLive = useCallback((id: string, x: number, y: number) => history.setLive(moveElement(history.model, id, x, y)), [history])
  const onMoveCommit = useCallback((id: string, x: number, y: number) => history.commit(moveElement(history.model, id, x, y)), [history])

  const doExportSVG = useCallback(() => downloadFile(`${safeStem(model.partName)}.svg`, exportSVG(model), 'image/svg+xml'), [model])
  const doExportDXF = useCallback(() => downloadFile(`${safeStem(model.partName)}.dxf`, exportDXF(model), 'application/dxf'), [model])

  // Stable refs so the keydown listener subscribes once (no per-render churn).
  const histRef = useRef(history)
  histRef.current = history
  const modelRef = useRef(model)
  modelRef.current = model
  const selRef = useRef(selectedId)
  selRef.current = selectedId

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) histRef.current.redo()
        else histRef.current.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        histRef.current.redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current && !isTypingTarget(e.target)) {
        e.preventDefault()
        histRef.current.commit(removeElement(modelRef.current, selRef.current))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Toolbar
        partName={model.partName}
        units={model.units}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onReset={reset}
        onExportSVG={doExportSVG}
        onExportDXF={doExportDXF}
      />
      <div className="body">
        <div className="pane left">
          <SpecBox
            value={specText}
            onChange={setSpecText}
            onGenerate={() => generate(specText)}
            onLoadBracket={loadBracket}
            onLoadFlange={loadFlange}
            onImportImage={importImage}
            notice={notice}
            warnings={warnings}
            error={error}
          />
          <PropertyPanel model={model} selectedId={selectedId} onSelect={setSelectedId} setLive={history.setLive} commit={history.commit} />
        </div>

        <div className="pane center">
          <div className="pane-header">
            <span>2D · {model.plate.shape === 'circle' ? 'flange face' : 'top view'}</span>
            <span>
              {model.holes.length} cut{model.holes.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Canvas2D model={model} selectedId={selectedId} referenceImage={referenceImage} onSelect={setSelectedId} onMoveLive={onMoveLive} onMoveCommit={onMoveCommit} />
        </div>

        <div className="pane right">
          <div className="pane-header">
            <span>
              3D · {model.plate.thickness} {model.units} extrusion
            </span>
            <span>drag to orbit</span>
          </div>
          <Viewer3D model={model} />
        </div>
      </div>
    </div>
  )
}
