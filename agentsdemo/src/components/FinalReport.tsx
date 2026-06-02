import { useEffect } from 'react'
import type { FinalReport as Report } from '../types'
import { artifactIcon } from '../data/task'
import { NODE_ICONS, STATUS_LABEL } from '../utils/visuals'
import {
  formatCost,
  formatDuration,
  formatPct,
  formatTokens,
} from '../utils/format'

interface FinalReportProps {
  report: Report
  onClose: () => void
  onReset: () => void
}

export function FinalReport({ report, onClose, onReset }: FinalReportProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Final report">
      <div className="report-backdrop" onClick={onClose} />
      <div className="report-modal">
        <header className="report__head">
          <div className="report__title">
            <span className="report__icon" aria-hidden>
              🏁
            </span>
            <div>
              <h2>Final Report</h2>
              <span className="report__task">{report.task}</span>
            </div>
          </div>
          <button className="report__close" onClick={onClose} aria-label="Close report">
            ✕
          </button>
        </header>

        <div className="report__body">
          <div className="report__tiles">
            <Tile label="Total cost" value={formatCost(report.totalCost)} accent="cost" />
            <Tile label="Sim. time" value={formatDuration(report.totalDurationMs)} accent="time" />
            <Tile label="Tokens" value={formatTokens(report.totalTokens)} accent="tok" />
            <Tile label="Retries" value={`${report.retries}`} accent="retry" />
            <Tile label="Failed checks" value={`${report.failedChecks}`} accent="fail" />
            <Tile label="Avg confidence" value={formatPct(report.avgConfidence)} accent="conf" />
            <Tile label="Artifacts" value={`${report.artifacts.length}`} accent="art" />
            <Tile label="Stages run" value={`${report.nodesExecuted}`} accent="stage" />
          </div>

          <section className="report__section">
            <h3>What happened</h3>
            <ul className="report__narrative">
              {report.narrative.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="report__section">
            <h3>Per-stage breakdown</h3>
            <div className="report__table-wrap">
              <table className="report__table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Status</th>
                    <th className="num">Attempts</th>
                    <th className="num">Duration</th>
                    <th className="num">Cost</th>
                    <th className="num">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.kind}>
                      <td>
                        <span className="report__stage">
                          <span aria-hidden>{NODE_ICONS[row.kind]}</span> {row.label}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill sm badge-${row.status}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="num">{row.attempts}</td>
                      <td className="num">{formatDuration(row.durationMs)}</td>
                      <td className="num">{formatCost(row.cost)}</td>
                      <td className="num">{formatPct(row.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="report__section">
            <h3>Artifacts ({report.artifacts.length})</h3>
            <ul className="report__artifacts">
              {report.artifacts.map((a) => (
                <li key={a.id} className="report__artifact">
                  <span className="report__artifact-icon" aria-hidden>
                    {artifactIcon(a.kind)}
                  </span>
                  <span className="report__artifact-name">{a.name}</span>
                  <span className="report__artifact-summary">{a.summary}</span>
                  {a.size && <span className="report__artifact-size">{a.size}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="report__foot">
          <button className="ctl" onClick={onClose}>
            Close
          </button>
          <button className="ctl ctl--primary" onClick={onReset}>
            <span aria-hidden>↺</span> Run again
          </button>
        </footer>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className={`report-tile accent-${accent}`}>
      <span className="report-tile__value">{value}</span>
      <span className="report-tile__label">{label}</span>
    </div>
  )
}
