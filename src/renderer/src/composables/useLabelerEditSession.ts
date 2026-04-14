/**
 * useLabelerEditSession
 *
 * Sorumluluk:
 *  - Polygon / bbox / circle / keypoint düzenleme modu state'i
 *  - Yerel undo/redo (editHistory)
 *  - SAM annotation'lar sonrası edit hint gösterimi (showEditHint)
 *  - cancelPoly / commitPoly semantiği
 *  - applyLocalState yardımcısı
 */

import { ref } from 'vue'
import type { useLabelerState } from '@renderer/composables/useLabelerState'
import type { Annotation } from '@renderer/types/annotation'

type LabelerState = ReturnType<typeof useLabelerState>['state']

export interface EditSessionDeps {
  state: LabelerState
  recordHistory: () => void
  renderAnnotations: () => void
  updateDeleteButton: () => void
  enterPanMode: () => void
  updateCursor: () => void
  cancelCurrentShape: () => void
  finishCurrentShape: () => void
  hasActiveDrawing: () => boolean
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLabelerEditSession(deps: EditSessionDeps) {
  const editingAnnotationId = ref<number | null>(null)
  const editingOriginalState = ref<Record<string, unknown> | null>(null)
  const editHistory = ref<Record<string, unknown>[]>([])
  const editHistoryIndex = ref(-1)

  // Edit hint (SAM / polygon düzenleme ipucu)
  const showEditHint = ref(false)
  let editHintTimer: number | null = null
  const editHintDismissed = ref(false)

  // Uygulama başında kaydedilmiş tercihi yükle
  if (localStorage.getItem('editHintDismissed') === '1') {
    editHintDismissed.value = true
  }

  /* ---- Edit hint yönetimi ---- */

  /** SAM annotation oluştuktan sonra çağrılır; ipucu gösterilip 2.6s sonra gizlenir. */
  function showHintIfNeeded(): void {
    if (editHintDismissed.value) return
    showEditHint.value = true
    if (editHintTimer != null) window.clearTimeout(editHintTimer)
    editHintTimer = window.setTimeout(() => {
      showEditHint.value = false
      editHintTimer = null
    }, 2600)
  }

  function dismissEditHint(): void {
    editHintDismissed.value = true
    showEditHint.value = false
    if (editHintTimer != null) {
      window.clearTimeout(editHintTimer)
      editHintTimer = null
    }
    localStorage.setItem('editHintDismissed', '1')
  }

  /* ---- Yerel state uygulama ---- */

  function applyLocalState(snapshot: Record<string, unknown>): void {
    if (editingAnnotationId.value == null) return
    const idx = deps.state.annotations.findIndex((a) => a.id === editingAnnotationId.value)
    if (idx === -1) return

    const updated = { ...deps.state.annotations[idx], ...snapshot }
    const next = deps.state.annotations.slice()
    next[idx] = updated as Annotation
    deps.state.annotations = next
  }

  /* ---- Konva olayları ---- */

  function handleEditRequestFromKonva(id: number): void {
    const ann = deps.state.annotations.find((a) => a.id === id)
    if (!ann) return

    editingAnnotationId.value = id

    if (ann.type === 'polygon' || ann.type === 'polyline') {
      editingOriginalState.value = { points: ann.points.map((p) => ({ ...p })) }
      editHistory.value = [{ points: ann.points.map((p) => ({ ...p })) }]
    } else if (ann.type === 'bbox') {
      editingOriginalState.value = { x: ann.x, y: ann.y, width: ann.width, height: ann.height }
      editHistory.value = [{ x: ann.x, y: ann.y, width: ann.width, height: ann.height }]
    } else if (ann.type === 'circle') {
      editingOriginalState.value = { cx: ann.cx, cy: ann.cy, r: ann.r }
      editHistory.value = [{ cx: ann.cx, cy: ann.cy, r: ann.r }]
    } else if (ann.type === 'keypoint') {
      editingOriginalState.value = { x: ann.x, y: ann.y, r: ann.r || 5 }
      editHistory.value = [{ x: ann.x, y: ann.y, r: ann.r || 5 }]
    }

    editHistoryIndex.value = 0
    deps.state.selectedAnnotationId = id
    deps.renderAnnotations()
    deps.updateDeleteButton()
  }

  function handleUpdateAnnotationStateFromKonva(payload: {
    id: number
    patch: Record<string, unknown>
  }): void {
    const idx = deps.state.annotations.findIndex((a) => a.id === payload.id)
    if (idx === -1) return

    const updated = { ...deps.state.annotations[idx], ...payload.patch }
    const next = deps.state.annotations.slice()
    next[idx] = updated as Annotation
    deps.state.annotations = next
  }

  function handleAnnotationTransformEndFromKonva(): void {
    if (editingAnnotationId.value != null) {
      const ann = deps.state.annotations.find((a) => a.id === editingAnnotationId.value)
      if (ann) {
        let snapshot: Record<string, unknown> = {}
        if (ann.type === 'polygon' || ann.type === 'polyline') {
          snapshot = { points: ann.points.map((p) => ({ ...p })) }
        } else if (ann.type === 'bbox') {
          snapshot = { x: ann.x, y: ann.y, width: ann.width, height: ann.height }
        } else if (ann.type === 'circle') {
          snapshot = { cx: ann.cx, cy: ann.cy, r: ann.r }
        } else if (ann.type === 'keypoint') {
          snapshot = { x: ann.x, y: ann.y, r: ann.r }
        }

        editHistory.value = editHistory.value.slice(0, editHistoryIndex.value + 1)
        editHistory.value.push(snapshot)
        editHistoryIndex.value++
      }
      return
    }

    deps.recordHistory()
  }

  /* ---- Yerel undo/redo ---- */

  function undoLocalEdit(): void {
    if (editHistoryIndex.value > 0) {
      editHistoryIndex.value--
      applyLocalState(editHistory.value[editHistoryIndex.value])
    }
  }

  function redoLocalEdit(): void {
    if (editHistoryIndex.value < editHistory.value.length - 1) {
      editHistoryIndex.value++
      applyLocalState(editHistory.value[editHistoryIndex.value])
    }
  }

  /* ---- Polygon / şekil tamamlama ---- */

  const cancelPoly = (): void => {
    if (editingAnnotationId.value != null) {
      if (editingOriginalState.value) {
        applyLocalState(editingOriginalState.value)
      }
      editingAnnotationId.value = null
      editingOriginalState.value = null
      editHistory.value = []
      return
    }

    if (deps.hasActiveDrawing()) {
      deps.cancelCurrentShape()
      deps.state.polyPoints = []
      deps.state.drawingShape = null
      deps.state.isDrawing = false
      deps.updateCursor()
      return
    }

    deps.enterPanMode()
  }

  const commitPoly = (): void => {
    if (editingAnnotationId.value != null) {
      editingAnnotationId.value = null
      editingOriginalState.value = null
      editHistory.value = []
      deps.recordHistory()
      return
    }

    deps.finishCurrentShape()
    deps.state.polyPoints = []
    deps.state.drawingShape = null
    deps.state.isDrawing = false
    deps.updateCursor()
  }

  function teardown(): void {
    if (editHintTimer != null) {
      window.clearTimeout(editHintTimer)
      editHintTimer = null
    }
  }

  return {
    editingAnnotationId,
    editingOriginalState,
    showEditHint,
    editHintDismissed,
    showHintIfNeeded,
    dismissEditHint,
    applyLocalState,
    handleEditRequestFromKonva,
    handleUpdateAnnotationStateFromKonva,
    handleAnnotationTransformEndFromKonva,
    undoLocalEdit,
    redoLocalEdit,
    cancelPoly,
    commitPoly,
    teardown
  }
}
