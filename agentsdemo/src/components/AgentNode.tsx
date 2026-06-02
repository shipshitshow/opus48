import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { NodeRuntime } from '../types'
import { NODE_ICONS, STATUS_LABEL } from '../utils/visuals'
import { formatCost, formatDuration, formatPct } from '../utils/format'

export interface AgentNodeData {
  runtime: NodeRuntime
}

function AgentNodeComponent({ data, selected }: NodeProps<AgentNodeData>) {
  const { runtime } = data
  const ran = runtime.attempts > 0
  const live = runtime.status === 'running' || runtime.status === 'retrying'

  return (
    <div
      className={`agent-node status-${runtime.status}${selected ? ' is-selected' : ''}${
        live ? ' is-live' : ''
      }`}
    >
      {/* Hidden handles — both source & target on every side for clean routing */}
      <Handle id="tl" type="target" position={Position.Left} className="afh" />
      <Handle id="sl" type="source" position={Position.Left} className="afh" />
      <Handle id="tr" type="target" position={Position.Right} className="afh" />
      <Handle id="sr" type="source" position={Position.Right} className="afh" />
      <Handle id="tt" type="target" position={Position.Top} className="afh afh-left" />
      <Handle id="stp" type="source" position={Position.Top} className="afh afh-right" />
      <Handle id="tb" type="target" position={Position.Bottom} className="afh afh-left" />
      <Handle id="sb" type="source" position={Position.Bottom} className="afh afh-right" />

      <span className="agent-node__accent" aria-hidden />

      <div className="agent-node__body">
        <header className="agent-node__head">
          <span className="agent-node__icon" aria-hidden>
            {NODE_ICONS[runtime.kind]}
          </span>
          <span className="agent-node__label">{runtime.label}</span>
          <span className={`agent-node__status badge-${runtime.status}`}>
            {STATUS_LABEL[runtime.status]}
          </span>
        </header>

        <p className="agent-node__blurb">{runtime.blurb}</p>

        <div className="agent-node__meta">
          {ran ? (
            <>
              <span title="Simulated duration">⏱ {formatDuration(runtime.durationMs)}</span>
              <span title="Cost">{formatCost(runtime.cost)}</span>
              {runtime.attempts > 1 && (
                <span className="agent-node__attempts" title="Attempts">
                  ×{runtime.attempts}
                </span>
              )}
            </>
          ) : (
            <span className="agent-node__waiting">queued</span>
          )}
        </div>

        {ran && (
          <div className="agent-node__conf" title={`Confidence ${formatPct(runtime.confidence)}`}>
            <div className="agent-node__conf-track">
              <div
                className="agent-node__conf-fill"
                style={{ width: `${Math.round(runtime.confidence * 100)}%` }}
              />
            </div>
            <span className="agent-node__conf-val">{formatPct(runtime.confidence)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Node layout is static and dragging is disabled, so only the runtime data and
// selection can change. `advance()` produces a new runtime object solely for the
// node that changed, leaving the others by reference — so this comparator lets
// unchanged nodes skip re-rendering on every simulator step.
export const AgentNode = memo(
  AgentNodeComponent,
  (a, b) => a.data.runtime === b.data.runtime && a.selected === b.selected,
)
