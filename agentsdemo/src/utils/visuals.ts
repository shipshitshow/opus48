import type { NodeKind, NodeStatus } from '../types'

export const NODE_ICONS: Record<NodeKind, string> = {
  start: '◗',
  research: '🔍',
  plan: '🧭',
  build: '🔨',
  test: '🧪',
  review: '⚖️',
  fix: '🩹',
  done: '🏁',
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  retrying: 'Retrying',
  passed: 'Passed',
  failed: 'Failed',
}
