/**
 * useLabelerTaskSession
 *
 * Sorumluluk:
 *  - Task yükleme (loadTaskByIndex): resim yükle, annotation cache restore, label seçimi, tool restore
 *  - Task navigasyonu (handleTaskNavigation, goPrevTask, goNextTask)
 *  - Oturum içi annotation cache (localAnnotationsByTask)
 *  - Yardımcı saf fonksiyonlar: getTaskMediaId, toLocalUrlMaybe
 */

import { nextTick, type ComputedRef, type Ref } from 'vue'
import { loadImage } from '@renderer/utils/image'
import type { useLabelerState } from '@renderer/composables/useLabelerState'
import type { Annotation, Task } from '@renderer/types/annotation'

type LabelerState = ReturnType<typeof useLabelerState>['state']

export interface TaskSessionDeps {
  state: LabelerState
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>
  recordHistory: () => void
  renderAnnotations: () => void
  setActiveTool: (el: HTMLElement | null) => void
  updateDeleteButton: () => void
  clearSelection: () => void
  fitToScreen: () => void
  tasksNav: ComputedRef<HTMLDivElement | null> | Ref<HTMLDivElement | null>
  shapesDropdown: ComputedRef<HTMLDivElement | null> | Ref<HTMLDivElement | null>
  toolGroup: ComputedRef<HTMLDivElement | null> | Ref<HTMLDivElement | null>
  /** showLabelHint ref — task geçişinde sıfırlanmalı */
  showLabelHint: Ref<boolean>
  editingAnnotationId: Ref<number | null>
  toast: { warning: (title: string, message: string) => void }
}

/** Saf yardımcı — harici bağımlılık yok */
export function getTaskMediaId(t: Task): string {
  return t.mediaId ?? t.title ?? String(t.id)
}

/** Dosya sisteminden gelen mutlak yolları Electron `local://` protokolüne dönüştürür. */
export function toLocalUrlMaybe(p: string): string {
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('local://')) return p

  const isWinAbs = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\')
  const isPosixAbs = p.startsWith('/')

  if (isWinAbs) {
    const normalized = p.replace(/\\/g, '/')
    return `local:///${encodeURI(normalized)}`
  }

  if (isPosixAbs) {
    return `local:///${encodeURI(p.replace(/^\/+/, ''))}`
  }

  return p
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLabelerTaskSession(deps: TaskSessionDeps) {
  /** Oturum içi geçici annotation cache. Anahtar: media_id */
  const localAnnotationsByTask = new Map<string, Annotation[]>()

  async function loadTaskByIndex(i: number): Promise<void> {
    if (deps.tasks.value.length === 0) return

    const prevTool = deps.state.lastUsedTool
    const prevShape = deps.state.lastUsedShape
    const prevLabel = deps.state.activeLabel

    // Mevcut task'ın annotation'larını cache'e kaydet
    const currentTask = deps.tasks.value[deps.currentTaskIndex.value]
    if (currentTask && deps.state.img?.src) {
      const currentMediaId = getTaskMediaId(currentTask)
      localAnnotationsByTask.set(
        currentMediaId,
        JSON.parse(JSON.stringify(deps.state.annotations)) as Annotation[]
      )
    }

    const clamped = Math.max(0, Math.min(deps.tasks.value.length - 1, i))
    if (clamped === deps.currentTaskIndex.value && deps.state.img?.src) return

    deps.currentTaskIndex.value = clamped
    const t = deps.tasks.value[clamped]

    deps.state.annotations = []
    deps.state.history = []
    deps.state.historyIndex = -1
    deps.state.selectedAnnotationId = null

    try {
      const imgSrc = toLocalUrlMaybe(t.image)
      console.log('IMG SRC =>', imgSrc)
      const img = await loadImage(imgSrc)
      deps.state.img = img

      if (!t.originalWidth) t.originalWidth = img.naturalWidth
      if (!t.originalHeight) t.originalHeight = img.naturalHeight

      deps.fitToScreen()

      const mediaId = getTaskMediaId(t)

      // Cache'den yükle; yoksa DB'den oku
      if (localAnnotationsByTask.has(mediaId)) {
        const cached = localAnnotationsByTask.get(mediaId)
        deps.state.annotations = JSON.parse(JSON.stringify(cached)) as Annotation[]
      } else {
        try {
          const saved = await window.api.db.annotations.getExport(mediaId)
          if (saved?.data_json) {
            const parsed = JSON.parse(saved.data_json)
            deps.state.annotations = Array.isArray(parsed) ? parsed : []
          } else {
            deps.state.annotations = []
          }
        } catch (e) {
          console.error('[DB] restore annotations failed:', e)
          deps.state.annotations = []
        }
      }

      // Aktif label'i koru veya ilkine düşür
      if (prevLabel && deps.state.availableLabels.find((l) => l.name === prevLabel)) {
        deps.state.activeLabel = prevLabel
      } else if (deps.state.availableLabels.length > 0) {
        deps.state.activeLabel = deps.state.availableLabels[0].name
      } else {
        deps.state.activeLabel = null
      }

      // Label ipucunu sıfırla (task geçişinde stale gösterim engellemek için)
      deps.showLabelHint.value = false

      // Önceki aracı/şekli geri yükle
      let toolEl: HTMLElement | null = null
      if (prevTool === 'shapes') {
        const shape = prevShape ?? 'bbox'
        toolEl = deps.shapesDropdown.value?.querySelector(
          `.annotation-tool[data-tool="${shape}"]`
        ) as HTMLElement | null
      } else {
        toolEl = deps.toolGroup.value?.querySelector(
          `.annotation-tool[data-tool="${prevTool}"]`
        ) as HTMLElement | null
      }

      if (!toolEl) {
        toolEl = deps.toolGroup.value?.querySelector(
          '.annotation-tool[data-tool="select"]'
        ) as HTMLElement | null
      }

      deps.setActiveTool(toolEl)
      deps.renderAnnotations()
      deps.recordHistory()

      // Görev listesinde aktif task'ı görünür hale getir
      void nextTick(() => {
        const container = deps.tasksNav.value
        if (!container) return

        if (deps.currentTaskIndex.value === 0) {
          container.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }

        const active = container.querySelector('a[data-active="true"]') as HTMLElement | null
        if (!active) return

        const cRect = container.getBoundingClientRect()
        const aRect = active.getBoundingClientRect()
        if (aRect.top >= cRect.top && aRect.bottom <= cRect.bottom) return
        active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })

      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
      const taskImage = t.image.split(/[\\/]/).pop() || t.image
      console.log(`\n[${timestamp}] [UI] 📄 Task ${i} loaded: ${taskImage}`)

      window.electron.ipcRenderer.invoke('sam:recordPrefetchActivity')
      window.electron.ipcRenderer.invoke(
        'sam:updatePrefetchPlan',
        i,
        deps.tasks.value.length,
        deps.tasks.value.map((task) => ({ image: task.image }))
      )
    } catch (err) {
      console.error('Image load failed:', err)
    }
  }

  function handleTaskNavigation(idx: number): void {
    if (deps.editingAnnotationId.value !== null) {
      deps.toast.warning('Not Saved', 'Finish editing first! Press ESC to cancel or Enter to save.')
      return
    }
    void loadTaskByIndex(idx)
  }

  function goPrevTask(): void {
    handleTaskNavigation(
      (deps.currentTaskIndex.value - 1 + deps.tasks.value.length) % deps.tasks.value.length
    )
  }

  function goNextTask(): void {
    handleTaskNavigation((deps.currentTaskIndex.value + 1) % deps.tasks.value.length)
  }

  return {
    localAnnotationsByTask,
    loadTaskByIndex,
    handleTaskNavigation,
    goPrevTask,
    goNextTask
  }
}
