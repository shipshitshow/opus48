// ---------------------------------------------------------------------------
// The simulator: a pure, deterministic state machine that advances a task
// through the workflow one micro-step at a time.
//
// Lifecycle of every node: pending → (enter) running|retrying → (complete)
// passed|failed. `advance()` performs exactly one enter OR one complete, so the
// UI can play it on a timer or step through it by hand and see each transition.
// ---------------------------------------------------------------------------

import type {
  FinalReport,
  LogEntry,
  NodeKind,
  NodeRuntime,
  RunState,
  TimelineEvent,
} from '../types'
import {
  EDGE_DEFS,
  NODE_DEFS,
  REVIEW_PLAN,
  SEED_TASK,
  getNodeWork,
} from '../data/task'
import {
  formatCost,
  formatDuration,
  formatPct,
  formatTokens,
} from '../utils/format'

/** Logical ordering used for report rows and timeline grouping. */
export const NODE_ORDER: NodeKind[] = [
  'start',
  'research',
  'plan',
  'build',
  'test',
  'review',
  'fix',
  'done',
]

const START_KIND: NodeKind = 'start'

function makeNode(def: (typeof NODE_DEFS)[number]): NodeRuntime {
  return {
    id: def.kind,
    kind: def.kind,
    label: def.label,
    blurb: def.blurb,
    status: 'pending',
    attempts: 0,
    cost: 0,
    durationMs: 0,
    confidence: 0,
    tokens: 0,
    logs: [],
    artifacts: [],
  }
}

/** Build a fresh run with every node pending and the cursor on Start. */
export function createRun(): RunState {
  const nodes: Record<string, NodeRuntime> = {}
  for (const def of NODE_DEFS) nodes[def.kind] = makeNode(def)
  return {
    order: NODE_DEFS.map((d) => d.kind),
    nodes,
    activeNodeId: START_KIND,
    activeEdgeId: null,
    clock: 0,
    reviewIndex: 0,
    retries: 0,
    failedChecks: 0,
    timeline: [],
    finished: false,
    seq: 0,
  }
}

interface Route {
  nextKind: NodeKind | null
  edgeId: string | null
  isRetry: boolean
}

/** Decide where the run goes after a node completes. */
function route(kind: NodeKind, outcome: 'pass' | 'fail'): Route {
  switch (kind) {
    case 'start':
      return { nextKind: 'research', edgeId: 'e-start-research', isRetry: false }
    case 'research':
      return { nextKind: 'plan', edgeId: 'e-research-plan', isRetry: false }
    case 'plan':
      return { nextKind: 'build', edgeId: 'e-plan-build', isRetry: false }
    case 'build':
      return { nextKind: 'test', edgeId: 'e-build-test', isRetry: false }
    case 'test':
      // Test always reports to the Review gate, pass or fail.
      return { nextKind: 'review', edgeId: 'e-test-review', isRetry: false }
    case 'review':
      return outcome === 'pass'
        ? { nextKind: 'done', edgeId: 'e-review-done', isRetry: false }
        : { nextKind: 'fix', edgeId: 'e-review-fix', isRetry: true }
    case 'fix':
      return { nextKind: 'test', edgeId: 'e-fix-test', isRetry: false }
    case 'done':
      return { nextKind: null, edgeId: null, isRetry: false }
  }
}

/** True when the next advance() will start a node rather than finish one. */
export function nextIsEnter(state: RunState): boolean {
  if (state.finished || !state.activeNodeId) return false
  return state.nodes[state.activeNodeId].status === 'pending'
}

/**
 * Advance the run by exactly one micro-step (one enter or one complete).
 * Returns a new RunState; the input is never mutated.
 */
export function advance(state: RunState): RunState {
  if (state.finished || !state.activeNodeId) return state

  const active = state.nodes[state.activeNodeId]
  const isEnter = active.status === 'pending'

  let seq = state.seq
  const genId = (prefix: string) => `${prefix}-${seq++}`

  if (isEnter) {
    // ---- ENTER: mark the node running/retrying ----
    const attempts = active.attempts + 1
    const status = attempts > 1 ? 'retrying' : 'running'
    const startLog: LogEntry = {
      id: genId('log'),
      ts: state.clock,
      level: 'info',
      message:
        attempts > 1
          ? `↻ ${active.label} re-running (attempt ${attempts})`
          : `▶ ${active.label} started`,
    }
    const updated: NodeRuntime = {
      ...active,
      attempts,
      status,
      startedAt: state.clock,
      finishedAt: undefined,
      logs: [...active.logs, startLog],
    }
    return {
      ...state,
      nodes: { ...state.nodes, [active.id]: updated },
      seq,
    }
  }

  // ---- COMPLETE: run the work, set outcome, route to the next node ----
  const work = getNodeWork(active.kind, active.attempts)
  const startedAt = active.startedAt ?? state.clock
  const finishedAt = startedAt + work.durationMs

  // Spread the work logs across the node's simulated execution window.
  const n = work.logs.length
  const workLogs: LogEntry[] = work.logs.map((raw, i) => ({
    id: genId('log'),
    ts: Math.round(startedAt + ((i + 1) / (n + 1)) * work.durationMs),
    level: raw.level,
    message: raw.message,
  }))

  const artifacts = work.artifacts.map((raw) => ({ ...raw, id: genId('art') }))

  // Outcome: the Review node is the gate (planned outcomes); everything else
  // is pass unless its own work reported a failure.
  let reviewIndex = state.reviewIndex
  let outcome: 'pass' | 'fail'
  if (active.kind === 'review') {
    outcome = REVIEW_PLAN[reviewIndex] ?? 'pass'
    reviewIndex += 1
  } else {
    outcome = work.failed ? 'fail' : 'pass'
  }

  const updated: NodeRuntime = {
    ...active,
    status: outcome === 'pass' ? 'passed' : 'failed',
    cost: active.cost + work.cost,
    durationMs: active.durationMs + work.durationMs,
    tokens: active.tokens + work.tokens,
    confidence: work.confidence,
    finishedAt,
    logs: [...active.logs, ...workLogs],
    artifacts: [...active.artifacts, ...artifacts],
  }

  const event: TimelineEvent = {
    id: genId('evt'),
    nodeId: active.id,
    kind: active.kind,
    label: active.label,
    attempt: active.attempts,
    outcome,
    startTs: startedAt,
    endTs: finishedAt,
    durationMs: work.durationMs,
    cost: work.cost,
  }

  const { nextKind, edgeId, isRetry } = route(active.kind, outcome)

  const nodes = { ...state.nodes, [active.id]: updated }
  let activeNodeId: string | null = null
  let finished: boolean = state.finished

  if (nextKind) {
    // Re-arm the next node so the following advance() will enter it.
    nodes[nextKind] = { ...nodes[nextKind], status: 'pending' }
    activeNodeId = nextKind
  } else {
    finished = true
  }

  return {
    ...state,
    nodes,
    activeNodeId,
    activeEdgeId: edgeId,
    clock: finishedAt,
    reviewIndex,
    retries: state.retries + (isRetry ? 1 : 0),
    failedChecks: state.failedChecks + (outcome === 'fail' ? 1 : 0),
    timeline: [...state.timeline, event],
    finished,
    seq,
  }
}

// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------

export function buildReport(state: RunState): FinalReport {
  const ran = NODE_ORDER.map((k) => state.nodes[k]).filter(
    (node) => node && node.attempts > 0,
  )

  const totalCost = ran.reduce((s, node) => s + node.cost, 0)
  const totalDurationMs = ran.reduce((s, node) => s + node.durationMs, 0)
  const totalTokens = ran.reduce((s, node) => s + node.tokens, 0)
  const avgConfidence =
    ran.length === 0
      ? 0
      : ran.reduce((s, node) => s + node.confidence, 0) / ran.length

  const artifacts = ran.flatMap((node) => node.artifacts)

  const rows = ran.map((node) => ({
    kind: node.kind,
    label: node.label,
    status: node.status,
    attempts: node.attempts,
    cost: node.cost,
    durationMs: node.durationMs,
    confidence: node.confidence,
  }))

  const totalExecutions = ran.reduce((s, node) => s + node.attempts, 0)
  const costliest =
    ran.length > 0
      ? ran.reduce((max, node) => (node.cost > max.cost ? node : max))
      : null

  const narrative = [
    `Completed “${SEED_TASK}” across ${ran.length} workflow stages (${totalExecutions} total executions).`,
    state.retries > 0
      ? `The reviewer rejected the first build — ${state.failedChecks} failing check${state.failedChecks === 1 ? '' : 's'} — triggering ${state.retries} fix → test → review retry cycle${state.retries === 1 ? '' : 's'} before approval.`
      : `The reviewer approved the build on the first pass with no retries.`,
    `Burned ${formatDuration(totalDurationMs)} of simulated agent time and ${formatCost(totalCost)} across ${formatTokens(totalTokens)} tokens.`,
    `Produced ${artifacts.length} artifacts; the costliest stage was ${costliest?.label ?? '—'} at ${formatCost(costliest?.cost ?? 0)}.`,
    `Final mean confidence settled at ${formatPct(avgConfidence)} after fixes to SVG export and the 3D preview.`,
  ]

  return {
    task: SEED_TASK,
    totalCost,
    totalDurationMs,
    totalTokens,
    retries: state.retries,
    failedChecks: state.failedChecks,
    nodesExecuted: ran.length,
    artifacts,
    avgConfidence,
    rows,
    narrative,
  }
}

/** Re-export so the App can map edge ids without re-importing the data. */
export { EDGE_DEFS, NODE_DEFS }
