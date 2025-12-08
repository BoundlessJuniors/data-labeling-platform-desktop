// src/composables/useKeyboardShortcuts.ts

type KeyboardState = {
  isDrawing: boolean
  isPanning: boolean
  drawingShape: string | null
  polyPoints: unknown[]
  selectedAnnotationId: number | null
  activeLabel: string | null
  lastUsedTool: string | null
}

type KeyboardDeps = {
  state: KeyboardState
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  commitPoly: () => void
  cancelPoly: () => void
  clearSelection: () => void
  enterPanMode: () => void
}

export function useKeyboardShortcuts(deps: KeyboardDeps): {
  attachKeyboardShortcuts: () => void
  detachKeyboardShortcuts: () => void
} {
  let handler: ((e: KeyboardEvent) => void) | null = null

  const attachKeyboardShortcuts = (): void => {
    if (handler) return

    const {
      state,
      undo,
      redo,
      deleteSelected,
      commitPoly,
      cancelPoly,
      clearSelection,
      enterPanMode
    } = deps

    handler = (e: KeyboardEvent): void => {
      // Undo
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Redo
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault()
        redo()
        return
      }

      // Delete seçili annotation
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAnnotationId != null) {
        e.preventDefault()
        deleteSelected()
        return
      }

      // Polygon / polyline tamamlama – iptal
      if (
        state.isDrawing &&
        (state.drawingShape === 'polygon' || state.drawingShape === 'polyline')
      ) {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitPoly()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelPoly()
          return
        }
      }

      // Genel Escape davranışı
      if (e.key === 'Escape') {
        if (state.selectedAnnotationId != null) {
          e.preventDefault()
          clearSelection()
          return
        }

        const isToolActive =
          !!state.activeLabel && (state.lastUsedTool === 'shapes' || state.lastUsedTool === 'sam')

        if (isToolActive || state.lastUsedTool !== 'select' || state.isDrawing) {
          e.preventDefault()
          enterPanMode()
        }
      }
    }

    document.addEventListener('keydown', handler)
  }

  const detachKeyboardShortcuts = (): void => {
    if (handler) {
      document.removeEventListener('keydown', handler)
      handler = null
    }
  }

  return { attachKeyboardShortcuts, detachKeyboardShortcuts }
}
