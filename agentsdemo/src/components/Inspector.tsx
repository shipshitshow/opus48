import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Artifact, LogEntry, NodeRuntime, RunState } from '../types'
import { NODE_DEF_BY_KIND, SEED_TASK, TASK_ID, artifactIcon } from '../data/task'
import { NODE_ICONS, STATUS_LABEL } from '../utils/visuals'
import {
  formatClock,
  formatCost,
  formatDuration,
  formatPct,
  formatTokens,
} from '../utils/format'

interface InspectorProps {
  node: NodeRuntime | null
  run: RunState
}

export function Inspector({ node, run }: InspectorProps) {
  if (!node) return <OverviewPanel run={run} />
  return <NodePanel node={node} />
}

function NodePanel({ node }: { node: NodeRuntime }) {
  const def = NODE_DEF_BY_KIND[node.kind]
  const ran = node.attempts > 0
  const live = node.status === 'running' || node.status === 'retrying'
  const logsRef = useRef<HTMLUListElement>(null)

  // Keep the newest log in view while a node is actively running.
  useEffect(() => {
    if (live && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [node.logs.length, live])

  return (
    <div className="inspector">
      <header className="inspector__head">
        <div className="inspector__title">
          <span className="inspector__icon" aria-hidden>
            {NODE_ICONS[node.kind]}
          </span>
          <div>
            <h2>{node.label}</h2>
            <span className="inspector__sub">
              {def.agent} · {def.model}
            </span>
          </div>
        </div>
        <span className={`status-pill badge-${node.status}`}>
          {STATUS_LABEL[node.status]}
        </span>
      </header>

      <p className="inspector__blurb">{node.blurb}</p>

      <div className="stat-grid">
        <Stat label="Attempts" value={ran ? `${node.attempts}` : '—'} />
        <Stat label="Duration" value={ran ? formatDuration(node.durationMs) : '—'} />
        <Stat label="Cost" value={ran ? formatCost(node.cost) : '—'} />
        <Stat label="Tokens" value={ran ? formatTokens(node.tokens) : '—'} />
      </div>

      {ran && (
        <div className="conf-row">
          <span className="conf-row__label">Confidence</span>
          <div className="conf-row__track">
            <div
              className="conf-row__fill"
              style={{ width: `${Math.round(node.confidence * 100)}%` }}
            />
          </div>
          <span className="conf-row__val">{formatPct(node.confidence)}</span>
        </div>
      )}

      <Section title="Logs" count={node.logs.length}>
        {node.logs.length === 0 ? (
          <p className="muted">No logs yet — this node hasn’t run.</p>
        ) : (
          <ul className="log-list" ref={logsRef}>
            {node.logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Artifacts" count={node.artifacts.length}>
        {node.artifacts.length === 0 ? (
          <p className="muted">No artifacts produced yet.</p>
        ) : (
          <ul className="artifact-list">
            {node.artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function OverviewPanel({ run }: { run: RunState }) {
  const executed = run.order.filter((id) => run.nodes[id].attempts > 0).length
  return (
    <div className="inspector">
      <header className="inspector__head">
        <div className="inspector__title">
          <span className="inspector__icon" aria-hidden>
            🛰️
          </span>
          <div>
            <h2>Run Overview</h2>
            <span className="inspector__sub">{TASK_ID}</span>
          </div>
        </div>
      </header>

      <p className="inspector__blurb">{SEED_TASK}</p>

      <div className="stat-grid">
        <Stat label="Stages run" value={`${executed}/${run.order.length}`} />
        <Stat label="Elapsed" value={formatClock(run.clock)} />
        <Stat label="Retries" value={`${run.retries}`} />
        <Stat label="Failed checks" value={`${run.failedChecks}`} />
      </div>

      <Section title="Legend" count={null}>
        <ul className="legend-list">
          <li><span className="dot status-pending" /> Pending — not yet reached</li>
          <li><span className="dot status-running" /> Running — executing now</li>
          <li><span className="dot status-retrying" /> Retrying — re-running after a failure</li>
          <li><span className="dot status-passed" /> Passed — completed cleanly</li>
          <li><span className="dot status-failed" /> Failed — review rejected</li>
        </ul>
      </Section>

      <Section title="How to use" count={null}>
        <ul className="help-list">
          <li>Press <kbd>Start</kbd> to play, or <kbd>Step</kbd> to advance one micro-step.</li>
          <li>Click any node or timeline segment to inspect its logs &amp; artifacts.</li>
          <li>Click empty canvas to return to this overview.</li>
          <li>The reviewer fails the first build, triggering a fix → test → review retry.</li>
        </ul>
      </Section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number | null
  children: ReactNode
}) {
  return (
    <section className="insp-section">
      <h3 className="insp-section__head">
        {title}
        {count !== null && <span className="insp-section__count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function LogRow({ log }: { log: LogEntry }) {
  return (
    <li className={`log-row log-${log.level}`}>
      <span className="log-row__ts">{formatClock(log.ts)}</span>
      <span className={`log-row__lvl lvl-${log.level}`}>{log.level}</span>
      <span className="log-row__msg">{log.message}</span>
    </li>
  )
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false)
  const hasPreview = Boolean(artifact.preview)
  return (
    <li className="artifact-card">
      <button
        type="button"
        className="artifact-card__head"
        onClick={() => hasPreview && setOpen((o) => !o)}
        aria-expanded={hasPreview ? open : undefined}
        data-clickable={hasPreview}
      >
        <span className="artifact-card__icon" aria-hidden>
          {artifactIcon(artifact.kind)}
        </span>
        <span className="artifact-card__info">
          <span className="artifact-card__name">{artifact.name}</span>
          <span className="artifact-card__summary">{artifact.summary}</span>
        </span>
        <span className="artifact-card__meta">
          <span className="artifact-card__kind">{artifact.kind}</span>
          {artifact.size && <span className="artifact-card__size">{artifact.size}</span>}
          {hasPreview && <span className="artifact-card__chev">{open ? '▾' : '▸'}</span>}
        </span>
      </button>
      {hasPreview && open && <pre className="artifact-card__preview">{artifact.preview}</pre>}
    </li>
  )
}
