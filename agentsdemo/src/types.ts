// ---------------------------------------------------------------------------
// AgentFlow Debugger — shared domain types
// ---------------------------------------------------------------------------

/** The eight workflow stages an autonomous coding agent moves through. */
export type NodeKind =
  | 'start'
  | 'research'
  | 'plan'
  | 'build'
  | 'test'
  | 'review'
  | 'fix'
  | 'done'

/** Visual / lifecycle status of a single node. */
export type NodeStatus =
  | 'pending' // not yet reached
  | 'running' // currently executing (first attempt)
  | 'retrying' // currently executing again after an upstream failure
  | 'passed' // completed successfully
  | 'failed' // completed with a failing result (e.g. review rejected)

/** Player / run-level state, owned by the UI control loop. */
export type PlayState = 'idle' | 'playing' | 'paused' | 'finished'

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: string
  /** Simulated milliseconds since the run started. */
  ts: number
  level: LogLevel
  message: string
}

export type ArtifactKind =
  | 'doc'
  | 'file'
  | 'diagram'
  | 'test'
  | 'report'
  | 'data'

export interface Artifact {
  id: string
  name: string
  kind: ArtifactKind
  summary: string
  /** Optional short content preview shown in the inspector. */
  preview?: string
  /** Human-readable size, e.g. "4.2 KB". */
  size?: string
}

/** Per-run mutable state for a single workflow node. */
export interface NodeRuntime {
  id: string
  kind: NodeKind
  label: string
  /** Static one-line description of the node's job. */
  blurb: string
  status: NodeStatus
  /** How many times this node has executed (0 before first run). */
  attempts: number
  /** Accumulated cost in USD across all attempts. */
  cost: number
  /** Accumulated simulated work duration in ms across all attempts. */
  durationMs: number
  /** Latest confidence score, 0..1. */
  confidence: number
  /** Accumulated model tokens across all attempts. */
  tokens: number
  logs: LogEntry[]
  artifacts: Artifact[]
  /** Run-clock ms when the current/last attempt started. */
  startedAt?: number
  /** Run-clock ms when the last attempt finished. */
  finishedAt?: number
}

export type TimelineEventType = 'enter' | 'pass' | 'fail' | 'retry'

/** One completed node execution, used by the run timeline. */
export interface TimelineEvent {
  id: string
  nodeId: string
  kind: NodeKind
  label: string
  /** Which attempt of the node this was (1-based). */
  attempt: number
  outcome: 'pass' | 'fail'
  /** Run-clock ms when this execution started. */
  startTs: number
  /** Run-clock ms when this execution ended. */
  endTs: number
  durationMs: number
  cost: number
}

/** Static graph edge definition. */
export interface FlowEdgeDef {
  id: string
  source: NodeKind
  target: NodeKind
  label?: string
  /** Branch semantics, used for styling. */
  branch?: 'forward' | 'pass' | 'fail' | 'retry'
  sourceHandle?: string
  targetHandle?: string
}

/** The complete run state produced and advanced by the simulator. */
export interface RunState {
  /** Ordered list of node ids (graph order). */
  order: string[]
  nodes: Record<string, NodeRuntime>
  /** Node currently pointed at by the cursor (pending → running → done). */
  activeNodeId: string | null
  /** Edge id most recently traversed (for animated highlight). */
  activeEdgeId: string | null
  /** Simulated run clock in ms. */
  clock: number
  /** How many review outcomes have been consumed. */
  reviewIndex: number
  /** Number of fix→test→review retry cycles performed. */
  retries: number
  /** Count of failing checks encountered (failed reviews/tests). */
  failedChecks: number
  timeline: TimelineEvent[]
  /** Whether the run has reached and completed the Done node. */
  finished: boolean
  /** Monotonic counter backing deterministic ids. */
  seq: number
}

/** Aggregated final report, derived from a finished RunState. */
export interface FinalReport {
  task: string
  totalCost: number
  totalDurationMs: number
  totalTokens: number
  retries: number
  failedChecks: number
  nodesExecuted: number
  artifacts: Artifact[]
  /** Average confidence across nodes that ran. */
  avgConfidence: number
  /** Per-node summary rows. */
  rows: Array<{
    kind: NodeKind
    label: string
    status: NodeStatus
    attempts: number
    cost: number
    durationMs: number
    confidence: number
  }>
  /** Narrative bullet points describing what happened. */
  narrative: string[]
}
