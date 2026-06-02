import { useCallback, useReducer, useRef } from 'react'
import type { PartModel } from '../types'

interface HistoryState {
  past: PartModel[]
  present: PartModel
  future: PartModel[]
}

type Action =
  | { type: 'COMMIT'; baseline: PartModel | null; model: PartModel }
  | { type: 'SET_TRANSIENT'; model: PartModel }
  | { type: 'UNDO'; restore: PartModel | null }
  | { type: 'REDO'; restore: PartModel | null }

const LIMIT = 100

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'SET_TRANSIENT':
      // Live preview during a drag / typing burst — no new history entry.
      return { ...state, present: action.model }
    case 'COMMIT': {
      // baseline (pre-burst state) when a transient was in flight; otherwise the
      // current committed present is the thing we push onto the undo stack.
      const base = action.baseline ?? state.present
      const past = [...state.past, base]
      if (past.length > LIMIT) past.shift()
      return { past, present: action.model, future: [] }
    }
    case 'UNDO': {
      // `restore` is the pre-burst baseline if a transient is mid-flight; we
      // discard the uncommitted transient and treat the baseline as "current".
      const current = action.restore ?? state.present
      if (state.past.length === 0) {
        return action.restore ? { ...state, present: action.restore } : state
      }
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [current, ...state.future] }
    }
    case 'REDO': {
      const current = action.restore ?? state.present
      if (state.future.length === 0) {
        return action.restore ? { ...state, present: action.restore } : state
      }
      return { past: [...state.past, current], present: state.future[0], future: state.future.slice(1) }
    }
    default:
      return state
  }
}

export interface History {
  model: PartModel
  canUndo: boolean
  canRedo: boolean
  /** Update the model without recording history (live drag / typing preview). */
  setLive: (model: PartModel) => void
  /** Record one undoable step. Pairs with prior setLive calls in the same burst. */
  commit: (model: PartModel) => void
  /** Explicitly snapshot the baseline at the start of an interaction (optional). */
  begin: () => void
  undo: () => void
  redo: () => void
}

export function useHistory(initial: PartModel): History {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] })

  // Refs so the action callbacks can stay stable (empty deps) yet read fresh state.
  const presentRef = useRef(state.present)
  presentRef.current = state.present
  const baseline = useRef<PartModel | null>(null)

  const setLive = useCallback((model: PartModel) => {
    if (baseline.current === null) baseline.current = presentRef.current
    dispatch({ type: 'SET_TRANSIENT', model })
  }, [])

  const commit = useCallback((model: PartModel) => {
    const base = baseline.current
    baseline.current = null
    dispatch({ type: 'COMMIT', baseline: base, model })
  }, [])

  const begin = useCallback(() => {
    baseline.current = presentRef.current
  }, [])

  const undo = useCallback(() => {
    const restore = baseline.current
    baseline.current = null
    dispatch({ type: 'UNDO', restore })
  }, [])

  const redo = useCallback(() => {
    const restore = baseline.current
    baseline.current = null
    dispatch({ type: 'REDO', restore })
  }, [])

  return {
    model: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setLive,
    commit,
    begin,
    undo,
    redo,
  }
}
