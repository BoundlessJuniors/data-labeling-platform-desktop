/**
 * useLabelerSamManager
 *
 * Sorumluluk:
 *  - SAM model state'i (samStatus, samModels, samReady, samDownloading…)
 *  - Model seçimi / indirme / duraklatma / iptal (handleSamModelSelect, performModelSwitch…)
 *  - Konva SAM tıklama/çizim olaylarını işleme (handleSamClickFromKonva, handleSamDrawFromKonva)
 *  - SAM progress aboneliği ve showSamSettings document-click dinleyicisi lifecycle'ı
 */

import { ref, type Ref } from 'vue'
import type { useLabelerState } from '@renderer/composables/useLabelerState'
import type { Annotation, Task } from '@renderer/types/annotation'

type LabelerState = ReturnType<typeof useLabelerState>['state']

export interface SamManagerDeps {
  state: LabelerState
  tasks: Ref<Task[]>
  currentTaskIndex: Ref<number>
  recordHistory: () => void
  renderAnnotations: () => void
  updateDeleteButton: () => void
  /** Edit hint ref — SAM annotation sonrası ipucu göstermek için yazılabilir */
  showEditHint: Ref<boolean>
  /** Daha önce kapatılmış mı? */
  editHintDismissed: Ref<boolean>
  dialog: {
    confirm: (opts: { title: string; message: string; detail?: string }) => Promise<boolean>
  }
  toast: {
    error: (title: string, message: string) => void
    warning: (title: string, message: string) => void
  }
  feedbackState: { dialog: { isOpen: boolean } }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useLabelerSamManager(deps: SamManagerDeps) {
  const samReady = ref(false)
  const samDownloading = ref(false)
  const samPaused = ref(false)
  const samDownloadProgress = ref(0)
  const samDownloadStage = ref<'idle' | 'encoder' | 'decoder' | 'done'>('idle')
  const samDownloadingModelId = ref<string | null>(null)
  const showSamSettings = ref(false)
  const samModels = ref<Record<string, SamModelInfo>>({})
  const samStatus = ref<SamStatusInfo>({
    status: 'idle',
    currentModelId: 'vit_b',
    modelsStatus: {},
    error: null
  })

  let editHintTimer: number | null = null
  let samProgressUnsub: (() => void) | null = null
  let onSamSettingsDocClickFn: ((e: MouseEvent) => void) | null = null

  /* ---- Edit hint ---- */

  function showEditHintIfNeeded(): void {
    if (deps.editHintDismissed.value) return
    deps.showEditHint.value = true
    if (editHintTimer != null) window.clearTimeout(editHintTimer)
    editHintTimer = window.setTimeout(() => {
      deps.showEditHint.value = false
      editHintTimer = null
    }, 2600)
  }

  /* ---- Model geçişleri ---- */

  async function performModelSwitch(modelId: string, downloadFirst = false): Promise<void> {
    samStatus.value.currentModelId = modelId
    samStatus.value.status = 'idle'
    samReady.value = false

    if (downloadFirst) {
      samDownloading.value = true
      samDownloadingModelId.value = modelId
      samPaused.value = false
      samDownloadProgress.value = 0
      try {
        await window.api.sam.download(modelId)
        await window.api.sam.status()
        samStatus.value.modelsStatus[modelId] = 'available'
      } catch (e) {
        console.error('Download failed or paused', e)
      } finally {
        if (!samPaused.value) {
          samDownloading.value = false
          samDownloadingModelId.value = null
        }
      }
    }

    const res = await window.api.sam.setModel(modelId)
    samStatus.value = res.state
    localStorage.setItem('lastSamModel', modelId)
  }

  async function handleSamModelSelect(modelId: string): Promise<void> {
    if (deps.feedbackState.dialog.isOpen) return

    if (samDownloading.value || samPaused.value) {
      if (samDownloadingModelId.value === modelId) return
      deps.toast.warning(
        'Download in progress',
        'Please wait for the current download to complete or cancel it first.'
      )
      return
    }

    if (samStatus.value.currentModelId === modelId && samStatus.value.status === 'ready') return

    const isDownloaded = samStatus.value.modelsStatus?.[modelId] === 'available'

    if (!isDownloaded) {
      showSamSettings.value = false
      const model = samModels.value[modelId]
      // Kullanıcı onayı: dialog'un SAM dropdown'ı kapatmasına izin vermek için kısa gecikme
      setTimeout(async () => {
        const ok = await deps.dialog.confirm({
          title: 'Download Model',
          message: `Are you sure you want to download the <strong>${model?.name || modelId}</strong> model?`,
          detail: `Size: ${model?.size || 'Unknown'}`
        })
        if (ok) {
          void performModelSwitch(modelId, true)
        }
      }, 100)
      return
    }

    await performModelSwitch(modelId)
  }

  async function togglePauseDownload(modelId: string): Promise<void> {
    if (samPaused.value) {
      samPaused.value = false
      void performModelSwitch(modelId, true)
    } else {
      samPaused.value = true
      samDownloading.value = false
      await window.api.sam.pauseDownload(modelId)
    }
  }

  async function cancelDownload(modelId: string): Promise<void> {
    samDownloading.value = false
    samDownloadingModelId.value = null
    samPaused.value = false
    samDownloadProgress.value = 0
    await window.api.sam.cancelDownload(modelId)
    const newStatus = await window.api.sam.status()
    samStatus.value = newStatus
  }

  /* ---- SAM çıkarım yardımcısı ---- */

  async function ensureReady(): Promise<boolean> {
    if (samReady.value) return true
    try {
      await window.api.sam.ensureReady()
      const s = await window.api.sam.status()
      samStatus.value = s
      samReady.value = s.status === 'ready'
      return samReady.value
    } catch (e) {
      console.error('Auto-ensure ready failed', e)
      return false
    }
  }

  function hasValidLabel(): boolean {
    if (deps.state.labelingLoadError) return false
    if (!deps.state.activeLabel) return false
    return deps.state.availableLabels.some((l) => l.name === deps.state.activeLabel)
  }

  /* ---- Konva SAM olayları ---- */

  async function handleSamClickFromKonva(payload: { imgX: number; imgY: number }): Promise<void> {
    if (!deps.tasks.value.length || !hasValidLabel()) return
    if (!(await ensureReady())) return

    const current = deps.tasks.value[deps.currentTaskIndex.value]
    if (!current) return

    const px = payload.imgX
    const py = payload.imgY

    // Mevcut polygon içine tıklanmışsa SAM'ı atlat
    const isInsideExistingPolygon = deps.state.annotations.some((a) => {
      if (a.type !== 'polygon' || !Array.isArray(a.points) || a.points.length < 3) return false
      let inside = false
      for (let i = 0, j = a.points.length - 1; i < a.points.length; j = i++) {
        const xi = a.points[i].x
        const yi = a.points[i].y
        const xj = a.points[j].x
        const yj = a.points[j].y
        const intersect =
          yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi
        if (intersect) inside = !inside
      }
      return inside
    })

    if (isInsideExistingPolygon) return

    try {
      const res = await window.api.sam.run({
        imagePath: current.image,
        points: [{ x: payload.imgX, y: payload.imgY }]
      })

      if (!res.ok || !res.mask || !Array.isArray(res.mask.points) || res.mask.points.length < 3) {
        console.warn('[SAM] invalid mask result:', res)
        return
      }

      const polygonAnn: Annotation = {
        id: Date.now(),
        type: 'polygon',
        label: deps.state.activeLabel,
        points: res.mask.points.map((p) => ({ x: p.x, y: p.y }))
      } as Annotation

      deps.state.annotations.push(polygonAnn)
      deps.state.selectedAnnotationId = polygonAnn.id
      deps.recordHistory()
      deps.renderAnnotations()
      deps.updateDeleteButton()
      showEditHintIfNeeded()
    } catch (e) {
      console.error('[SAM] run failed:', e)
      deps.toast.error(
        'SAM Error',
        'SAM ile maske oluşturulurken bir hata oluştu. Ayrıntılar için konsolu kontrol edin.'
      )
    }
  }

  async function handleSamDrawFromKonva(payload: {
    points: { x: number; y: number }[]
    labels: number[]
  }): Promise<void> {
    if (!deps.tasks.value.length || !hasValidLabel()) return
    if (!(await ensureReady())) return

    const current = deps.tasks.value[deps.currentTaskIndex.value]
    if (!current) return

    try {
      const res = await window.api.sam.run({
        imagePath: current.image,
        points: payload.points,
        labels: payload.labels
      })

      if (!res.ok || !res.mask || !Array.isArray(res.mask.points) || res.mask.points.length < 3) {
        console.warn('[SAM] invalid mask result:', res)
        return
      }

      const polygonAnn: Annotation = {
        id: Date.now(),
        type: 'polygon',
        label: deps.state.activeLabel,
        points: res.mask.points.map((p) => ({ x: p.x, y: p.y }))
      } as Annotation

      deps.state.annotations.push(polygonAnn)
      deps.state.selectedAnnotationId = polygonAnn.id
      deps.recordHistory()
      deps.renderAnnotations()
      deps.updateDeleteButton()
      showEditHintIfNeeded()
    } catch (e) {
      console.error('[SAM] run failed:', e)
    }
  }

  /* ---- Lifecycle ---- */

  async function initSam(): Promise<void> {
    const models = await window.api.sam.getModels()
    samModels.value = models

    const status = await window.api.sam.status()
    samStatus.value = status
    samReady.value = status.status === 'ready'

    const savedModel = localStorage.getItem('lastSamModel')
    let targetModel = savedModel

    if (!targetModel || !samModels.value[targetModel]) {
      const available = Object.entries(status.modelsStatus).find(([, st]) => st === 'available')
      targetModel = available ? available[0] : 'vit_b'
    }

    if (targetModel && targetModel !== status.currentModelId) {
      console.log('[SAM] Auto-switching to preferred model:', targetModel)
      await performModelSwitch(targetModel)
    } else if (targetModel) {
      localStorage.setItem('lastSamModel', targetModel)
    }

    samProgressUnsub = window.api.sam.onDownloadProgress((payload) => {
      if (payload.total && payload.total > 0) {
        samDownloadProgress.value = payload.loaded / payload.total
      }
      samDownloadStage.value = payload.stage
    })

    onSamSettingsDocClickFn = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        showSamSettings.value &&
        !target.closest('.sam-settings-container') &&
        !target.closest('.sam-split-button')
      ) {
        showSamSettings.value = false
      }
    }
    document.addEventListener('click', onSamSettingsDocClickFn)
  }

  function teardown(): void {
    if (samProgressUnsub) {
      samProgressUnsub()
      samProgressUnsub = null
    }
    if (onSamSettingsDocClickFn) {
      document.removeEventListener('click', onSamSettingsDocClickFn)
      onSamSettingsDocClickFn = null
    }
    if (editHintTimer != null) {
      window.clearTimeout(editHintTimer)
      editHintTimer = null
    }
  }

  return {
    samReady,
    samDownloading,
    samPaused,
    samDownloadProgress,
    samDownloadStage,
    samDownloadingModelId,
    showSamSettings,
    samModels,
    samStatus,
    handleSamModelSelect,
    performModelSwitch,
    togglePauseDownload,
    cancelDownload,
    handleSamClickFromKonva,
    handleSamDrawFromKonva,
    initSam,
    teardown
  }
}
