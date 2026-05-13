/**
 * useLabelerAutoSave
 *
 * Sorumluluk:
 *  - Global ve task-bazlı zamanlayıcılar (globalSeconds, taskSecondsById)
 *  - Otomatik kayıt döngüsü (1 dk'da bir, progress bar ile)
 *  - DB'ye süre yazma (flushTimeToDb)
 *  - Kaydet animasyonu (playAutoSaveOverlayAnimation)
 */

import { ref, type ComputedRef, type Ref } from 'vue'
import { buildAndSaveExport } from '@renderer/composables/useLabelerActions'
import type { Annotation, Task } from '@renderer/types/annotation'
import type { getTaskMediaId as GetTaskMediaIdFn } from '@renderer/composables/useLabelerTaskSession'

export interface AutoSaveDeps {
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>
  /** Oturum içi annotation cache (useLabelerTaskSession.localAnnotationsByTask) */
  localAnnotationsByTask: Map<string, Annotation[]>
  /** Media ID üretici saf fonksiyon */
  getTaskMediaId: typeof GetTaskMediaIdFn
  /** Mevcut task'ın annotation'larını canvas koordinat uzayına dışa aktarır */
  exportAnnotationsToImageSpace: () => unknown
  /** Header'daki kaydet düğmesi (autosave animasyonu için) */
  saveBtn: ComputedRef<HTMLButtonElement | null> | Ref<HTMLButtonElement | null>
  /** Auto-save başarı animasyonu overlay'i */
  autoSaveOverlay: ComputedRef<HTMLDivElement | null> | Ref<HTMLDivElement | null>
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLabelerAutoSave(deps: AutoSaveDeps) {
  const autoSaveProgress = ref(0)
  const globalSeconds = ref(0)
  const taskSecondsById = ref<Record<string, number>>({})

  let autoSaveTimer: number | null = null
  let timerInterval: number | null = null

  /* ---- DB süre yazma ---- */

  async function flushTimeToDb(): Promise<void> {
    if (!deps.tasks.value.length) return
    try {
      for (const t of deps.tasks.value) {
        const mediaId = deps.getTaskMediaId(t)
        const secs = taskSecondsById.value[mediaId] ?? 0
        await window.api.db.media.setTime({ media_id: mediaId, seconds: secs })
      }
    } catch (e) {
      console.error('[DB] flush time failed:', e)
    }
  }

  /* ---- Overlay animasyonu ---- */

  function playAutoSaveOverlayAnimation(): void {
    const el = deps.autoSaveOverlay.value
    if (!el) return
    el.classList.remove('show')
    void el.offsetWidth // reflow tetikleyici
    el.classList.add('show')
  }

  async function triggerAutoSave(): Promise<void> {
    if (!deps.tasks.value.length) return

    const btn = deps.saveBtn.value
    btn?.classList.add('save-autosaving')

    try {
      for (const t of deps.tasks.value) {
        const mediaId = t.mediaId ?? t.title ?? String(t.id)
        let anns: Annotation[] | null = null

        if (t === deps.tasks.value[deps.currentTaskIndex.value]) {
          anns = deps.exportAnnotationsToImageSpace() as Annotation[]
        } else {
          const cached = deps.localAnnotationsByTask.get(mediaId)
          if (cached) anns = JSON.parse(JSON.stringify(cached)) as Annotation[]
        }

        if (anns) await buildAndSaveExport(t, anns)
      }

      await flushTimeToDb()
      playAutoSaveOverlayAnimation()
    } catch (e) {
      console.error('[AutoSave] failed:', e)
    } finally {
      if (btn) {
        window.setTimeout(() => btn.classList.remove('save-autosaving'), 900)
      }
    }
  }

  /* ---- Timer başlatma ---- */

  function initTimers(): void {
    if (autoSaveTimer != null || timerInterval != null) return

    // DB'den gelen sürelerle başlangıç değerlerini ayarla
    const byId: Record<string, number> = {}
    let totalSeconds = 0
    for (const t of deps.tasks.value) {
      const id = deps.getTaskMediaId(t)
      const secs = t.timeSeconds ?? 0
      byId[id] = secs
      totalSeconds += secs
    }
    taskSecondsById.value = byId
    globalSeconds.value = totalSeconds

    const AUTO_SAVE_INTERVAL_MS = 1 * 60 * 1000
    const AUTO_SAVE_TICK_MS = 200
    let elapsed = 0
    autoSaveProgress.value = 0

    // 1 saniyelik tick — global ve task-bazlı kronometre
    if (timerInterval == null) {
      timerInterval = window.setInterval(() => {
        if (!deps.tasks.value.length) return
        globalSeconds.value += 1

        const current = deps.tasks.value[deps.currentTaskIndex.value]
        if (!current) return

        const mediaId = deps.getTaskMediaId(current)
        const prevSecs = taskSecondsById.value[mediaId] ?? 0
        taskSecondsById.value = { ...taskSecondsById.value, [mediaId]: prevSecs + 1 }

        if (prevSecs === 0 && current.status !== 'completed') {
          current.status = 'in_progress'
        }
      }, 1000)
    }

    // Otomatik kayıt progress tick
    autoSaveTimer = window.setInterval(() => {
      elapsed += AUTO_SAVE_TICK_MS
      if (elapsed >= AUTO_SAVE_INTERVAL_MS) {
        elapsed = 0
        autoSaveProgress.value = 0
        void triggerAutoSave()
      } else {
        autoSaveProgress.value = elapsed / AUTO_SAVE_INTERVAL_MS
      }
    }, AUTO_SAVE_TICK_MS)
  }

  function teardown(): void {
    if (autoSaveTimer != null) {
      window.clearInterval(autoSaveTimer)
      autoSaveTimer = null
    }
    if (timerInterval != null) {
      window.clearInterval(timerInterval)
      timerInterval = null
    }
    void flushTimeToDb()
  }

  return {
    globalSeconds,
    taskSecondsById,
    autoSaveProgress,
    flushTimeToDb,
    playAutoSaveOverlayAnimation,
    initTimers,
    teardown
  }
}
