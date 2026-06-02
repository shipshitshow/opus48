import { useMemo } from 'react'
import type { RunState } from '../types'
import { NODE_ICONS } from '../utils/visuals'
import { formatClock, formatCost, formatDuration } from '../utils/format'

interface TimelineProps {
  run: RunState
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}

const NOMINAL_LIVE_MS = 8000

export function Timeline({ run, selectedNodeId, onSelectNode }: TimelineProps) {
  const events = run.timeline

  // While a node is executing, the cursor (activeNodeId) points at it, so we can
  // resolve the live node in O(1) instead of scanning every node each frame.
  const liveNode = useMemo(() => {
    if (!run.activeNodeId) return undefined
    const node = run.nodes[run.activeNodeId]
    return node.status === 'running' || node.status === 'retrying' ? node : undefined
  }, [run.activeNodeId, run.nodes])

  const sumDur = events.reduce((s, e) => s + e.durationMs, 0)
  const total = sumDur + (liveNode ? NOMINAL_LIVE_MS : 0) || 1

  return (
    <section className="timeline" aria-label="Run timeline">
      <div className="timeline__head">
        <h2 className="timeline__title">Run Timeline</h2>
        <div className="timeline__legend">
          <span className="lg lg--pass">pass</span>
          <span className="lg lg--fail">fail</span>
          <span className="lg lg--retry">retry</span>
          <span className="lg lg--live">running</span>
        </div>
        <div className="timeline__clock">
          <span>{events.length} step{events.length === 1 ? '' : 's'}</span>
          <span className="timeline__time">{formatClock(run.clock)}</span>
        </div>
      </div>

      {events.length === 0 && !liveNode ? (
        <div className="timeline__empty">
          No steps yet — press <kbd>Start</kbd> or <kbd>Step</kbd> to begin.
        </div>
      ) : (
        <div className="timeline__track">
          {events.map((e) => {
            const widthPct = (e.durationMs / total) * 100
            const isSelected = e.nodeId === selectedNodeId
            const cls = [
              'tl-seg',
              `tl-seg--${e.outcome}`,
              e.attempt > 1 ? 'tl-seg--retry' : '',
              isSelected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={e.id}
                type="button"
                className={cls}
                style={{ width: `${Math.max(widthPct, 4)}%` }}
                onClick={() => onSelectNode(e.nodeId)}
                title={`${e.label} · attempt ${e.attempt} · ${e.outcome.toUpperCase()} · ${formatDuration(
                  e.durationMs,
                )} · ${formatCost(e.cost)}`}
              >
                <span className="tl-seg__icon" aria-hidden>
                  {NODE_ICONS[e.kind]}
                </span>
                <span className="tl-seg__label">
                  {e.label}
                  {e.attempt > 1 ? ` ·${e.attempt}` : ''}
                </span>
              </button>
            )
          })}

          {liveNode && (
            <button
              type="button"
              className={`tl-seg tl-seg--live${
                liveNode.id === selectedNodeId ? ' is-selected' : ''
              }`}
              style={{ width: `${(NOMINAL_LIVE_MS / total) * 100}%` }}
              onClick={() => onSelectNode(liveNode.id)}
              title={`${liveNode.label} · running`}
            >
              <span className="tl-seg__icon" aria-hidden>
                {NODE_ICONS[liveNode.kind]}
              </span>
              <span className="tl-seg__label">{liveNode.label}…</span>
            </button>
          )}
        </div>
      )}
    </section>
  )
}
