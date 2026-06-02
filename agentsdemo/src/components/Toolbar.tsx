import type { ReactNode } from 'react'
import type { PlayState, RunState } from '../types'
import { SEED_TASK, TASK_ID } from '../data/task'
import { formatClock, formatCost } from '../utils/format'

export const SPEEDS = [0.5, 1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]

const PLAY_LABEL: Record<PlayState, string> = {
  idle: 'Idle',
  playing: 'Running',
  paused: 'Paused',
  finished: 'Done',
}

interface ToolbarProps {
  run: RunState
  playState: PlayState
  speed: Speed
  onStart: () => void
  onPause: () => void
  onStep: () => void
  onReset: () => void
  onSpeedChange: (s: Speed) => void
  onOpenReport: () => void
}

export function Toolbar({
  run,
  playState,
  speed,
  onStart,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onOpenReport,
}: ToolbarProps) {
  const totalCost = run.order.reduce((s, id) => s + run.nodes[id].cost, 0)
  const executed = run.order.filter((id) => run.nodes[id].attempts > 0).length

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo" aria-hidden>
          ◢◣
        </span>
        <div className="toolbar__titles">
          <span className="toolbar__name">AgentFlow Debugger</span>
          <span className="toolbar__task" title={SEED_TASK}>
            <span className="toolbar__task-id">{TASK_ID}</span>
            <span className="toolbar__task-name">{SEED_TASK}</span>
          </span>
        </div>
      </div>

      <div className="toolbar__stats" role="group" aria-label="Run stats">
        <Stat label="Status">
          <span className={`run-pill run-pill--${playState}`}>
            {PLAY_LABEL[playState]}
          </span>
        </Stat>
        <Stat label="Stages">{executed}/{run.order.length}</Stat>
        <Stat label="Elapsed">{formatClock(run.clock)}</Stat>
        <Stat label="Cost">{formatCost(totalCost)}</Stat>
        <Stat label="Retries">{run.retries}</Stat>
        <Stat label="Failed">{run.failedChecks}</Stat>
      </div>

      <div className="toolbar__controls">
        {playState === 'playing' ? (
          <button className="ctl" onClick={onPause} title="Pause (space)">
            <span aria-hidden>⏸</span> Pause
          </button>
        ) : (
          <button
            className="ctl ctl--primary"
            onClick={onStart}
            disabled={playState === 'finished'}
            title="Start / Resume (space)"
          >
            <span aria-hidden>▶</span> Start
          </button>
        )}
        <button
          className="ctl"
          onClick={onStep}
          disabled={playState === 'finished'}
          title="Step one micro-step (→)"
        >
          <span aria-hidden>⏭</span> Step
        </button>
        <button className="ctl" onClick={onReset} title="Reset run (R)">
          <span aria-hidden>↺</span> Reset
        </button>

        <label className="speed">
          <span className="speed__label">Speed</span>
          <select
            value={speed}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (SPEEDS.includes(next as Speed)) onSpeedChange(next as Speed)
            }}
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>

        <button
          className="ctl ctl--report"
          onClick={onOpenReport}
          disabled={!run.finished}
          title={run.finished ? 'Open final report' : 'Available after the run finishes'}
        >
          <span aria-hidden>📊</span> Report
        </button>
      </div>
    </header>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tb-stat">
      <span className="tb-stat__value">{children}</span>
      <span className="tb-stat__label">{label}</span>
    </div>
  )
}
