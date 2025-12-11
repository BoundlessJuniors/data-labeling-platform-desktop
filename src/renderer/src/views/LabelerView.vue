<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import UndoIcon from '@renderer/assets/icons/custom/undo.svg?component'
import RedoIcon from '@renderer/assets/icons/custom/redo.svg?component'
import SelectIcon from '@renderer/assets/icons/custom/touch_app.svg?component'
import SamIcon from '@renderer/assets/icons/custom/wand_shine.svg?component'
import ShapesIcon from '@renderer/assets/icons/custom/category.svg?component'
import ChevronDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg?component'
import ArrowBackIcon from '@renderer/assets/icons/custom/arrow_back.svg?component'
import ArrowFwdIcon from '@renderer/assets/icons/custom/arrow_forward.svg?component'
import SunIcon from '@renderer/assets/icons/custom/light_mode.svg?component'
import MoonIcon from '@renderer/assets/icons/custom/dark_mode.svg?component'
import TimerIcon from '@renderer/assets/icons/custom/timer.svg?component'
import SaveIcon from '@renderer/assets/icons/custom/cloud_done.svg?component'
import ApproveIcon from '@renderer/assets/icons/custom/approval_delegation.svg?component'
import SearchIcon from '@renderer/assets/icons/custom/search.svg?component'
import ZoomOutIcon from '@renderer/assets/icons/custom/zoom_out.svg?component'
import ZoomInIcon from '@renderer/assets/icons/custom/zoom_in.svg?component'
import FitScreenIcon from '@renderer/assets/icons/custom/fit_screen.svg?component'
import ResetViewIcon from '@renderer/assets/icons/custom/restart_alt.svg?component'
import FilterIcon from '@renderer/assets/icons/custom/filter_list.svg?component'
import PentagonIcon from '@renderer/assets/icons/custom/pentagon.svg?component'
import CropSquareIcon from '@renderer/assets/icons/custom/crop_square.svg?component'
import PolyLineIcon from '@renderer/assets/icons/custom/polyline.svg?component'
import KeypointIcon from '@renderer/assets/icons/custom/adjust.svg?component'
import CircleIcon from '@renderer/assets/icons/custom/circle.svg?component'
import DeleteIcon from '@renderer/assets/icons/custom/delete.svg?component'

import road from '@renderer/assets/images/road.jpg'
// Tipler
import type { PolygonAnn, PolylineAnn, Task } from '@renderer/types/annotation'

// Util
import { loadImage } from '@renderer/utils/image'
import { qsa } from '@renderer/utils/dom'

// Composable’lar
import { useCanvasInteractions } from '@renderer/composables/useCanvasInteractions'
import { useLabelerState } from '@renderer/composables/useLabelerState'
import { useHistory } from '@renderer/composables/useHistory'
import { useCanvasTransform } from '@renderer/composables/useCanvasTransform'
import { useTasks } from '@renderer/composables/useTasks'
import { useAnnotationsRenderer } from '@renderer/composables/useAnnotationsRenderer'
import { useKeyboardShortcuts } from '@renderer/composables/useKeyboardShortcuts'

/* =============================
   Refs (DOM erişimi)
   ============================= */
const canvasContainer = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const annotationsSvg = ref<SVGSVGElement | null>(null)

const shapesToolBtn = ref<HTMLButtonElement | null>(null)
const shapesDropdown = ref<HTMLDivElement | null>(null)

const filterBtn = ref<HTMLButtonElement | null>(null)
const filterDropdown = ref<HTMLDivElement | null>(null)

const crosshairH = ref<HTMLDivElement | null>(null)
const crosshairV = ref<HTMLDivElement | null>(null)
const coords = ref<HTMLDivElement | null>(null)

const zoomInBtn = ref<HTMLButtonElement | null>(null)
const zoomOutBtn = ref<HTMLButtonElement | null>(null)
const fitScreenBtn = ref<HTMLButtonElement | null>(null)
const resetViewBtn = ref<HTMLButtonElement | null>(null)

const toolGroup = ref<HTMLDivElement | null>(null)
const labelList = ref<HTMLDivElement | null>(null)
const annotationList = ref<HTMLDivElement | null>(null)

const undoBtn = ref<HTMLButtonElement | null>(null)
const redoBtn = ref<HTMLButtonElement | null>(null)
const saveBtn = ref<HTMLButtonElement | null>(null)
const themeToggle = ref<HTMLButtonElement | null>(null)

const taskTitle = ref<HTMLHeadingElement | null>(null)

const prevBtn = ref<HTMLButtonElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)

const deleteBtn = ref<HTMLButtonElement | null>(null)

/* =============================
   İç durum
   ============================= */

// Reactif state
const { state } = useLabelerState()

// Undo/Redo vb. geçmiş yönetimi
const { recordHistory, undo, redo } = useHistory(state)

// Canvas transform & zoom yönetimi
const { updateTransform, fitToScreen, zoom } = useCanvasTransform(state, canvasEl, annotationsSvg)

const {
  renderAnnotations,
  exportAnnotationsToImageSpace,
  clearSelection,
  deleteSelected,
  getImageCoordsFromEvent,
  updateDeleteButton
} = useAnnotationsRenderer(
  state,
  {
    annotationsSvg,
    annotationList,
    deleteBtn,
    canvasEl
  },
  recordHistory
)

// Demo için başlangıç görev listesi: road.jpg
const initialTasks: Task[] = [
  {
    id: 1,
    title: 'Road demo',
    image: road,
    status: 'in_progress'
  }
]
// Görevler (task listesi) ve aktif indeks
const { tasks, currentTaskIndex, currentTask } = useTasks(initialTasks)

let containerRO: ResizeObserver | null = null

/* =============================
   Shapes Dropdown Control
   ============================= */
let isShapesOpen = false
let onDocClick: ((e: MouseEvent) => void) | null = null
let onEsc: ((e: KeyboardEvent) => void) | null = null

function openShapes(): void {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.add('show')
  isShapesOpen = true
}

function closeShapes(): void {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.remove('show')
  isShapesOpen = false
}

function toggleShapes(e?: Event): void {
  e?.preventDefault()
  e?.stopPropagation()
  isShapesOpen ? closeShapes() : openShapes()
}

/* =============================
   Yardımcılar
   ============================= */

function enterPanMode(): void {
  const temp = annotationsSvg.value?.querySelector('#temp-shape')
  temp?.remove()

  state.isDrawing = false
  state.drawingShape = null
  state.polyPoints = []

  const selectTool = toolGroup.value?.querySelector(
    '.annotation-tool[data-tool="select"]'
  ) as HTMLElement | null
  setActiveTool(selectTool)
  updateCursor()
}

function setActiveTool(el: HTMLElement | null): void {
  if (!toolGroup.value) return
  qsa<HTMLElement>(toolGroup.value, '.annotation-tool').forEach((e) => e.classList.remove('active'))
  if (el) {
    el.classList.add('active')
    const tool = el.dataset.tool

    if (el.closest('#shapes-dropdown')) {
      shapesToolBtn.value?.classList.add('active')

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
    } else {
      if (tool === 'select' || tool === 'sam' || tool === 'shapes') {
        state.lastUsedTool = tool
      } else {
        state.lastUsedTool = 'select'
      }
    }
  }
  updateCursor()
}

/* =============================
   Seçim & Cursor
   ============================= */

function setActiveLabel(el: HTMLElement | null): void {
  if (!labelList.value) return
  qsa<HTMLElement>(labelList.value, '.label-item').forEach((e) => e.classList.remove('active'))
  if (el) {
    el.classList.add('active')
    state.activeLabel = el.dataset.label ?? null
  } else {
    state.activeLabel = null
  }
  updateCursor()
}

function updateCursor(): void {
  const target = canvasContainer.value
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

/* =============================
   Render
   ============================= */
function selectAnnotation(id: number): void {
  state.selectedAnnotationId = id
  const selectTool = toolGroup.value?.querySelector(
    '.annotation-tool[data-tool="select"]'
  ) as HTMLElement | null
  setActiveTool(selectTool)
  renderAnnotations()
}

/* =============================
   Polygon / Polyline Tamamlama
   ============================= */
const cancelPoly = (): void => {
  if (!state.isDrawing) return
  const temp = annotationsSvg.value!.querySelector('#temp-shape')
  temp?.remove()
  state.polyPoints = []
  state.drawingShape = null
  state.isDrawing = false
  updateCursor()
}

const commitPoly = (): void => {
  if (!state.isDrawing || !(state.drawingShape === 'polygon' || state.drawingShape === 'polyline'))
    return
  const minPts = state.drawingShape === 'polygon' ? 3 : 2
  if (state.polyPoints.length >= minPts) {
    const ann =
      state.drawingShape === 'polygon'
        ? ({
            id: Date.now(),
            type: 'polygon',
            label: state.activeLabel,
            points: [...state.polyPoints]
          } as PolygonAnn)
        : ({
            id: Date.now(),
            type: 'polyline',
            label: state.activeLabel,
            points: [...state.polyPoints]
          } as PolylineAnn)
    state.annotations.push(ann)
    recordHistory()
    renderAnnotations()
  }
  const temp = annotationsSvg.value!.querySelector('#temp-shape')
  temp?.remove()
  state.polyPoints = []
  state.drawingShape = null
  state.isDrawing = false
  updateCursor()
}

const { attachKeyboardShortcuts, detachKeyboardShortcuts } = useKeyboardShortcuts({
  state,
  undo,
  redo,
  deleteSelected,
  commitPoly,
  cancelPoly,
  clearSelection,
  enterPanMode
})

const { attachCanvasInteractions, detachCanvasInteractions } = useCanvasInteractions({
  state,
  canvasContainer,
  canvasEl,
  annotationsSvg,
  crosshairH,
  crosshairV,
  coords,
  getImageCoordsFromEvent,
  recordHistory,
  renderAnnotations,
  updateTransform,
  updateCursor,
  commitPoly
})

/* =============================
   Lifecycle: onMounted / onBeforeUnmount
   ============================= */
onMounted((): void => {
  if (taskTitle.value) taskTitle.value.textContent = 'Image Annotation - Task 1'

  if (shapesToolBtn.value && shapesDropdown.value) {
    shapesToolBtn.value.addEventListener('click', toggleShapes)
    shapesDropdown.value.addEventListener('click', (e): void => {
      const t = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
      if (t) {
        e.preventDefault()
        setActiveTool(t)
        closeShapes()
      }
      ;(e as MouseEvent).stopPropagation()
    })
    onDocClick = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!shapesDropdown.value!.contains(t) && !shapesToolBtn.value!.contains(t)) {
        closeShapes()
      }
    }
    document.addEventListener('click', onDocClick)
    onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeShapes()
    }
    document.addEventListener('keydown', onEsc)
    deleteBtn.value?.addEventListener('click', deleteSelected)
  }
  // Global klavye kısayolları
  attachKeyboardShortcuts()

  annotationList.value?.addEventListener('click', (e): void => {
    const t = (e.target as HTMLElement).closest('.annotation-item') as HTMLElement | null
    if (t) selectAnnotation(parseInt(t.dataset.id!))
    else clearSelection()
  })

  canvasEl.value?.addEventListener('click', (): void => {
    if (!state.isDrawing && !state.isPanning && state.lastUsedTool === 'select') {
      clearSelection()
    }
  })

  toolGroup.value?.addEventListener('click', (e): void => {
    const target = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
    if (!target) return
    if ((target as HTMLElement).tagName === 'A') (e as MouseEvent).preventDefault()
    setActiveTool(target)
    if ((target as HTMLElement).closest('#shapes-dropdown')) closeShapes()
  })

  labelList.value?.addEventListener('click', (e): void => {
    const target = (e.target as HTMLElement).closest('.label-item') as HTMLElement | null
    if (target) setActiveLabel(target)
  })

  annotationsSvg.value?.addEventListener('click', (e): void => {
    const t = (e.target as HTMLElement).closest('.annotation-shape') as HTMLElement | null
    if (t) selectAnnotation(parseInt(t.dataset.id!))
  })

  const submitBtn = document.querySelector(
    'button:has(> .ui-svg.text-white)'
  ) as HTMLButtonElement | null
  submitBtn?.addEventListener('click', (): void => {
    tasks.value[currentTaskIndex.value].status = 'completed'
    alert('Submitted ✔️')
  })

  undoBtn.value?.addEventListener('click', (): void => undo())
  redoBtn.value?.addEventListener('click', (): void => redo())
  saveBtn.value?.addEventListener('click', (): void => {
    const exported = exportAnnotationsToImageSpace()
    console.log('coordW/H (canvas):', canvasEl.value?.width, canvasEl.value?.height)
    console.log(
      'origW/H (Task):',
      currentTask.value?.originalWidth,
      currentTask.value?.originalHeight
    )
    console.log('raw annotations:', JSON.stringify(state.annotations, null, 2))
    console.log('exported annotations:', JSON.stringify(exported, null, 2))
    console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', JSON.stringify(exported, null, 2))

    console.log('--- ANNOTATION DATA (IMAGE SPACE JSON) ---\n', JSON.stringify(exported, null, 2))

    alert('Annotation JSON verisi (orijinal çözünürlükte) konsola yazıldı (F12).')
  })

  zoomInBtn.value?.addEventListener('click', (): void => {
    if (!canvasContainer.value) return
    const r = canvasContainer.value.getBoundingClientRect()
    zoom(0.1, r.left + r.width / 2, r.top + r.height / 2)
  })

  zoomOutBtn.value?.addEventListener('click', (): void => {
    if (!canvasContainer.value) return
    const r = canvasContainer.value.getBoundingClientRect()
    zoom(-0.1, r.left + r.width / 2, r.top + r.height / 2)
  })

  fitScreenBtn.value?.addEventListener('click', (): void => fitToScreen())
  resetViewBtn.value?.addEventListener('click', (): void => fitToScreen())

  window.addEventListener('resize', fitToScreen)

  containerRO = new ResizeObserver((): void => {
    requestAnimationFrame(fitToScreen)
  })
  if (canvasContainer.value) containerRO.observe(canvasContainer.value)
  // Canvas mouse/pointer etkileşimleri
  attachCanvasInteractions()

  prevBtn.value?.addEventListener('click', (): void => goPrevTask())
  nextBtn.value?.addEventListener('click', (): void => goNextTask())

  loadTaskByIndex(0)
  updateDeleteButton()
})

onBeforeUnmount((): void => {
  window.removeEventListener('resize', fitToScreen)
  containerRO?.disconnect()
  shapesToolBtn.value?.removeEventListener('click', toggleShapes)
  if (onDocClick) document.removeEventListener('click', onDocClick)
  if (onEsc) document.removeEventListener('keydown', onEsc)
  detachKeyboardShortcuts()
  detachCanvasInteractions()
})

/* =============================
   Task Yükleme & Navigasyon
   ============================= */
async function loadTaskByIndex(i: number): Promise<void> {
  if (tasks.value.length === 0) return
  const clamped = Math.max(0, Math.min(tasks.value.length - 1, i))
  currentTaskIndex.value = clamped
  const t = tasks.value[clamped]

  if (taskTitle.value) {
    taskTitle.value.textContent = `Image Annotation - ${t.title}`
  }

  state.annotations = []
  state.history = []
  state.historyIndex = -1

  try {
    const img = await loadImage(t.image)
    state.img = img

    // Eğer görev zaten orijinal çözünürlüğü biliyorsa, dokunma.
    // Bilmiyorsa fallback olarak naturalWidth/naturalHeight kullan.
    if (!t.originalWidth) {
      t.originalWidth = img.naturalWidth
    }
    if (!t.originalHeight) {
      t.originalHeight = img.naturalHeight
    }
    fitToScreen()

    const firstLabel = labelList.value?.querySelector('.label-item') as HTMLElement | null
    setActiveLabel(firstLabel)
    const selectTool = toolGroup.value?.querySelector(
      '.annotation-tool[data-tool="select"]'
    ) as HTMLElement | null
    setActiveTool(selectTool)
    recordHistory()
  } catch (err) {
    console.error('Image load failed:', err)
  }
}

function goPrevTask(): void {
  loadTaskByIndex((currentTaskIndex.value - 1 + tasks.value.length) % tasks.value.length)
}

function goNextTask(): void {
  loadTaskByIndex((currentTaskIndex.value + 1) % tasks.value.length)
}
</script>

<template>
  <div
    class="flex h-screen bg-muted dark:bg-gray-950 font-display text-slate-800 dark:text-gray-200"
  >
    <!-- Sidebar (kısa) -->
    <aside
      class="flex flex-col w-72 bg-primary-light dark:bg-background-dark border-r border-slate-200/40 dark:border-gray-800"
    >
      <div class="p-5 bg-muted">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">LabelGun</h1>
      </div>

      <nav class="flex-1 px-4 space-y-2 overflow-y-auto bg-muted p-3">
        <h2
          class="px-2 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2"
        >
          Tasks
        </h2>
        <ul class="space-y-3">
          <li v-for="(t, idx) in tasks" :key="t.id">
            <a
              href="#"
              :class="[
                'block rounded-lg overflow-hidden border-2',
                idx === currentTaskIndex
                  ? 'border-primary dark:border-primary/80 bg-primary/5'
                  : 'border-transparent hover:border-primary/50'
              ]"
              @click.prevent="loadTaskByIndex(idx)"
            >
              <div class="h-24 bg-muted flex items-center justify-center">
                <span class="text-slate-400 dark:text-gray-500">image</span>
              </div>
              <div class="p-3">
                <div class="flex justify-between items-start">
                  <span class="text-sm font-medium">{{ t.title }}</span>

                  <span
                    v-if="t.status === 'in_progress'"
                    class="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-800 dark:bg-gray-700/60 dark:text-gray-300"
                    >In Progress</span
                  >

                  <span
                    v-else-if="t.status === 'completed'"
                    class="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                    >Completed</span
                  >

                  <span
                    v-else
                    class="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700/60 dark:text-gray-300"
                    >Queued</span
                  >
                </div>
              </div>
            </a>
          </li>
        </ul>
      </nav>

      <div class="p-4 border-t border-slate-200 dark:border-gray-800 relative bg-muted">
        <button
          ref="filterBtn"
          class="w-full flex items-center justify-center gap-2 rounded bg-primary text-slate-900 hover:opacity-90 py-2 px-4 text-sm font-semibold"
        >
          <FilterIcon class="ui-svg h-5 w-5 text-slate-900" />
          <span>Filter Tasks</span>
        </button>
        <div ref="filterDropdown" class="absolute bottom-full mb-2 w-full left-0 px-4">
          <!-- demo dropdown -->
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <header
        class="flex items-center justify-between p-5 border-b border-slate-200/60 dark:border-gray-800 bg-primary-light/20 dark:bg-background-dark"
      >
        <div class="flex items-center gap-4">
          <h2 ref="taskTitle" class="text-xl font-bold">Image Annotation - Task 1</h2>
          <div class="flex items-center gap-2">
            <button
              ref="prevBtn"
              class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
            >
              <ArrowBackIcon class="ui-svg h-5 w-5 text-gray-700 dark:text-gray-200" />
            </button>
            <button
              ref="nextBtn"
              class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
            >
              <ArrowFwdIcon class="ui-svg h-5 w-5 text-gray-700 dark:text-gray-200" />
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            ref="themeToggle"
            class="relative inline-flex items-center h-8 w-14 shrink-0 rounded-full bg-slate-200 dark:bg-gray-700 ml-2"
          >
            <span
              class="absolute left-1.5 top-1.5 h-5 w-5 bg-white dark:bg-gray-800 rounded-full shadow-md transform transition-transform duration-300 dark:translate-x-6 flex items-center justify-center"
            >
              <SunIcon class="ui-svg h-4 w-4 text-slate-600 opacity-100 dark:opacity-0" />
              <MoonIcon class="ui-svg h-4 w-4 text-primary absolute opacity-0 dark:opacity-100" />
            </span>
          </button>

          <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-400">
            <TimerIcon class="ui-svg h-5 w-5" />
            <div
              class="font-mono bg-slate-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold"
            >
              01:23:45
            </div>
          </div>

          <button
            ref="saveBtn"
            class="flex items-center gap-2 rounded bg-primary text-slate-900 hover:opacity-90 py-2 px-4 text-sm font-semibold"
          >
            <SaveIcon class="ui-svg h-5 w-5 text-slate-900" />
            <span>Save Draft</span>
          </button>

          <button
            class="flex items-center gap-2 rounded bg-primary py-2 px-4 text-sm font-semibold text-slate-900 hover:opacity-90"
          >
            <ApproveIcon class="ui-svg h-5 w-5 text-slate-900" />
            <span>Submit Work</span>
          </button>
        </div>
      </header>

      <div class="flex-1 flex p-4 gap-4 overflow-y-auto">
        <div class="flex-1 flex flex-col gap-2">
          <!-- Toolbar -->
          <div
            class="flex items-center justify-between gap-1 p-2 bg-primary-light/10 dark:bg-background-dark rounded-lg border border-primary/30 dark:border-gray-800"
          >
            <div id="tool-group" ref="toolGroup" class="flex items-center gap-1">
              <button
                class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 annotation-tool"
                data-tool="select"
                title="Select/Edit"
              >
                <SelectIcon class="ui-svg h-6 w-6 text-slate-600 dark:text-gray-300" />
              </button>

              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 annotation-tool"
                data-tool="sam"
                title="SAM"
              >
                <SamIcon class="ui-svg h-6 w-6 text-slate-600 dark:text-gray-300" />
              </button>

              <div class="relative">
                <button
                  id="shapes-tool-btn"
                  ref="shapesToolBtn"
                  class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
                  title="Annotation Shapes"
                >
                  <ShapesIcon class="ui-svg h-6 w-6 text-slate-600 dark:text-gray-300" />
                  <ChevronDownIcon class="ui-svg h-4 w-4 text-slate-600 dark:text-gray-300" />
                </button>

                <div
                  id="shapes-dropdown"
                  ref="shapesDropdown"
                  class="absolute top-full mt-2 w-48 bg-slate-50 dark:bg-gray-800 rounded-lg shadow-xl z-20"
                >
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
                    data-tool="bbox"
                  >
                    <CropSquareIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
                    <span>Bounding Box</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
                    data-tool="polygon"
                  >
                    <PentagonIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
                    <span>Polygon</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
                    data-tool="polyline"
                  >
                    <PolyLineIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
                    <span>Polyline</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
                    data-tool="keypoint"
                  >
                    <KeypointIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
                    <span>Keypoint</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 annotation-tool"
                    data-tool="circle"
                  >
                    <CircleIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
                    <span>Circle</span>
                  </a>
                </div>
              </div>

              <div class="h-6 w-px bg-slate-200 dark:bg-gray-700 mx-1"></div>

              <button
                ref="undoBtn"
                class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Undo (Ctrl+Z)"
              >
                <UndoIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
              </button>

              <button
                ref="redoBtn"
                class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Redo (Ctrl+Y)"
              >
                <RedoIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
              </button>

              <button
                ref="deleteBtn"
                class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Delete (Del)"
              >
                <DeleteIcon class="ui-svg h-5 w-5 text-slate-600 dark:text-gray-300" />
              </button>
            </div>
          </div>

          <!-- Canvas alanı (kart içinde) -->
          <div
            class="flex-1 rounded-lg bg-primary-light/5 dark:bg-background-dark border border-primary/25 dark:border-gray-800 shadow-sm p-2"
          >
            <div
              ref="canvasContainer"
              class="relative w-full h-full rounded-md bg-muted dark:bg-gray-800 overflow-hidden canvas-container"
            >
              <canvas id="canvas" ref="canvasEl"></canvas>
              <svg id="annotations-svg" ref="annotationsSvg"></svg>

              <div class="crosshair-lines">
                <div ref="crosshairH" class="crosshair-line crosshair-horizontal"></div>
                <div ref="crosshairV" class="crosshair-line crosshair-vertical"></div>
              </div>

              <div
                class="absolute bottom-4 right-4 flex items-center gap-1 bg-black/50 p-1 rounded-lg text-white"
              >
                <button ref="zoomOutBtn" class="p-2 rounded-md hover:bg-white/20" title="Zoom Out">
                  <ZoomOutIcon class="ui-svg h-6 w-6 text-white" />
                </button>
                <button ref="zoomInBtn" class="p-2 rounded-md hover:bg-white/20" title="Zoom In">
                  <ZoomInIcon class="ui-svg h-6 w-6 text-white" />
                </button>
                <button
                  ref="fitScreenBtn"
                  class="p-2 rounded-md hover:bg-white/20"
                  title="Fit to Screen"
                >
                  <FitScreenIcon class="ui-svg h-6 w-6 text-white" />
                </button>
                <button
                  ref="resetViewBtn"
                  class="p-2 rounded-md hover:bg-white/20"
                  title="Reset View"
                >
                  <ResetViewIcon class="ui-svg h-6 w-6 text-white" />
                </button>
              </div>

              <div
                ref="coords"
                class="absolute bottom-4 left-4 bg-black/50 text-white text-xs font-mono rounded px-2 py-1"
              >
                X: 0, Y: 0
              </div>
            </div>
          </div>
        </div>

        <!-- Sağ paneller -->
        <div class="w-full lg:w-96 flex flex-col gap-4 pt-0">
          <div
            class="bg-primary-light/10 dark:bg-background-dark p-4 rounded-lg border border-primary/25 dark:border-gray-800"
          >
            <h3 class="text-lg font-semibold mb-3">Annotations</h3>
            <div ref="annotationList" class="space-y-3"></div>
          </div>

          <div
            class="bg-primary-light/10 dark:bg-background-dark p-4 rounded-lg border border-slate-200 dark:border-gray-800 flex flex-col flex-1"
          >
            <h3 class="text-lg font-semibold mb-3">Labels</h3>
            <div class="relative mb-3">
              <SearchIcon
                class="ui-svg h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              />
              <input
                type="search"
                placeholder="Search labels..."
                class="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-muted dark:bg-gray-800"
              />
            </div>
            <div ref="labelList" class="flex flex-wrap gap-2">
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20 label-item"
                data-label="Car"
                >Car</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20 label-item"
                data-label="Pedestrian"
                >Pedestrian</span
              >
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
<style src="@renderer/styles/labeler-view.css"></style>
