import type { Ref } from 'vue'
import type { Task } from '@renderer/types/annotation'

type VoidFn = () => void

export interface UseLabelerActionsOptions {
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>

  canvasEl: Ref<HTMLCanvasElement | null>

  undo: VoidFn
  redo: VoidFn
  deleteSelected: VoidFn

  exportAnnotationsToImageSpace: () => unknown

  zoom: (delta: number, cx: number, cy: number) => void
  fitToScreen: VoidFn
}

export interface UseLabelerActionsReturn {
  onUndo: VoidFn
  onRedo: VoidFn
  onDelete: VoidFn
  onSaveDraft: VoidFn
  onSubmit: VoidFn
  onZoomIn: VoidFn
  onZoomOut: VoidFn
  onFitScreen: VoidFn
}

export function useLabelerActions(opts: UseLabelerActionsOptions): UseLabelerActionsReturn {
  const onUndo = (): void => {
    opts.undo()
  }

  const onRedo = (): void => {
    opts.redo()
  }

  const onDelete = (): void => {
    opts.deleteSelected()
  }

  const onSaveDraft = (): void => {
    const exported = opts.exportAnnotationsToImageSpace()
    console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', JSON.stringify(exported, null, 2))
    alert('Annotation JSON verisi (orijinal çözünürlükte) konsola yazıldı (F12).')
  }

  const onSubmit = (): void => {
    const idx = opts.currentTaskIndex.value
    const t = opts.tasks.value[idx]
    if (!t) return
    t.status = 'completed'
    alert('Submitted ✔️')
  }

  const onZoomIn = (): void => {
    const el = opts.canvasEl.value
    if (!el) return
    const r = el.getBoundingClientRect()
    opts.zoom(0.1, r.left + r.width / 2, r.top + r.height / 2)
  }

  const onZoomOut = (): void => {
    const el = opts.canvasEl.value
    if (!el) return
    const r = el.getBoundingClientRect()
    opts.zoom(-0.1, r.left + r.width / 2, r.top + r.height / 2)
  }

  const onFitScreen = (): void => {
    opts.fitToScreen()
  }

  return {
    onUndo,
    onRedo,
    onDelete,
    onSaveDraft,
    onSubmit,
    onZoomIn,
    onZoomOut,
    onFitScreen
  }
}
