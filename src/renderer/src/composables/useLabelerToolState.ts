/**
 * useLabelerToolState
 *
 * Sorumluluk:
 *  - Aktif araç / şekil DOM sınıf yönetimi (setActiveTool)
 *  - Canvas cursor güncellemesi (updateCursor)
 *  - Pan moduna geçiş (enterPanMode)
 *  - Label ipucu gösterimi (showLabelHint)
 *  - Shapes-dropdown şekil seçim tetikleyicisi (handleToolbarSetShape)
 */

import { ref, type Ref } from 'vue'
import { qsa } from '@renderer/utils/dom'
import type { useLabelerState } from '@renderer/composables/useLabelerState'

type LabelerState = ReturnType<typeof useLabelerState>['state']

export interface ToolStateDeps {
  /** Computed/Ref — canvas kapsayıcı div. Cursor ve class güncellemeleri için. */
  canvasContainer: Ref<HTMLDivElement | null>
  /** Computed/Ref — #tool-group DOM elementi. setActiveTool querySelector için. */
  toolGroup: Ref<HTMLDivElement | null>
  /** Computed/Ref — #shapes-dropdown DOM elementi. */
  shapesDropdown: Ref<HTMLDivElement | null>
  /** Computed/Ref — shapes toolbar butonu. Aktif class yönetimi için. */
  shapesToolBtn: Ref<HTMLButtonElement | null>
  /** Konva'daki mevcut çizimi iptal eder. */
  cancelCurrentShape: () => void
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLabelerToolState(state: LabelerState, deps: ToolStateDeps) {
  const showLabelHint = ref(false)
  let labelHintTimer: number | null = null

  function hasValidActiveLabel(): boolean {
    if (state.labelingLoadError) return false
    if (!state.activeLabel) return false
    return state.availableLabels.some((l) => l.name === state.activeLabel)
  }

  function updateCursor(): void {
    const target = deps.canvasContainer.value
    if (!target) return
    const isToolActive =
      !!state.activeLabel && (state.lastUsedTool === 'shapes' || state.lastUsedTool === 'sam')
    target.classList.toggle('tool-active', isToolActive)

    if (state.isPanning) {
      target.style.cursor = 'grabbing'
    } else if (
      state.isDrawing &&
      (state.drawingShape === 'polygon' || state.drawingShape === 'polyline')
    ) {
      target.style.cursor = 'crosshair'
    } else {
      target.style.cursor = isToolActive ? 'crosshair' : 'grab'
    }
  }

  function setActiveTool(el: HTMLElement | null): void {
    if (!deps.toolGroup.value) return
    qsa<HTMLElement>(deps.toolGroup.value, '.annotation-tool').forEach((e) =>
      e.classList.remove('active')
    )
    if (!el) {
      updateCursor()
      return
    }

    const tool = el.dataset.tool

    // Shapes dropdown içindeki spesifik şekil seçimi
    if (el.closest('#shapes-dropdown')) {
      if (!hasValidActiveLabel()) {
        triggerLabelHint()
        return
      }

      deps.shapesToolBtn.value?.classList.add('active')
      el.classList.add('active')

      if (
        tool === 'bbox' ||
        tool === 'polygon' ||
        tool === 'polyline' ||
        tool === 'keypoint' ||
        tool === 'circle'
      ) {
        state.lastUsedShape = tool
      } else {
        state.lastUsedShape = 'bbox'
      }

      state.lastUsedTool = 'shapes'
      updateCursor()
      return
    }

    // Üst seviye araçlar: select, sam, shapes butonu
    if ((tool === 'shapes' || tool === 'sam') && !hasValidActiveLabel()) {
      triggerLabelHint()
      return
    }

    el.classList.add('active')

    if (tool === 'select' || tool === 'sam' || tool === 'shapes') {
      state.lastUsedTool = tool
    } else {
      state.lastUsedTool = 'select'
    }

    updateCursor()
  }

  function triggerLabelHint(): void {
    showLabelHint.value = true
    if (labelHintTimer != null) window.clearTimeout(labelHintTimer)
    labelHintTimer = window.setTimeout(() => {
      showLabelHint.value = false
      labelHintTimer = null
    }, 3000)
    updateCursor()
  }

  function enterPanMode(): void {
    deps.cancelCurrentShape()
    state.isDrawing = false
    state.drawingShape = null
    state.polyPoints = []

    const selectTool = deps.toolGroup.value?.querySelector(
      '.annotation-tool[data-tool="select"]'
    ) as HTMLElement | null
    setActiveTool(selectTool)
    updateCursor()
  }

  function handleToolbarSetShape(shape: string): void {
    const shapeEl = deps.shapesDropdown.value?.querySelector(
      `.annotation-tool[data-tool="${shape}"]`
    ) as HTMLElement | null
    if (shapeEl) setActiveTool(shapeEl)
  }

  function teardown(): void {
    if (labelHintTimer != null) {
      window.clearTimeout(labelHintTimer)
      labelHintTimer = null
    }
  }

  return {
    showLabelHint,
    hasValidActiveLabel,
    updateCursor,
    setActiveTool,
    enterPanMode,
    handleToolbarSetShape,
    teardown
  }
}
