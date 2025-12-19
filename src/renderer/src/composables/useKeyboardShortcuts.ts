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
  saveDraft: () => void
  goPrevTask: () => void
  goNextTask: () => void
  // SAM polygon düzenleme modu aktif mi? (LabelerView içindeki samEditingId üzerinden)
  hasSamEditing: () => boolean
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
      enterPanMode,
      saveDraft,
      goPrevTask,
      goNextTask,
      hasSamEditing
    } = deps

    handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null

      if (target) {
        const tag = target.tagName
        const isFormElement =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          target.isContentEditable

        if (isFormElement) return
      }

      const key = e.key.toLowerCase()

      // Undo
      if (e.ctrlKey && !e.shiftKey && key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Redo
      if ((e.ctrlKey && key === 'y') || (e.ctrlKey && e.shiftKey && key === 'z')) {
        e.preventDefault()
        redo()
        return
      }

      // Save Draft (Ctrl+S)
      if (e.ctrlKey && !e.shiftKey && key === 's') {
        e.preventDefault()
        saveDraft()
        return
      }

      // Task navigasyonu: sağ/sol ok tuşları
      if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (key === 'arrowright') {
          e.preventDefault()
          goNextTask()
          return
        }
        if (key === 'arrowleft') {
          e.preventDefault()
          goPrevTask()
          return
        }
      }

      // Delete seçili annotation
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAnnotationId != null) {
        e.preventDefault()
        deleteSelected()
        return
      }

      // SAM polygon düzenleme modu: Enter / Escape
      if (hasSamEditing()) {
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

      // Polygon / polyline çizimi (manuel shapes aracı) için Enter/Escape
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
        // Buraya gelmişsek SAM edit modu (hasSamEditing) zaten yukarıda ele alındı.
        // SAM aracı aktifken ve edit modu kapalıyken: tek Esc ile pan/select moduna geç.
        if (state.lastUsedTool === 'sam') {
          e.preventDefault()
          enterPanMode()
          return
        }

        // Önce mevcut seçim varsa onu temizle
        if (state.selectedAnnotationId != null) {
          e.preventDefault()
          clearSelection()
          return
        }

        // Shapes aracı aktifken (özellikle polygon/polyline) her durumda çizimi iptal et
        // Bu, KonvaCanvas içindeki geçici çizgileri de temizler ve pan/select moduna döner.
        if (state.lastUsedTool === 'shapes') {
          e.preventDefault()
          cancelPoly()
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

    window.addEventListener('keydown', handler, true)
  }

  const detachKeyboardShortcuts = (): void => {
    if (handler) {
      window.removeEventListener('keydown', handler, true)
      handler = null
    }
  }

  return { attachKeyboardShortcuts, detachKeyboardShortcuts }
}
