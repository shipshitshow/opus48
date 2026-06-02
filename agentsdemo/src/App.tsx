import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayState } from './types'
import { advance, buildReport, createRun } from './engine/simulator'
import { GraphCanvas } from './components/GraphCanvas'
import { Inspector } from './components/Inspector'
import { Timeline } from './components/Timeline'
import { Toolbar, type Speed } from './components/Toolbar'
import { FinalReport } from './components/FinalReport'

/** Base ms between micro-steps at 1× speed. */
const BASE_INTERVAL = 620

export function App() {
  const [run, setRun] = useState(createRun)
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [speed, setSpeed] = useState<Speed>(1)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const reportShown = useRef(false)

  // ---- controls (all stable via functional updates) ----
  const doStart = useCallback(
    () => setPlayState((p) => (p === 'finished' ? p : 'playing')),
    [],
  )
  const doPause = useCallback(() => setPlayState('paused'), [])
  const doStep = useCallback(() => {
    setPlayState((p) => (p === 'playing' ? 'paused' : p))
    setRun((prev) => (prev.finished ? prev : advance(prev)))
  }, [])
  const doReset = useCallback(() => {
    reportShown.current = false
    setSelectedNodeId(null)
    setReportOpen(false)
    setPlayState('idle')
    setRun(createRun())
  }, [])
  const togglePlay = useCallback(
    () =>
      setPlayState((p) =>
        p === 'playing' ? 'paused' : p === 'finished' ? p : 'playing',
      ),
    [],
  )

  // ---- play loop ----
  useEffect(() => {
    if (playState !== 'playing') return
    const interval = Math.max(70, BASE_INTERVAL / speed)
    const id = window.setInterval(() => {
      setRun((prev) => (prev.finished ? prev : advance(prev)))
    }, interval)
    return () => window.clearInterval(id)
  }, [playState, speed])

  // ---- react to completion ----
  useEffect(() => {
    if (!run.finished) return
    setPlayState('finished')
    if (!reportShown.current) {
      reportShown.current = true
      setReportOpen(true)
    }
  }, [run.finished])

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        doStep()
      } else if (e.key.toLowerCase() === 'r') {
        doReset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, doStep, doReset])

  // ---- inspector focus: explicit selection, else follow the live node ----
  const focusNode = useMemo(() => {
    if (selectedNodeId) return run.nodes[selectedNodeId] ?? null
    const runningId = run.order.find((id) => {
      const s = run.nodes[id].status
      return s === 'running' || s === 'retrying'
    })
    const lastEvent = run.timeline[run.timeline.length - 1]
    const followId = runningId ?? lastEvent?.nodeId ?? null
    return followId ? run.nodes[followId] : null
  }, [run, selectedNodeId])

  const report = useMemo(() => buildReport(run), [run])

  return (
    <div className="app">
      <Toolbar
        run={run}
        playState={playState}
        speed={speed}
        onStart={doStart}
        onPause={doPause}
        onStep={doStep}
        onReset={doReset}
        onSpeedChange={setSpeed}
        onOpenReport={() => setReportOpen(true)}
      />

      <main className="app__main">
        <div className="app__canvas">
          <GraphCanvas
            run={run}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onPaneClick={() => setSelectedNodeId(null)}
          />
        </div>
        <aside className="app__inspector">
          <Inspector node={focusNode} run={run} />
        </aside>
      </main>

      <Timeline
        run={run}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />

      {reportOpen && run.finished && (
        <FinalReport
          report={report}
          onClose={() => setReportOpen(false)}
          onReset={doReset}
        />
      )}
    </div>
  )
}
