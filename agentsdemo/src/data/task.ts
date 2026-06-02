// ---------------------------------------------------------------------------
// Seed data for the AgentFlow Debugger.
//
// A single realistic task is modeled: building "PocketCAD". Each workflow node
// has a static definition (label, blurb, canvas position) plus a work-profile
// generator that produces the logs / artifacts / cost / etc. it emits when it
// executes. test + review run twice (the seeded failure → retry path).
// ---------------------------------------------------------------------------

import type {
  Artifact,
  ArtifactKind,
  FlowEdgeDef,
  LogLevel,
  NodeKind,
} from '../types'

export const SEED_TASK =
  'Build PocketCAD: browser CAD with 2D geometry, 3D preview, and SVG export.'

export const TASK_ID = 'POCKETCAD-001'

export interface NodeDef {
  kind: NodeKind
  label: string
  blurb: string
  /** Short role descriptor for the inspector. */
  agent: string
  model: string
  position: { x: number; y: number }
}

/** Left-to-right main line; Fix sits below to form the retry loop. */
export const NODE_DEFS: NodeDef[] = [
  {
    kind: 'start',
    label: 'Start',
    blurb: 'Provision sandbox and load the task specification.',
    agent: 'orchestrator',
    model: 'control-plane',
    position: { x: 0, y: 150 },
  },
  {
    kind: 'research',
    label: 'Research',
    blurb: 'Survey libraries and prior art; recommend an approach.',
    agent: 'researcher',
    model: 'claude-opus-4-8',
    position: { x: 240, y: 150 },
  },
  {
    kind: 'plan',
    label: 'Plan',
    blurb: 'Design the architecture, data model, and milestones.',
    agent: 'planner',
    model: 'claude-opus-4-8',
    position: { x: 480, y: 150 },
  },
  {
    kind: 'build',
    label: 'Build',
    blurb: 'Implement the modules described in the plan.',
    agent: 'builder',
    model: 'claude-opus-4-8',
    position: { x: 720, y: 150 },
  },
  {
    kind: 'test',
    label: 'Test',
    blurb: 'Run unit, integration, and visual test suites.',
    agent: 'tester',
    model: 'claude-sonnet-4-6',
    position: { x: 960, y: 150 },
  },
  {
    kind: 'review',
    label: 'Review',
    blurb: 'Gate the run against acceptance criteria — pass or fail.',
    agent: 'reviewer',
    model: 'claude-opus-4-8',
    position: { x: 1200, y: 150 },
  },
  {
    kind: 'done',
    label: 'Done',
    blurb: 'Package deliverables and emit the final report.',
    agent: 'orchestrator',
    model: 'control-plane',
    position: { x: 1440, y: 150 },
  },
  {
    kind: 'fix',
    label: 'Fix',
    blurb: 'Triage failing checks and patch the implementation.',
    agent: 'fixer',
    model: 'claude-opus-4-8',
    position: { x: 1080, y: 380 },
  },
]

/**
 * Edges. Handle ids match the custom node (see AgentNode). Every node renders
 * eight hidden handles — source + target on each side — so any route is clean:
 *   left:  target 'tl' / source 'sl'      right:  target 'tr' / source 'sr'
 *   top:   target 'tt' / source 'stp'     bottom: target 'tb' / source 'sb'
 */
export const EDGE_DEFS: FlowEdgeDef[] = [
  { id: 'e-start-research', source: 'start', target: 'research', branch: 'forward', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-research-plan', source: 'research', target: 'plan', branch: 'forward', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-plan-build', source: 'plan', target: 'build', branch: 'forward', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-build-test', source: 'build', target: 'test', branch: 'forward', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-test-review', source: 'test', target: 'review', branch: 'forward', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-review-done', source: 'review', target: 'done', label: 'pass', branch: 'pass', sourceHandle: 'sr', targetHandle: 'tl' },
  { id: 'e-review-fix', source: 'review', target: 'fix', label: 'fail', branch: 'fail', sourceHandle: 'sb', targetHandle: 'tt' },
  { id: 'e-fix-test', source: 'fix', target: 'test', label: 'retry', branch: 'retry', sourceHandle: 'stp', targetHandle: 'tb' },
]

export const NODE_DEF_BY_KIND = Object.fromEntries(
  NODE_DEFS.map((d) => [d.kind, d]),
) as Record<NodeKind, NodeDef>

/** Planned review outcomes, consumed in order. First fails, then passes. */
export const REVIEW_PLAN: Array<'pass' | 'fail'> = ['fail', 'pass']

// ---------------------------------------------------------------------------
// Work profiles
// ---------------------------------------------------------------------------

export interface RawLog {
  level: LogLevel
  message: string
}

export interface RawArtifact {
  name: string
  kind: ArtifactKind
  summary: string
  preview?: string
  size?: string
}

export interface NodeWork {
  logs: RawLog[]
  artifacts: RawArtifact[]
  cost: number
  durationMs: number
  confidence: number
  tokens: number
  /** Whether this execution should be recorded as a failing check. */
  failed: boolean
}

const l = (level: LogLevel, message: string): RawLog => ({ level, message })

/**
 * Produce the work a node performs on a given (1-based) attempt.
 * Stateless and deterministic so the simulation is reproducible.
 */
export function getNodeWork(kind: NodeKind, attempt: number): NodeWork {
  switch (kind) {
    case 'start':
      return {
        cost: 0.02,
        durationMs: 3200,
        confidence: 1.0,
        tokens: 1200,
        failed: false,
        logs: [
          l('info', `Initializing AgentFlow run ${TASK_ID}`),
          l('info', 'Loaded task: Build PocketCAD — 2D geometry, 3D preview, SVG export'),
          l('debug', 'Provisioning sandbox: node 20.x · 4 vCPU · 8 GB RAM'),
          l('success', 'Workspace ready. Handing off to Research.'),
        ],
        artifacts: [
          {
            name: 'task-spec.md',
            kind: 'doc',
            summary: 'Parsed task specification and success criteria',
            size: '1.8 KB',
            preview:
              '# PocketCAD\n\n## Goals\n- 2D geometry editor (line, rect, polygon, arc)\n- 3D extrude preview\n- SVG export\n\n## Acceptance\n- 14 checks across geometry / export / preview',
          },
        ],
      }

    case 'research':
      return {
        cost: 0.31,
        durationMs: 18400,
        confidence: 0.82,
        tokens: 24500,
        failed: false,
        logs: [
          l('info', 'Surveying rendering approaches for browser-based 2D CAD'),
          l('debug', 'Comparing <canvas> 2D, SVG DOM, and WebGL for the editor surface'),
          l('info', 'Evaluating 3D preview: three.js vs raw WebGL vs regl'),
          l('debug', 'three.js r160 — mature, tree-shakeable, solid ExtrudeGeometry'),
          l('info', 'Assessing SVG export fidelity (arcs, units, viewBox)'),
          l('warn', 'Boolean geometry ops (union/subtract) are nontrivial — flag for Plan'),
          l('success', 'Recommendation: canvas2d editor + three.js preview + custom SVG serializer'),
        ],
        artifacts: [
          {
            name: 'research-notes.md',
            kind: 'doc',
            summary: 'Library survey and trade-off matrix',
            size: '6.4 KB',
            preview:
              '## Rendering\n| Option | Pros | Cons |\n|--------|------|------|\n| canvas2d | fast, full control | manual hit-testing |\n| svg-dom | trivial export | slow at scale |\n| webgl | fastest | heavy to author |',
          },
          {
            name: 'tradeoffs.csv',
            kind: 'data',
            summary: 'Scored comparison of 9 candidate libraries',
            size: '2.1 KB',
          },
        ],
      }

    case 'plan':
      return {
        cost: 0.27,
        durationMs: 15200,
        confidence: 0.88,
        tokens: 21000,
        failed: false,
        logs: [
          l('info', 'Drafting architecture for PocketCAD'),
          l('info', 'Modules: geometry-core · editor-canvas · preview-3d · svg-export · app-shell'),
          l('debug', 'Geometry data model: Point, Segment, Arc, Polyline, Shape'),
          l('info', 'Milestones: M1 geometry+editor · M2 3D preview · M3 SVG export'),
          l('info', 'Test plan: unit (geometry) · integration (editor↔export) · visual (3D)'),
          l('success', 'Plan ratified — 5 modules · 3 milestones · 14 acceptance checks'),
        ],
        artifacts: [
          {
            name: 'architecture.md',
            kind: 'doc',
            summary: 'Module diagram and data model',
            size: '9.2 KB',
            preview:
              '## Modules\n- geometry-core — pure math, no DOM\n- editor-canvas — pointer → geometry\n- preview-3d — three.js extrude\n- svg-export — serializer\n- app-shell — layout + state',
          },
          {
            name: 'data-model.ts',
            kind: 'file',
            summary: 'TypeScript interfaces for geometry primitives',
            size: '3.0 KB',
            preview:
              'interface Point { x: number; y: number }\ninterface Segment { a: Point; b: Point }\ninterface Shape {\n  id: string\n  segments: Segment[]\n  closed: boolean\n}',
          },
          {
            name: 'plan.diagram',
            kind: 'diagram',
            summary: 'Architecture diagram (5 modules, 3 milestones)',
            size: '12.5 KB',
          },
        ],
      }

    case 'build':
      return {
        cost: 0.94,
        durationMs: 47200,
        confidence: 0.79,
        tokens: 68000,
        failed: false,
        logs: [
          l('info', 'Scaffolding Vite + TypeScript project'),
          l('info', 'geometry-core: vector math, segment intersection, bbox'),
          l('info', 'editor-canvas: pointer tools (line, rect, polygon, arc)'),
          l('debug', 'Wiring 10px snap grid and orthogonal constraints'),
          l('info', 'preview-3d: extrude shapes to depth + OrbitControls'),
          l('info', 'svg-export: path serialization with viewBox + units'),
          l('warn', 'Arc→SVG uses A command; sweep-flag heuristic may misfire on reflex arcs'),
          l('success', 'Build green — 5 modules · 2,140 LOC · bundle 412 KB (gzip 138 KB)'),
        ],
        artifacts: [
          {
            name: 'geometry-core.ts',
            kind: 'file',
            summary: 'Pure geometry math module',
            size: '11.8 KB',
            preview:
              'export function intersect(a: Segment, b: Segment): Point | null {\n  // Cramer’s rule on the two segment equations\n  ...\n}',
          },
          { name: 'editor-canvas.tsx', kind: 'file', summary: '2D drawing surface + tool handlers', size: '18.3 KB' },
          { name: 'preview-3d.tsx', kind: 'file', summary: 'three.js extrude preview', size: '9.6 KB' },
          { name: 'svg-export.ts', kind: 'file', summary: 'SVG serializer (paths + viewBox)', size: '7.2 KB' },
        ],
      }

    case 'test':
      if (attempt <= 1) {
        return {
          cost: 0.18,
          durationMs: 12600,
          confidence: 0.55,
          tokens: 14000,
          failed: true,
          logs: [
            l('info', 'Running unit suite: geometry-core (84 tests)'),
            l('success', 'geometry-core: 84/84 passed'),
            l('info', 'Running integration suite: editor ↔ export (25 tests)'),
            l('error', 'svg-export: reflex-arc sweep flag incorrect (2 failures)'),
            l('error', 'svg-export: viewBox excludes negative coordinates → clipping (1 failure)'),
            l('info', 'Running visual suite: 3d-preview (6 snapshots)'),
            l('warn', '3d-preview: 1 snapshot diff above threshold (lighting)'),
            l('error', 'Suite result: 109/115 passed · 6 failed'),
          ],
          artifacts: [
            {
              name: 'test-report.html',
              kind: 'test',
              summary: '115 tests · 6 failing (svg-export, 3D lighting)',
              size: '5.5 KB',
              preview:
                'FAIL svg-export › reflex arc sweep flag\nFAIL svg-export › reflex arc large-arc flag\nFAIL svg-export › negative-coordinate viewBox\nFAIL 3d-preview › lighting snapshot',
            },
            { name: 'coverage.lcov', kind: 'data', summary: 'Line coverage 87%', size: '33 KB' },
          ],
        }
      }
      return {
        cost: 0.12,
        durationMs: 9800,
        confidence: 0.93,
        tokens: 11000,
        failed: false,
        logs: [
          l('info', 'Re-running full suite after fixes'),
          l('success', 'geometry-core: 84/84 passed'),
          l('success', 'editor ↔ export: 25/25 passed (incl. 3 new regressions)'),
          l('success', '3d-preview: 6/6 snapshots within threshold'),
          l('success', 'Suite result: 115/115 passed · 0 failed'),
        ],
        artifacts: [
          {
            name: 'test-report.html',
            kind: 'test',
            summary: '115 tests · all passing',
            size: '5.6 KB',
            preview: 'PASS svg-export › reflex arc sweep flag\nPASS svg-export › negative-coordinate viewBox\nPASS 3d-preview › lighting snapshot',
          },
        ],
      }

    case 'review':
      if (attempt <= 1) {
        return {
          cost: 0.22,
          durationMs: 11200,
          confidence: 0.41,
          tokens: 19000,
          failed: true,
          logs: [
            l('info', 'Reviewing against 14 acceptance checks'),
            l('error', '6 automated checks failing (svg-export, 3D lighting)'),
            l('warn', 'SVG export is not faithful for reflex arcs — blocks acceptance'),
            l('warn', 'viewBox clips geometry with negative coordinates'),
            l('error', 'Verdict: REJECTED. Routing to Fix.'),
          ],
          artifacts: [
            {
              name: 'review-1.md',
              kind: 'report',
              summary: 'Rejection: 6 failing checks, 2 blockers',
              size: '4.0 KB',
              preview:
                '## Verdict: REJECTED\n\nBlockers\n1. SVG reflex-arc sweep flags wrong\n2. viewBox clips negative coordinates\n\nReturn to Fix.',
            },
          ],
        }
      }
      return {
        cost: 0.19,
        durationMs: 9400,
        confidence: 0.95,
        tokens: 16500,
        failed: false,
        logs: [
          l('info', 'Re-reviewing after Fix applied 4 patches'),
          l('success', 'All 115 automated tests green'),
          l('success', 'Acceptance checks: 14/14 satisfied'),
          l('success', 'Verdict: APPROVED. Routing to Done.'),
        ],
        artifacts: [
          {
            name: 'review-2.md',
            kind: 'report',
            summary: 'Approval: 14/14 acceptance checks satisfied',
            size: '3.6 KB',
            preview: '## Verdict: APPROVED\n\nAll blockers resolved. 14/14 acceptance checks pass.',
          },
        ],
      }

    case 'fix':
      return {
        cost: 0.41,
        durationMs: 16800,
        confidence: 0.86,
        tokens: 31000,
        failed: false,
        logs: [
          l('info', 'Triaging 6 failing checks from review'),
          l('info', 'svg-export: derive sweep flag from signed angle (reflex-safe)'),
          l('info', 'svg-export: expand viewBox to include negative coordinates'),
          l('info', '3d-preview: pin light intensity to stabilize snapshot'),
          l('debug', 'Adding regression tests for reflex arcs and negative viewBox'),
          l('success', 'Applied 4 fixes across 3 files (+38 −12). Ready to re-test.'),
        ],
        artifacts: [
          {
            name: 'fix-svg-arc.diff',
            kind: 'file',
            summary: 'Patch: signed-angle sweep flag + viewBox expansion',
            size: '1.9 KB',
            preview:
              '- const sweep = angle > 0 ? 1 : 0\n+ const sweep = signedAngle(prev, next) > 0 ? 1 : 0\n+ viewBox = unionBounds(viewBox, shapeBounds)',
          },
          { name: 'regression-tests.ts', kind: 'test', summary: '3 new regression tests', size: '2.4 KB' },
        ],
      }

    case 'done':
      return {
        cost: 0.06,
        durationMs: 5400,
        confidence: 0.97,
        tokens: 3800,
        failed: false,
        logs: [
          l('info', 'Assembling final deliverable for PocketCAD'),
          l('success', 'All acceptance criteria met (14/14)'),
          l('info', 'Packaging build artifacts and SVG export samples'),
          l('success', 'Run complete — PocketCAD ready for handoff.'),
        ],
        artifacts: [
          { name: 'pocketcad-build.zip', kind: 'report', summary: 'Production build of PocketCAD', size: '1.2 MB' },
          {
            name: 'sample-export.svg',
            kind: 'file',
            summary: 'Sample SVG export from the editor',
            size: '3.7 KB',
            preview:
              '<svg viewBox="-50 -50 220 220" xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0 L100 0 A50 50 0 0 1 100 100 Z" />\n</svg>',
          },
          { name: 'RELEASE.md', kind: 'doc', summary: 'Release notes and known limitations', size: '4.1 KB' },
        ],
      }
  }
}

const ARTIFACT_ICONS: Record<ArtifactKind, string> = {
  doc: '📄',
  file: '📦',
  diagram: '🗺️',
  test: '🧪',
  report: '📊',
  data: '🗃️',
}

export function artifactIcon(kind: ArtifactKind): string {
  return ARTIFACT_ICONS[kind]
}

/** Convenience for components that want a fresh empty artifact list type. */
export type { Artifact }
