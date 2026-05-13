<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed, shallowRef } from 'vue'

// Tipler
import type { Annotation } from '@renderer/types/annotation'

// Composable'lar
import { useLabelerState } from '@renderer/composables/useLabelerState'
import { useHistory } from '@renderer/composables/useHistory'
import { useDatasetLabeling } from '@renderer/composables/useDatasetLabeling'
import { useCanvasTransform } from '@renderer/composables/useCanvasTransform'
import { useTasks } from '@renderer/composables/useTasks'
import { useAnnotationsRenderer } from '@renderer/composables/useAnnotationsRenderer'
import { useKeyboardShortcuts } from '@renderer/composables/useKeyboardShortcuts'
import { useLabelerActions, buildAndSaveExport } from '@renderer/composables/useLabelerActions'
import { useFeedback } from '@renderer/composables/useFeedback'
// FAZ 3 composable'ları
import { useLabelerToolState } from '@renderer/composables/useLabelerToolState'
import { useLabelerEditSession } from '@renderer/composables/useLabelerEditSession'
import { useLabelerSamManager } from '@renderer/composables/useLabelerSamManager'
import {
  useLabelerTaskSession,
  getTaskMediaId,
  toLocalUrlMaybe
} from '@renderer/composables/useLabelerTaskSession'
import { useLabelerAutoSave } from '@renderer/composables/useLabelerAutoSave'
// Bileşenler
import TaskSidebar from '@renderer/components/labeler/TaskSidebar.vue'
import LabelerHeader from '@renderer/components/labeler/LabelerHeader.vue'
import AnnotationsPanel from '@renderer/components/labeler/AnnotationsPanel.vue'
import LabelsPanel from '@renderer/components/labeler/LabelsPanel.vue'
import LabelerToolbar from '@renderer/components/labeler/LabelerToolbar.vue'
import CanvasWorkspace from '@renderer/components/labeler/CanvasWorkspace.vue'

/* =============================
   Feedback (dialog / toast)
   ============================= */
const { dialog, toast, state: feedbackState } = useFeedback()

/* =============================
   DOM refs — child bileşen köprüleri
   ============================= */

// Legacy canvas/SVG refs — Konva kullandığı için null kalır; composable uyumluluğu için bırakıldı
const canvasEl = ref<HTMLCanvasElement | null>(null)
const annotationsSvg = ref<SVGSVGElement | null>(null)

// Annotation list: AnnotationsPanel slot içinde bu bileşende tanımlıdır
const annotationList = ref<HTMLDivElement | null>(null)

// Child component refs
const taskSidebarRef = ref<InstanceType<typeof TaskSidebar> | null>(null)
const labelerHeaderRef = ref<InstanceType<typeof LabelerHeader> | null>(null)
const toolbarRef = ref<InstanceType<typeof LabelerToolbar> | null>(null)
const canvasWorkspaceRef = ref<InstanceType<typeof CanvasWorkspace> | null>(null)

// Computed accessors — child bileşenlerinden expose edilen DOM refs
// (vue-tsc defineExpose ref'lerini otomatik unwrap eder, ekstra .value gerekmez)
const tasksNav = computed<HTMLDivElement | null>(
  () => (taskSidebarRef.value?.tasksNav ?? null) as HTMLDivElement | null
)
const saveBtn = computed(() => labelerHeaderRef.value?.saveBtn ?? null)
const toolGroup = computed<HTMLDivElement | null>(() => toolbarRef.value?.toolGroup ?? null)
const shapesToolBtn = computed<HTMLButtonElement | null>(
  () => toolbarRef.value?.shapesToolBtn ?? null
)
const shapesDropdown = computed<HTMLDivElement | null>(
  () => toolbarRef.value?.shapesDropdown ?? null
)
const canvasContainer = computed<HTMLDivElement | null>(
  () => canvasWorkspaceRef.value?.canvasContainer ?? null
)
const autoSaveOverlay = computed<HTMLDivElement | null>(
  () => canvasWorkspaceRef.value?.autoSaveOverlay ?? null
)

// deleteBtn: useAnnotationsRenderer tarafından disable durumu için kullanılır
const deleteBtn = shallowRef<HTMLButtonElement | null>(null)
watch(
  () => toolbarRef.value?.deleteBtn ?? null,
  (el) => {
    deleteBtn.value = el
  }
)

/* =============================
   Props & emits
   ============================= */
const props = defineProps<{ datasetId: string | null; isActive?: boolean }>()

/* =============================
   Temel composable'lar
   ============================= */
const { tasks, currentTaskIndex, initFromDb } = useTasks([])
const { state } = useLabelerState()

/**
 * True when the current dataset is local (not cloud-sourced).
 * Relies on state.labelSource which is loaded from the DB by loadDatasetLabeling().
 * The hard enforcement is always in the IPC handler; this computed only drives UI visibility.
 */
const isLocalDataset = computed(() => state.labelSource === 'local')
const {
  loadDatasetLabeling,
  addLocalLabel,
  deleteLocalLabel,
  filteredLabels,
  isCloudLabelsReadOnly,
  canManageLocalLabels
} = useDatasetLabeling(state)
const { recordHistory, undo, redo } = useHistory(state)
const { fitToScreen } = useCanvasTransform(state, canvasEl, annotationsSvg)
const {
  renderAnnotations,
  exportAnnotationsToImageSpace,
  clearSelection,
  deleteSelected,
  updateDeleteButton
} = useAnnotationsRenderer(
  state,
  { annotationsSvg, annotationList, deleteBtn, canvasEl },
  recordHistory
)

/* =============================
   Çizgi kalınlığı
   ============================= */
const savedStroke = localStorage.getItem('labelgun-stroke-width')
const strokeWidth = ref(savedStroke ? parseFloat(savedStroke) : 2)
watch(strokeWidth, (val) => {
  localStorage.setItem('labelgun-stroke-width', String(val))
})

/* =============================
   FAZ 3 — Composable zinciri
   DAG: toolState → editSession → samManager → taskSession → autoSave
   ============================= */

// Konva canvas köprü fonksiyonları
const cancelCurrentShape = (): void => canvasWorkspaceRef.value?.cancelCurrentShape?.()
const finishCurrentShape = (): void => canvasWorkspaceRef.value?.finishCurrentShape?.()
const hasActiveDrawing = (): boolean => canvasWorkspaceRef.value?.hasActiveDrawing?.() ?? false

// 1) Tool state
const toolState = useLabelerToolState(state, {
  canvasContainer,
  toolGroup,
  shapesDropdown,
  shapesToolBtn,
  cancelCurrentShape
})

// 2) Edit session
const editSession = useLabelerEditSession({
  state,
  recordHistory,
  renderAnnotations,
  updateDeleteButton,
  enterPanMode: toolState.enterPanMode,
  updateCursor: toolState.updateCursor,
  cancelCurrentShape,
  finishCurrentShape,
  hasActiveDrawing
})

// 3) SAM manager
const samManager = useLabelerSamManager({
  state,
  tasks,
  currentTaskIndex,
  recordHistory,
  renderAnnotations,
  updateDeleteButton,
  showEditHint: editSession.showEditHint,
  editHintDismissed: editSession.editHintDismissed,
  dialog,
  toast,
  feedbackState
})

// 4) Task session
const taskSession = useLabelerTaskSession({
  state,
  tasks,
  currentTaskIndex,
  recordHistory,
  renderAnnotations,
  setActiveTool: toolState.setActiveTool,
  updateDeleteButton,
  clearSelection,
  fitToScreen,
  tasksNav,
  shapesDropdown,
  toolGroup,
  showLabelHint: toolState.showLabelHint,
  editingAnnotationId: editSession.editingAnnotationId,
  toast
})

// 5) Auto-save
const autoSave = useLabelerAutoSave({
  tasks,
  currentTaskIndex,
  localAnnotationsByTask: taskSession.localAnnotationsByTask,
  getTaskMediaId,
  exportAnnotationsToImageSpace,
  saveBtn,
  autoSaveOverlay
})

/* =============================
   useLabelerActions (kaydetme / gönderme)
   ============================= */
const undoAndRender = (): void => {
  undo()
  renderAnnotations()
}
const redoAndRender = (): void => {
  redo()
  renderAnnotations()
}

const { onUndo, onRedo, onDelete, onSaveDraft, onCompleteLocalWork } = useLabelerActions({
  tasks,
  currentTaskIndex,
  canvasEl,
  undo: undoAndRender,
  redo: redoAndRender,
  deleteSelected,
  exportAnnotationsToImageSpace,
  fitToScreen
})

// saveDraftAndReset: onSaveDraft artık hazır
function saveDraftAndReset(): void {
  onSaveDraft()
  autoSave.autoSaveProgress.value = 0
  void autoSave.flushTimeToDb()
  autoSave.playAutoSaveOverlayAnimation()
}

/* =============================
   Export (local datasets only)
   ============================= */
async function handleExport(format: 'COCO' | 'YOLO' | 'VOC'): Promise<void> {
  if (!props.datasetId) return

  // Save current task snapshot before export so unsaved drawings are included
  const currentTask = tasks.value[currentTaskIndex.value]
  if (currentTask) {
    try {
      await buildAndSaveExport(currentTask, exportAnnotationsToImageSpace())
    } catch (e) {
      toast.error(
        'Export Failed',
        'Failed to save snapshot before export: ' + (e instanceof Error ? e.message : String(e))
      )
      return
    }
  }

  try {
    const result = await window.api.export.localDataset({
      datasetId: props.datasetId,
      format
    })
    if ('cancelled' in result && result.cancelled) return
    if (result.ok) {
      toast.success('Export Completed', `Saved to: ${result.filePath}`, 5000)
    }
  } catch (err: unknown) {
    toast.error('Export Failed', (err as Error).message)
  }
}

/* =============================
   Klavye kısayolları
   ============================= */
const { attachKeyboardShortcuts, detachKeyboardShortcuts } = useKeyboardShortcuts({
  state,
  undo: undoAndRender,
  redo: redoAndRender,
  deleteSelected,
  commitPoly: editSession.commitPoly,
  cancelPoly: editSession.cancelPoly,
  clearSelection,
  enterPanMode: toolState.enterPanMode,
  saveDraft: saveDraftAndReset,
  goPrevTask: taskSession.goPrevTask,
  goNextTask: taskSession.goNextTask,
  hasLocalEditing: () => editSession.editingAnnotationId.value != null,
  undoLocalEdit: editSession.undoLocalEdit,
  redoLocalEdit: editSession.redoLocalEdit
})

let isMounted = false
let runtimeActive = false

function startLabelerRuntime(): void {
  if (!isMounted || runtimeActive || !props.datasetId) return
  runtimeActive = true
  attachKeyboardShortcuts()
  autoSave.initTimers()

  if (tasks.value.length > 0) {
    void window.electron.ipcRenderer.invoke('sam:startPrefetch')
    void window.electron.ipcRenderer.invoke(
      'sam:updatePrefetchPlan',
      currentTaskIndex.value,
      tasks.value.length,
      tasks.value.map((task) => ({ image: task.image }))
    )
  }
}

function stopLabelerRuntime(): void {
  if (!runtimeActive) return
  runtimeActive = false
  const current = tasks.value[currentTaskIndex.value]
  if (current) {
    void buildAndSaveExport(current, exportAnnotationsToImageSpace()).catch((err) => {
      console.error('[Runtime] Failed to save current snapshot before pause:', err)
    })
  }
  detachKeyboardShortcuts()
  autoSave.teardown()
  void window.electron.ipcRenderer.invoke('sam:stopPrefetch')
}

watch(
  () => props.isActive,
  (active) => {
    if (active) startLabelerRuntime()
    else stopLabelerRuntime()
  }
)

/* =============================
   Label paneli
   ============================= */
const newLabelName = ref('')

const handleAddLabel = async (): Promise<void> => {
  if (!newLabelName.value.trim() || !props.datasetId) return
  try {
    await addLocalLabel(props.datasetId, newLabelName.value.trim())
    newLabelName.value = ''
  } catch (err: unknown) {
    toast.error('Giriş Hatası', (err as Error).message)
  }
}

const handleDeleteLabel = async (labelId: string): Promise<void> => {
  if (!props.datasetId) return
  const ok = await dialog.dangerConfirm({
    title: 'Delete Label',
    message: 'Are you sure you want to delete this label?'
  })
  if (!ok) return
  try {
    await deleteLocalLabel(props.datasetId, labelId)
  } catch (err: unknown) {
    toast.error('Hata', (err as Error).message)
  }
}

function setActiveLabelByName(name: string | null): void {
  state.activeLabel = name
  toolState.showLabelHint.value = false
  toolState.updateCursor()
}

/* =============================
   Tema
   ============================= */
function onThemeToggleClick(): void {
  const nextDark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', nextDark)
  localStorage.setItem('theme', nextDark ? 'dark' : 'light')
}

/* =============================
   Annotation olayları — thin orchestrators
   ============================= */
function selectAnnotation(id: number): void {
  state.selectedAnnotationId = id
  const selectTool = toolGroup.value?.querySelector(
    '.annotation-tool[data-tool="select"]'
  ) as HTMLElement | null
  toolState.setActiveTool(selectTool)
  renderAnnotations()
}

function handleCreateAnnotationFromKonva(ann: Annotation): void {
  state.annotations.push(ann)
  recordHistory()
  renderAnnotations()
  updateDeleteButton()
}

function handleSelectAnnotationFromKonva(id: number | null): void {
  if (id == null) {
    state.selectedAnnotationId = null
    clearSelection()
  } else {
    if (editSession.editingAnnotationId.value === id) return
    selectAnnotation(id)
  }
}

/* =============================
   Task yeniden başlatma (reset-view)
   ============================= */
async function restartCurrentTask(): Promise<void> {
  const current = tasks.value[currentTaskIndex.value]
  if (!current) return

  canvasWorkspaceRef.value?.fitToContainer()

  state.annotations = []
  state.selectedAnnotationId = null
  state.history = []
  state.historyIndex = -1
  clearSelection()
  renderAnnotations()
  updateDeleteButton()

  const mediaId = getTaskMediaId(current)
  taskSession.localAnnotationsByTask.delete(mediaId)

  try {
    await buildAndSaveExport(current, [])
  } catch (e) {
    console.error('[Restart] failed to clear annotations in DB:', e)
  }
}

/* =============================
   Toolbar event handlers
   ============================= */
function handleToolbarSetTool(tool: string): void {
  const toolEl = toolGroup.value?.querySelector(
    `.annotation-tool[data-tool="${tool}"]`
  ) as HTMLElement | null

  if (tool === 'sam') {
    const currentModelId = samManager.samStatus.value.currentModelId
    const isAvailable = samManager.samStatus.value.modelsStatus[currentModelId] === 'available'

    if (isAvailable) {
      toolState.setActiveTool(toolEl)
      if (
        samManager.samStatus.value.status !== 'ready' &&
        samManager.samStatus.value.status !== 'loading'
      ) {
        samManager.samStatus.value.status = 'loading'
        window.api.sam.ensureReady().then((res) => {
          samManager.samStatus.value = res.state
          samManager.samReady.value = res.state.status === 'ready'
        })
      }
    } else {
      void samManager.handleSamModelSelect(currentModelId)
      toolState.enterPanMode()
    }
    return
  }

  toolState.setActiveTool(toolEl)
}

/* =============================
   Annotation listesi tıklama — AnnotationsPanel slot içindeki div
   ============================= */
function handleAnnotationListClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest('.annotation-item') as HTMLElement | null
  if (el) selectAnnotation(parseInt(el.dataset.id!))
  else clearSelection()
}

/* =============================
   Dataset watch + lifecycle
   ============================= */
watch(
  () => props.datasetId,
  async (newId) => {
    // Dataset geçişinde bleeding state temizlenir
    state.availableLabels = []
    state.activeLabel = null
    state.labelSearchTerm = ''
    state.labelSource = null as unknown as 'local'
    state.annotationFormat = null
    state.labelingSpecJson = null
    state.qcMode = null
    state.labelSetName = null
    state.labelSetVersion = null
    state.labelingLoadError = null
    taskSession.localAnnotationsByTask.clear()
    state.annotations = []
    state.history = []
    state.historyIndex = -1
    state.selectedAnnotationId = null
    clearSelection()
    if (state.img) state.img.src = ''

    if (!newId) {
      await initFromDb(null)
      return
    }

    try {
      await loadDatasetLabeling(newId)
      await initFromDb(newId)

      if (tasks.value.length === 0) {
        console.warn('[UI] ⚠️ NO TASKS FOUND! Dataset might be empty.')
        if (state.img) state.img.src = ''
      } else {
        await taskSession.loadTaskByIndex(0)
      }

      try {
        await window.electron.ipcRenderer.invoke('sam:ensureReady')
        if (props.isActive) {
          await window.electron.ipcRenderer.invoke('sam:startPrefetch')
        }
      } catch (samErr) {
        console.warn('[UI] ⚠️ SAM session load failed:', samErr)
      }

      if (props.isActive && tasks.value.length > 0 && currentTaskIndex.value >= 0) {
        const simplifiedTasks = tasks.value.map((task) => ({ image: task.image }))
        await window.electron.ipcRenderer.invoke(
          'sam:updatePrefetchPlan',
          currentTaskIndex.value,
          tasks.value.length,
          simplifiedTasks
        )
      }
    } catch (e) {
      console.error('[UI] ❌ Watch dataset pipeline failed:', e)
    }
  },
  { immediate: true }
)

onMounted(async (): Promise<void> => {
  // Tema
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : prefersDark)

  if (tasks.value.length > 0) await taskSession.loadTaskByIndex(0)
  updateDeleteButton()

  // SAM modelleri ve durum
  await samManager.initSam()
  isMounted = true
  if (props.isActive) startLabelerRuntime()
})

onBeforeUnmount((): void => {
  stopLabelerRuntime()
  toolState.teardown()
  editSession.teardown()
  samManager.teardown()
})

/* =============================
   Template binding aliases
   Vue template yalnızca script-setup'ın üst seviye tanımlamalarına erişir.
   Composable sonuçları buraya yeniden bağlanır.
   ============================= */

// autoSave
const { globalSeconds, taskSecondsById, autoSaveProgress } = autoSave

// samManager
const {
  samStatus,
  samModels,
  samDownloading,
  samPaused,
  samDownloadProgress,
  samDownloadStage,
  samDownloadingModelId,
  showSamSettings,
  handleSamModelSelect,
  togglePauseDownload,
  cancelDownload,
  handleSamClickFromKonva,
  handleSamDrawFromKonva
} = samManager

// editSession
const {
  editingAnnotationId,
  showEditHint,
  dismissEditHint,
  handleEditRequestFromKonva,
  handleUpdateAnnotationStateFromKonva,
  handleAnnotationTransformEndFromKonva
} = editSession

// taskSession
const { goPrevTask, goNextTask } = taskSession
function handleTaskNavigation(idx: number): void {
  taskSession.handleTaskNavigation(idx)
}

// toolState
const { showLabelHint } = toolState
function handleToolbarSetShape(shape: string): void {
  toolState.handleToolbarSetShape(shape)
}
</script>

<template>
  <div
    class="flex h-full bg-background-light dark:bg-slate-900 font-display text-text-primary dark:text-white"
  >
    <!-- Sidebar -->
    <TaskSidebar
      ref="taskSidebarRef"
      :tasks="tasks"
      :current-task-index="currentTaskIndex"
      :task-seconds-by-id="taskSecondsById"
      @navigate="handleTaskNavigation"
      @prev="goPrevTask"
      @next="goNextTask"
    />

    <!-- Main -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <LabelerHeader
        ref="labelerHeaderRef"
        :task-title-text="
          tasks[currentTaskIndex]?.title
            ? `Image Annotation - ${tasks[currentTaskIndex].title}`
            : 'Image Annotation - Task 1'
        "
        :global-seconds="globalSeconds"
        :auto-save-progress="autoSaveProgress"
        :is-local-dataset="isLocalDataset"
        @theme-toggle="onThemeToggleClick"
        @save="saveDraftAndReset"
        @complete-local="onCompleteLocalWork"
        @export-coco="() => handleExport('COCO')"
        @export-yolo="() => handleExport('YOLO')"
        @export-voc="() => handleExport('VOC')"
      />

      <div class="flex-1 flex p-4 gap-4 min-h-0 relative isolate">
        <div class="flex-1 flex flex-col gap-2 relative z-10">
          <!-- Toolbar -->
          <LabelerToolbar
            ref="toolbarRef"
            :sam-status="samStatus"
            :sam-models="samModels"
            :sam-downloading="samDownloading"
            :sam-paused="samPaused"
            :sam-download-progress="samDownloadProgress"
            :sam-download-stage="samDownloadStage"
            :sam-downloading-model-id="samDownloadingModelId"
            :show-sam-settings="showSamSettings"
            :stroke-width="strokeWidth"
            @set-tool="handleToolbarSetTool"
            @set-shape="handleToolbarSetShape"
            @undo="onUndo"
            @redo="onRedo"
            @delete="onDelete"
            @update:stroke-width="(v) => (strokeWidth = v)"
            @update:show-sam-settings="(v) => (showSamSettings = v)"
            @sam-model-select="handleSamModelSelect"
            @sam-toggle-pause="togglePauseDownload"
            @sam-cancel-download="cancelDownload"
          />

          <!-- Canvas Workspace (FAZ 2) -->
          <CanvasWorkspace
            ref="canvasWorkspaceRef"
            :image-src="
              tasks[currentTaskIndex]?.image ? toLocalUrlMaybe(tasks[currentTaskIndex].image) : null
            "
            :annotations="state.annotations"
            :active-tool="state.lastUsedTool"
            :active-shape="state.lastUsedShape"
            :active-label="state.activeLabel"
            :selected-id="state.selectedAnnotationId"
            :editing-id="editingAnnotationId"
            :stroke-width="strokeWidth"
            :show-edit-hint="showEditHint"
            @create-annotation="handleCreateAnnotationFromKonva"
            @select-annotation="handleSelectAnnotationFromKonva"
            @sam-click="handleSamClickFromKonva"
            @sam-draw="handleSamDrawFromKonva"
            @edit-request="handleEditRequestFromKonva"
            @update-annotation-state="handleUpdateAnnotationStateFromKonva"
            @annotation-transform-end="handleAnnotationTransformEndFromKonva"
            @dismiss-edit-hint="dismissEditHint"
            @zoom-in="canvasWorkspaceRef?.zoomBy(0.1)"
            @zoom-out="canvasWorkspaceRef?.zoomBy(-0.1)"
            @fit-screen="canvasWorkspaceRef?.fitToContainer()"
            @reset-view="restartCurrentTask"
          />
        </div>

        <!-- Sağ paneller -->
        <div class="w-full lg:w-80 flex flex-col gap-4 pt-0 h-full shrink-0 relative z-0">
          <AnnotationsPanel>
            <div
              ref="annotationList"
              class="space-y-2 overflow-y-auto flex-1 min-h-0 px-1 -mx-1"
              @click="handleAnnotationListClick"
            ></div>
          </AnnotationsPanel>

          <LabelsPanel
            :labeling-load-error="state.labelingLoadError"
            :show-label-hint="showLabelHint"
            :label-search-term="state.labelSearchTerm"
            :is-cloud-labels-read-only="isCloudLabelsReadOnly"
            :filtered-labels="filteredLabels"
            :active-label="state.activeLabel"
            :can-manage-local-labels="canManageLocalLabels"
            :new-label-name="newLabelName"
            @update:label-search-term="(val) => (state.labelSearchTerm = val)"
            @update:new-label-name="(val) => (newLabelName = val)"
            @set-active-label="setActiveLabelByName"
            @delete-label="handleDeleteLabel"
            @add-label="handleAddLabel"
          />
        </div>
      </div>
    </main>
  </div>
</template>
<style src="@renderer/styles/labeler-view.css"></style>
