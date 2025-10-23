<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createPopper } from '@popperjs/core'

/** Basit tipler */
type BBox = {
  id: number
  type: 'bbox'
  label: string | null
  x: number
  y: number
  width: number
  height: number
}
type Annotation = BBox

/** Refs (DOM erişimi) */
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

/** İç durum */
const state = {
  annotations: [] as Annotation[],
  selectedAnnotationId: null as number | null,
  history: [] as Annotation[][],
  historyIndex: -1,

  scale: 1,
  translateX: 0,
  translateY: 0,
  startPanX: 0,
  startPanY: 0,

  isPanning: false,
  isDrawing: false,
  drawingStartX: 0,
  drawingStartY: 0,

  lastUsedTool: 'select' as 'select' | 'sam' | 'shapes',
  lastUsedShape: 'bbox' as 'bbox' | 'polygon',
  activeLabel: null as string | null,

  img: new Image()
}

const SVG_NS = 'http://www.w3.org/2000/svg'
let containerRO: ResizeObserver | null = null

/** Yardımcılar */
function qsa<T extends Element = Element>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll(sel)) as T[]
}
function setActiveTool(el: HTMLElement | null) {
  if (!toolGroup.value) return
  qsa<HTMLElement>(toolGroup.value, '.annotation-tool').forEach((e) => e.classList.remove('active'))
  if (el) {
    el.classList.add('active')
    if (el.closest('#shapes-dropdown')) {
      shapesToolBtn.value?.classList.add('active')
      state.lastUsedShape = (el.dataset.tool as any) ?? 'bbox'
      state.lastUsedTool = 'shapes'
    } else {
      state.lastUsedTool = (el.dataset.tool as any) ?? 'select'
    }
  }
  updateCursor()
}
function setActiveLabel(el: HTMLElement | null) {
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
function updateCursor() {
  const target = canvasContainer.value
  if (!target) return
  const isToolActive =
    !!state.activeLabel && (state.lastUsedTool === 'shapes' || state.lastUsedTool === 'sam')
  target.classList.toggle('tool-active', isToolActive)
}

/** Render */
function renderAnnotations() {
  if (!annotationsSvg.value || !annotationList.value) return
  annotationsSvg.value.innerHTML = ''
  annotationList.value.innerHTML = ''

  state.annotations.forEach((ann) => {
    if (ann.type === 'bbox') {
      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('x', String(ann.x))
      rect.setAttribute('y', String(ann.y))
      rect.setAttribute('width', String(ann.width))
      rect.setAttribute('height', String(ann.height))
      rect.setAttribute('fill', 'rgba(17,115,212,0.4)')
      rect.setAttribute('stroke', '#1173d4')
      rect.setAttribute('stroke-width', '2')
      rect.dataset.id = String(ann.id)
      rect.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) rect.classList.add('selected')
      annotationsSvg.value!.appendChild(rect)
    }

    const item = document.createElement('div')
    item.className =
      'p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer annotation-item'
    if (ann.id === state.selectedAnnotationId) item.classList.add('selected')
    item.dataset.id = String(ann.id)
    item.innerHTML = `
      <div class="flex justify-between items-center pointer-events-none">
        <p class="text-sm font-medium">${ann.label ?? 'Unlabeled'} ${String(ann.id).slice(-4)}</p>
      </div>
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 pointer-events-none">${ann.type}</p>
    `
    annotationList.value!.appendChild(item)
  })
}

/** History */
function recordHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1)
  state.history.push(JSON.parse(JSON.stringify(state.annotations)))
  state.historyIndex++
  updateUndoRedoButtons()
}
function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--
    state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    renderAnnotations()
    updateUndoRedoButtons()
  }
}
function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++
    state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]))
    renderAnnotations()
    updateUndoRedoButtons()
  }
}
function updateUndoRedoButtons() {
  if (undoBtn.value) undoBtn.value.disabled = state.historyIndex <= 0
  if (redoBtn.value) redoBtn.value.disabled = state.historyIndex >= state.history.length - 1
}
function selectAnnotation(id: number) {
  state.selectedAnnotationId = id
  const selectTool = toolGroup.value?.querySelector(
    '.annotation-tool[data-tool="select"]'
  ) as HTMLElement | null
  setActiveTool(selectTool)
  renderAnnotations()
}

/** Görüntüleme/Transform */
function updateTransform() {
  if (!canvasEl.value || !annotationsSvg.value) return
  const transformValue = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`
  canvasEl.value.style.transform = transformValue
  annotationsSvg.value.style.transform = transformValue
}
function fitToScreen() {
  if (!canvasContainer.value || !canvasEl.value || !annotationsSvg.value) return

  // container ölçüsü hazır değilse tekrar dene
  const cw = canvasContainer.value.clientWidth
  const ch = canvasContainer.value.clientHeight
  if (!cw || !ch) {
    requestAnimationFrame(fitToScreen)
    return
  }

  // görsel ölçüsü hazır değilse tekrar dene
  const iw = state.img.naturalWidth || canvasEl.value.width
  const ih = state.img.naturalHeight || canvasEl.value.height
  if (!iw || !ih) {
    requestAnimationFrame(fitToScreen)
    return
  }

  // Canvas & SVG boyutu
  canvasEl.value.width = iw
  canvasEl.value.height = ih
  annotationsSvg.value.setAttribute('viewBox', `0 0 ${iw} ${ih}`)
  annotationsSvg.value.setAttribute('width', String(iw))
  annotationsSvg.value.setAttribute('height', String(ih))

  // Ölçek ve konum
  const s = Math.min(cw / iw, ch / ih) * 0.98
  state.scale = Number.isFinite(s) && s > 0 ? s : 1

  const tx = (cw - iw * state.scale) / 2
  const ty = (ch - ih * state.scale) / 2
  state.translateX = Number.isFinite(tx) ? tx : 0
  state.translateY = Number.isFinite(ty) ? ty : 0

  // Görseli çiz
  const ctx = canvasEl.value.getContext('2d')!
  ctx.clearRect(0, 0, iw, ih)
  ctx.drawImage(state.img, 0, 0)

  updateTransform()
}
function zoom(delta: number, clientX: number, clientY: number) {
  if (!canvasContainer.value) return
  const rect = canvasContainer.value.getBoundingClientRect()

  // geçersiz ölçek varsa önce sığdır
  if (!Number.isFinite(state.scale) || state.scale <= 0) {
    fitToScreen()
  }

  const mouseX = clientX - rect.left
  const mouseY = clientY - rect.top
  const worldX = (mouseX - state.translateX) / state.scale
  const worldY = (mouseY - state.translateY) / state.scale

  // çarpan ile ölçekle (patlamasın)
  const newScale = Math.max(0.05, Math.min(state.scale * (1 + delta), 10))

  state.translateX = mouseX - worldX * newScale
  state.translateY = mouseY - worldY * newScale
  state.scale = newScale

  updateTransform()
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  zoom(delta, e.clientX, e.clientY)
}

/** Mount */
onMounted(() => {
  // Başlık
  if (taskTitle.value) taskTitle.value.textContent = 'Image Annotation - Task 1'

  // Dropdown (shapes) – Popper
  if (shapesToolBtn.value && shapesDropdown.value) {
    createPopper(shapesToolBtn.value, shapesDropdown.value, { placement: 'bottom-start' })
    const show = () => shapesDropdown.value!.classList.add('show')
    const hide = () => shapesDropdown.value!.classList.remove('show')
    ;['mouseenter', 'focus'].forEach((e) => {
      shapesToolBtn.value!.addEventListener(e, show)
      shapesDropdown.value!.addEventListener(e, show)
    })
    ;['mouseleave', 'blur'].forEach((e) => {
      shapesToolBtn.value!.addEventListener(e, hide)
      shapesDropdown.value!.addEventListener(e, hide)
    })
  }

  // Tema
  themeToggle.value?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark')
  })

  // Araç tıklamaları
  toolGroup.value?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
    if (!target) return
    if ((target as HTMLElement).tagName === 'A') (e as MouseEvent).preventDefault()
    setActiveTool(target)
  })

  // Label seçimi
  labelList.value?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.label-item') as HTMLElement | null
    if (target) setActiveLabel(target)
  })

  // Sağ panel / SVG seçim
  annotationList.value?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.annotation-item') as HTMLElement | null
    if (t) selectAnnotation(parseInt(t.dataset.id!))
  })
  annotationsSvg.value?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.annotation-shape') as HTMLElement | null
    if (t) selectAnnotation(parseInt(t.dataset.id!))
  })

  // Undo/Redo/Save
  undoBtn.value?.addEventListener('click', () => undo())
  redoBtn.value?.addEventListener('click', () => redo())
  saveBtn.value?.addEventListener('click', () => {
    // eslint-disable-next-line no-console
    console.log('--- ANNOTATION DATA (JSON) ---\n', JSON.stringify(state.annotations, null, 2))
    alert('Annotation JSON verisi konsola yazıldı (F12).')
  })
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault()
      redo()
    }
  })
  canvasContainer.value?.addEventListener('wheel', onWheel, { passive: false })

  // Zoom toolbar
  zoomInBtn.value?.addEventListener('click', () => {
    if (!canvasContainer.value) return
    const r = canvasContainer.value.getBoundingClientRect()
    zoom(0.2, r.left + r.width / 2, r.top + r.height / 2)
  })
  zoomOutBtn.value?.addEventListener('click', () => {
    if (!canvasContainer.value) return
    const r = canvasContainer.value.getBoundingClientRect()
    zoom(-0.2, r.left + r.width / 2, r.top + r.height / 2)
  })

  fitScreenBtn.value?.addEventListener('click', () => fitToScreen())
  resetViewBtn.value?.addEventListener('click', () => fitToScreen())
  window.addEventListener('resize', fitToScreen)
  // Container boyutu değişince yeniden sığdır
  containerRO = new ResizeObserver(() => {
    requestAnimationFrame(fitToScreen)
  })
  if (canvasContainer.value) containerRO.observe(canvasContainer.value)

  // Çizim & Pan
  canvasContainer.value?.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    const isToolActive = canvasContainer.value!.classList.contains('tool-active')
    if (isToolActive) {
      state.isDrawing = true
      const rect = canvasContainer.value!.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      state.drawingStartX = (mouseX - state.translateX) / state.scale
      state.drawingStartY = (mouseY - state.translateY) / state.scale

      // temp rect
      const tempRect = document.createElementNS(SVG_NS, 'rect')
      tempRect.setAttribute('id', 'temp-shape')
      tempRect.setAttribute('stroke', '#ffc107')
      tempRect.setAttribute('stroke-width', '2')
      tempRect.setAttribute('fill', 'none')
      annotationsSvg.value!.appendChild(tempRect)
    } else {
      state.isPanning = true

      state.startPanX = e.clientX - state.translateX

      state.startPanY = e.clientY - state.translateY
      canvasContainer.value!.classList.add('panning')
    }
  })

  canvasContainer.value?.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvasContainer.value!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (crosshairH.value) crosshairH.value.style.top = `${mouseY}px`
    if (crosshairV.value) crosshairV.value.style.left = `${mouseX}px`

    const imgX = (mouseX - state.translateX) / state.scale
    const imgY = (mouseY - state.translateY) / state.scale

    if (
      !Number.isFinite(imgX) ||
      !Number.isFinite(imgY) ||
      !Number.isFinite(state.scale) ||
      state.scale <= 0
    ) {
      if (coords.value) coords.value.textContent = 'X: -, Y: -'
      return
    }

    if (coords.value) coords.value.textContent = `X: ${Math.round(imgX)}, Y: ${Math.round(imgY)}`

    if (state.isDrawing) {
      const tempRect = annotationsSvg.value!.querySelector('#temp-shape') as SVGRectElement | null
      if (!tempRect) return
      const x = Math.min(imgX, state.drawingStartX)
      const y = Math.min(imgY, state.drawingStartY)
      const w = Math.abs(imgX - state.drawingStartX)
      const h = Math.abs(imgY - state.drawingStartY)
      tempRect.setAttribute('x', String(x))
      tempRect.setAttribute('y', String(y))
      tempRect.setAttribute('width', String(w))
      tempRect.setAttribute('height', String(h))
    } else if (state.isPanning) {
      // @ts-expect-error: dinamik
      state.translateX = e.clientX - state.startPanX
      // @ts-expect-error: dinamik
      state.translateY = e.clientY - state.startPanY
      updateTransform()
    }
  })

  const finishPointer = () => {
    if (state.isDrawing) {
      const tempRect = annotationsSvg.value!.querySelector('#temp-shape') as SVGRectElement | null
      if (tempRect) {
        const w = parseFloat(tempRect.getAttribute('width') || '0')
        const h = parseFloat(tempRect.getAttribute('height') || '0')
        if (w > 5 && h > 5) {
          const newAnn: Annotation = {
            id: Date.now(),
            type: 'bbox',
            label: state.activeLabel,
            x: parseFloat(tempRect.getAttribute('x') || '0'),
            y: parseFloat(tempRect.getAttribute('y') || '0'),
            width: w,
            height: h
          }
          state.annotations.push(newAnn)
          recordHistory()
          renderAnnotations()
        }
        tempRect.remove()
      }
    }
    state.isDrawing = false
    state.isPanning = false
    canvasContainer.value?.classList.remove('panning')
  }
  canvasContainer.value?.addEventListener('mouseup', finishPointer)
  canvasContainer.value?.addEventListener('mouseleave', finishPointer)

  // Başlangıç resmi
  state.img.crossOrigin = 'anonymous'
  state.img.src = 'https://i.imgur.com/g88T35b.jpeg' // istersen assets içine yerel resim koyabiliriz
  const onReady = () => {
    fitToScreen()
    // varsayılan label + tool
    const firstLabel = labelList.value?.querySelector('.label-item') as HTMLElement | null
    setActiveLabel(firstLabel)
    const selectTool = toolGroup.value?.querySelector(
      '.annotation-tool[data-tool="select"]'
    ) as HTMLElement | null
    setActiveTool(selectTool)
    recordHistory()
  }
  if (state.img.complete) onReady()
  else state.img.onload = onReady
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitToScreen)
  canvasContainer.value?.removeEventListener('wheel', onWheel as any)
  containerRO?.disconnect()
})
</script>

<template>
  <div
    class="flex h-screen bg-background-light dark:bg-background-dark font-display text-gray-800 dark:text-gray-200"
  >
    <!-- Sidebar (kısa) -->
    <aside
      class="flex flex-col w-72 bg-white dark:bg-background-dark border-r border-gray-200 dark:border-gray-800"
    >
      <div class="p-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">LabelGun</h1>
      </div>

      <nav class="flex-1 px-4 space-y-2 overflow-y-auto">
        <h2
          class="px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"
        >
          Tasks
        </h2>
        <ul class="space-y-3">
          <li>
            <a
              class="block rounded-lg overflow-hidden border-2 border-primary dark:border-primary/80 bg-primary/5"
              href="#"
            >
              <div class="h-24 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-gray-400 dark:text-gray-500"
                  >image</span
                >
              </div>
              <div class="p-3">
                <div class="flex justify-between items-start">
                  <span class="text-sm font-medium">Task 1</span>
                  <span
                    class="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                    >In Progress</span
                  >
                </div>
              </div>
            </a>
          </li>
          <li>
            <a
              class="block rounded-lg overflow-hidden border-2 border-transparent hover:border-primary/50"
              href="#"
            >
              <div class="h-24 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-gray-400 dark:text-gray-500"
                  >image</span
                >
              </div>
              <div class="p-3">
                <div class="flex justify-between items-start">
                  <span class="text-sm font-medium">Task 2</span>
                  <span
                    class="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                    >Completed</span
                  >
                </div>
              </div>
            </a>
          </li>
        </ul>
      </nav>

      <div class="p-4 border-t border-gray-200 dark:border-gray-800 relative">
        <button
          ref="filterBtn"
          class="w-full flex items-center justify-center gap-2 rounded bg-primary/10 dark:bg-primary/20 py-2 px-4 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <span class="material-symbols-outlined">filter_list</span>
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
        class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-background-dark"
      >
        <div class="flex items-center gap-4">
          <h2 ref="taskTitle" class="text-xl font-bold">Image Annotation - Task 1</h2>
          <div class="flex items-center gap-2">
            <button class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200">
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <button class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200">
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            ref="themeToggle"
            class="relative inline-flex items-center h-8 w-14 rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <span
              class="absolute left-1.5 top-1.5 h-5 w-5 bg-white dark:bg-gray-800 rounded-full shadow-md transform transition-transform duration-300 dark:translate-x-6 flex items-center justify-center"
            >
              <span
                class="material-symbols-outlined text-sm text-gray-600 dark:text-yellow-400 dark:opacity-0 opacity-100"
                >light_mode</span
              >
              <span
                class="material-symbols-outlined text-sm text-yellow-400 dark:text-gray-300 absolute opacity-0 dark:opacity-100"
                >dark_mode</span
              >
            </span>
          </button>

          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span class="material-symbols-outlined">timer</span>
            <div class="font-mono bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold">
              01:23:45
            </div>
          </div>

          <button
            ref="saveBtn"
            class="flex items-center gap-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-semibold hover:bg-gray-50"
          >
            <span class="material-symbols-outlined text-green-500">save</span
            ><span>Save Draft</span>
          </button>
          <button
            class="flex items-center gap-2 rounded bg-primary py-2 px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <span>Submit Work</span><span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </header>

      <div class="flex-1 flex p-2 gap-2 overflow-y-auto">
        <div class="flex-1 flex flex-col gap-2">
          <!-- Toolbar -->
          <div
            class="flex items-center justify-between gap-1 p-2 bg-white dark:bg-background-dark rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <div ref="toolGroup" class="flex items-center gap-1" id="tool-group">
              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 annotation-tool"
                data-tool="select"
                title="Select/Edit"
              >
                <span class="material-symbols-outlined">touch_app</span>
              </button>
              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 annotation-tool"
                data-tool="sam"
                title="SAM"
              >
                <span class="material-symbols-outlined">auto_fix</span>
              </button>

              <div class="relative">
                <button
                  ref="shapesToolBtn"
                  class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
                  id="shapes-tool-btn"
                  title="Annotation Shapes"
                >
                  <span class="material-symbols-outlined">category</span>
                  <span class="material-symbols-outlined text-sm">arrow_drop_down</span>
                </button>
                <div
                  ref="shapesDropdown"
                  class="absolute top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20"
                  id="shapes-dropdown"
                >
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="bbox"
                  >
                    <span class="material-symbols-outlined">crop_square</span
                    ><span>Bounding Box</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="polygon"
                  >
                    <span class="material-symbols-outlined">pentagon</span><span>Polygon</span>
                  </a>
                </div>
              </div>

              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
              <button
                ref="undoBtn"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Undo (Ctrl+Z)"
              >
                <span class="material-symbols-outlined">undo</span>
              </button>
              <button
                ref="redoBtn"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Redo (Ctrl+Y)"
              >
                <span class="material-symbols-outlined">redo</span>
              </button>
            </div>
          </div>

          <!-- Canvas alanı -->
          <div
            ref="canvasContainer"
            class="relative w-full flex-1 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden canvas-container"
          >
            <canvas ref="canvasEl" id="canvas"></canvas>
            <svg ref="annotationsSvg" id="annotations-svg"></svg>

            <div class="crosshair-lines">
              <div ref="crosshairH" class="crosshair-line crosshair-horizontal"></div>
              <div ref="crosshairV" class="crosshair-line crosshair-vertical"></div>
            </div>

            <div
              class="absolute bottom-4 right-4 flex items-center gap-1 bg-black/50 p-1 rounded-lg text-white"
            >
              <button ref="zoomOutBtn" class="p-2 rounded-md hover:bg-white/20" title="Zoom Out">
                <span class="material-symbols-outlined">zoom_out</span>
              </button>
              <button ref="zoomInBtn" class="p-2 rounded-md hover:bg-white/20" title="Zoom In">
                <span class="material-symbols-outlined">zoom_in</span>
              </button>
              <button
                ref="fitScreenBtn"
                class="p-2 rounded-md hover:bg-white/20"
                title="Fit to Screen"
              >
                <span class="material-symbols-outlined">fit_screen</span>
              </button>
              <button
                ref="resetViewBtn"
                class="p-2 rounded-md hover:bg-white/20"
                title="Reset View"
              >
                <span class="material-symbols-outlined">restart_alt</span>
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

        <!-- Sağ paneller -->
        <div class="w-full lg:w-96 flex flex-col gap-4 pt-0">
          <div
            class="bg-white dark:bg-background-dark p-4 rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <h3 class="text-lg font-semibold mb-3">Annotations</h3>
            <div ref="annotationList" class="space-y-3"></div>
          </div>

          <div
            class="bg-white dark:bg-background-dark p-4 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col flex-1"
          >
            <h3 class="text-lg font-semibold mb-3">Labels</h3>
            <div class="relative mb-3">
              <span
                class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                >search</span
              >
              <input
                type="search"
                placeholder="Search labels..."
                class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
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

<style>
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
}
.canvas-container {
  user-select: none;
  cursor: grab;
}
.canvas-container.panning {
  cursor: grabbing;
}
.canvas-container.tool-active {
  cursor: crosshair;
}
.crosshair-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.canvas-container.tool-active:hover .crosshair-lines {
  opacity: 1;
}
.crosshair-line {
  position: absolute;
  background-color: rgba(229, 231, 235, 0.7);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
}
.crosshair-horizontal {
  width: 100%;
  height: 1px;
  left: 0;
}
.crosshair-vertical {
  width: 1px;
  height: 100%;
  top: 0;
}
#canvas,
#annotations-svg {
  will-change: transform;
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
#annotations-svg {
  pointer-events: none;
}
#annotations-svg > * {
  pointer-events: auto;
  cursor: pointer;
}
#shapes-dropdown {
  display: none;
}
#shapes-dropdown.show {
  display: block;
}
.annotation-tool.active {
  background-color: #1173d41a;
  color: #1173d4;
}
html.dark .annotation-tool.active {
  background-color: #1173d433;
}
.label-item.active {
  background-color: #1173d4;
  color: #fff;
  border-color: #1173d4;
}
.annotation-item.selected {
  background-color: #1173d41a;
  border-color: #1173d480;
}
#annotations-svg .annotation-shape.selected {
  stroke-width: 4;
  stroke: #ffc107;
}
#temp-shape {
  stroke-dasharray: 5, 5;
}
</style>
