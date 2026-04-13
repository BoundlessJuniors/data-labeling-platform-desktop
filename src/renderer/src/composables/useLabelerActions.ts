import type { Ref } from 'vue'
import type { Task } from '@renderer/types/annotation'
import { useFeedback } from '@renderer/composables/useFeedback'

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

/**
 * Compute SHA-256 hex hash of a string using Web Crypto API (renderer-safe).
 */
async function computeHashBrowser(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Simple stable JSON stringify with sorted keys (renderer-side).
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj)
  if (typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']'
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort()
  const parts = sorted.map((key) => {
    const val = (obj as Record<string, unknown>)[key]
    return JSON.stringify(key) + ':' + stableStringify(val)
  })
  return '{' + parts.join(',') + '}'
}

export async function buildAndSaveExport(task: Task, exportedAnnotations: unknown): Promise<void> {
  const mediaId = task.mediaId ?? task.title ?? String(task.id)
  const dataJson = JSON.stringify(exportedAnnotations, null, 2)

  // Build payload_json and payload_hash for cloud tasks
  let payloadJson: string | undefined
  let payloadHash: string | undefined

  if (task.cloudTaskId) {
    const payloadObj = {
      type: 'export',
      data: exportedAnnotations
    }
    payloadJson = JSON.stringify(payloadObj)
    const canonical = stableStringify(payloadObj)
    payloadHash = await computeHashBrowser(canonical)
  }

  await window.api.db.annotations.saveExport({
    media_id: mediaId,
    data_json: dataJson,
    cloud_task_id: task.cloudTaskId,
    contract_id: task.contractId,
    payload_json: payloadJson,
    payload_hash: payloadHash
  })
}

export function useLabelerActions(opts: UseLabelerActionsOptions): UseLabelerActionsReturn {
  const { toast } = useFeedback()

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

      const exported = opts.exportAnnotationsToImageSpace()
      await buildAndSaveExport(t, exported)

      console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', JSON.stringify(exported, null, 2))
      console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', JSON.stringify(exported, null, 2))
      toast.success('Draft Saved', 'Annotation data has been written to the database.', 3000)
    })()
  }

  const onSubmit = (): void => {
    void (async () => {
      const queued = opts.tasks.value.filter((t) => t.status === 'queued')
      if (queued.length > 0) {
        toast.warning(
          'Incomplete tasks',
          'You still have queued images. Please review all images before submitting.'
        )
        return
      }

      for (const t of opts.tasks.value) {
        const mediaId = t.mediaId ?? t.title ?? String(t.id)
        await window.api.db.media.setStatus({ media_id: mediaId, status: 'completed' })
        t.status = 'completed'
      }

      toast.success('Tasks Submitted', 'All tasks submitted successfully ✔️')
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
