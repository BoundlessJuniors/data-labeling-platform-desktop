import type { Annotation } from '@renderer/types/annotation'
interface HistoryState {
  annotations: Annotation[]
  history: Annotation[][]
  historyIndex: number
}

export function useHistory(state: HistoryState): {
  recordHistory: () => void
  undo: () => void
  redo: () => void
} {
  const recordHistory = (): void => {
    state.history = state.history.slice(0, state.historyIndex + 1)
    state.history.push(JSON.parse(JSON.stringify(state.annotations)) as Annotation[])
    state.historyIndex++
  }
  const undo = (): void => {
    if (state.historyIndex > 0) {
      state.historyIndex--
      state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    }
  }
  const redo = (): void => {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++
      state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    }
  }

  return { recordHistory, undo, redo }
}
