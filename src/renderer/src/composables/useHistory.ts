import type { Ref } from 'vue'
import type { Annotation } from '@renderer/types/annotation'

export function useHistory(state: any) {
  const recordHistory = () => {
    state.history = state.history.slice(0, state.historyIndex + 1)
    state.history.push(JSON.parse(JSON.stringify(state.annotations)) as Annotation[])
    state.historyIndex++
  }
  const undo = () => {
    if (state.historyIndex > 0) {
      state.historyIndex--
      state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    }
  }
  const redo = () => {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++
      state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    }
  }

  return { recordHistory, undo, redo }
}
