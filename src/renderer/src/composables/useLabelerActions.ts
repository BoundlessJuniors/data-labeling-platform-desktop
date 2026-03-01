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

      const mediaId = t.mediaId ?? t.title ?? String(t.id)
      const exported = opts.exportAnnotationsToImageSpace()
      const dataJson = JSON.stringify(exported, null, 2)

      await window.api.db.annotations.saveExport({ media_id: mediaId, data_json: dataJson })

      console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', dataJson)
      alert(
        'Draft saved: Annotation data has been written to the database and logged to the console (F12).'
      )
    })()
  }

  const onSubmit = (): void => {
    void (async () => {
      // Önce tüm task'leri kontrol et: queued kalan var mı?
      const queued = opts.tasks.value.filter((t) => t.status === 'queued')
      if (queued.length > 0) {
        alert('You still have queued images. Please review all images before submitting.')
        return
      }

      // Hiç queued kalmadıysa: tümünü tek seferde completed yap
      for (const t of opts.tasks.value) {
        const mediaId = t.mediaId ?? t.title ?? String(t.id)
        await window.api.db.media.setStatus({ media_id: mediaId, status: 'completed' })
        t.status = 'completed'
      }

      alert('All tasks submitted ✔️')
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
