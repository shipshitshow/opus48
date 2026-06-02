import { useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { NodeStatus, RunState } from '../types'
import { EDGE_DEFS, NODE_DEFS } from '../engine/simulator'
import { AgentNode, type AgentNodeData } from './AgentNode'

const nodeTypes = { agentNode: AgentNode }

const STATUS_HEX: Record<NodeStatus, string> = {
  pending: '#5b6478',
  running: '#3b82f6',
  retrying: '#f59e0b',
  passed: '#22c55e',
  failed: '#ef4444',
}

const BRANCH_HEX: Record<string, { base: string; active: string }> = {
  forward: { base: '#46506b', active: '#9fb1d8' },
  pass: { base: '#2c8f57', active: '#43e08c' },
  fail: { base: '#b23b4c', active: '#ff6b7e' },
  retry: { base: '#b67a2c', active: '#ffb454' },
}

interface GraphCanvasProps {
  run: RunState
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onPaneClick: () => void
}

export function GraphCanvas({
  run,
  selectedNodeId,
  onSelectNode,
  onPaneClick,
}: GraphCanvasProps) {
  const nodes: Node<AgentNodeData>[] = useMemo(
    () =>
      NODE_DEFS.map((def) => ({
        id: def.kind,
        type: 'agentNode',
        position: def.position,
        data: { runtime: run.nodes[def.kind] },
        selected: selectedNodeId === def.kind,
        draggable: false,
        connectable: false,
      })),
    [run.nodes, selectedNodeId],
  )

  const edges: Edge[] = useMemo(
    () =>
      EDGE_DEFS.map((def) => {
        const isActive = run.activeEdgeId === def.id
        const palette = BRANCH_HEX[def.branch ?? 'forward'] ?? BRANCH_HEX.forward
        const color = isActive ? palette.active : palette.base
        return {
          id: def.id,
          source: def.source,
          target: def.target,
          sourceHandle: def.sourceHandle,
          targetHandle: def.targetHandle,
          label: def.label,
          type: 'smoothstep',
          animated: isActive,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
          style: { stroke: color, strokeWidth: isActive ? 2.6 : 1.5 },
          labelStyle: {
            fill: color,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          },
          labelBgStyle: { fill: '#0d1320', fillOpacity: 0.85 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
        }
      }),
    [run.activeEdgeId],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={onPaneClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: 0.22 }}
      minZoom={0.3}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
      className="graph-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#202a40" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => STATUS_HEX[run.nodes[n.id]?.status ?? 'pending']}
        nodeStrokeColor="#0d1320"
        maskColor="rgba(8, 12, 22, 0.72)"
        className="graph-minimap"
      />
    </ReactFlow>
  )
}
