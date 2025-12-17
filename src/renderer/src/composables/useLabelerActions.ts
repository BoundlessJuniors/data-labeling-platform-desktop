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
  fitToScreen: VoidFn
}

export interface UseLabelerActionsReturn {
  onUndo: VoidFn
  onRedo: VoidFn
  onDelete: VoidFn
  onSaveDraft: VoidFn
  onSubmit: VoidFn
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
    void (async () => {
      const idx = opts.currentTaskIndex.value
      const t = opts.tasks.value[idx]
      if (!t) return

      // Şu an Task.title = media_id olarak kullanıyoruz (road_demo gibi)
      const mediaId = t.title ?? String(t.id)

      const exported = opts.exportAnnotationsToImageSpace()
      const dataJson = JSON.stringify(exported, null, 2)

      await window.api.db.annotations.saveExport({ media_id: mediaId, data_json: dataJson })

      console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', dataJson)
      alert('Taslak kaydedildi: Annotation JSON hem DB’ye yazıldı hem konsola basıldı (F12).')
    })()
  }

  const onSubmit = (): void => {
    void (async () => {
      const idx = opts.currentTaskIndex.value
      const t = opts.tasks.value[idx]
      if (!t) return

      const mediaId = t.title ?? String(t.id)
      await window.api.db.media.setStatus({ media_id: mediaId, status: 'completed' })

      t.status = 'completed'
      alert('Submitted ✔️')
    })()
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
    onFitScreen
  }
}
