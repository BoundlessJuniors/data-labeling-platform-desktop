<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
// import undoIcon from '@renderer/assets/icons/custom/undo.svg'
// import redoIcon from '@renderer/assets/icons/custom/redo.svg'
// import selectIcon from '@renderer/assets/icons/custom/touch_app.svg'
// import samIcon from '@renderer/assets/icons/custom/wand_shine.svg'
// import shapesIcon from '@renderer/assets/icons/custom/category.svg'
// import chevronDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg'
// import arrowBack from '@renderer/assets/icons/custom/arrow_back.svg'
// import arrowForward from '@renderer/assets/icons/custom/arrow_forward.svg'
// import sunIcon from '@renderer/assets/icons/custom/light_mode.svg'
// import moonIcon from '@renderer/assets/icons/custom/dark_mode.svg'
// import timerIcon from '@renderer/assets/icons/custom/timer.svg'
// import saveIcon from '@renderer/assets/icons/custom/cloud_done.svg'
// import approvalIcon from '@renderer/assets/icons/custom/approval_delegation.svg'
// import searchIcon from '@renderer/assets/icons/custom/search.svg'
// import zoomOutIcon from '@renderer/assets/icons/custom/zoom_out.svg'
// import zoomInIcon from '@renderer/assets/icons/custom/zoom_in.svg'
// import fitScreenIcon from '@renderer/assets/icons/custom/fit_screen.svg'
// import resetViewIcon from '@renderer/assets/icons/custom/restart_alt.svg'
// import filterIcon from '@renderer/assets/icons/custom/filter_list.svg'
import UndoIcon        from '@renderer/assets/icons/custom/undo.svg?component'
import RedoIcon        from '@renderer/assets/icons/custom/redo.svg?component'
import SelectIcon      from '@renderer/assets/icons/custom/touch_app.svg?component'
import SamIcon         from '@renderer/assets/icons/custom/wand_shine.svg?component'
import ShapesIcon      from '@renderer/assets/icons/custom/category.svg?component'
import ChevronDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg?component'
import ArrowBackIcon   from '@renderer/assets/icons/custom/arrow_back.svg?component'
import ArrowFwdIcon    from '@renderer/assets/icons/custom/arrow_forward.svg?component'
import SunIcon         from '@renderer/assets/icons/custom/light_mode.svg?component'
import MoonIcon        from '@renderer/assets/icons/custom/dark_mode.svg?component'
import TimerIcon       from '@renderer/assets/icons/custom/timer.svg?component'
import SaveIcon        from '@renderer/assets/icons/custom/cloud_done.svg?component'
import ApproveIcon     from '@renderer/assets/icons/custom/approval_delegation.svg?component'
import SearchIcon      from '@renderer/assets/icons/custom/search.svg?component'
import ZoomOutIcon     from '@renderer/assets/icons/custom/zoom_out.svg?component'
import ZoomInIcon      from '@renderer/assets/icons/custom/zoom_in.svg?component'
import FitScreenIcon   from '@renderer/assets/icons/custom/fit_screen.svg?component'
import ResetViewIcon   from '@renderer/assets/icons/custom/restart_alt.svg?component'
import FilterIcon      from '@renderer/assets/icons/custom/filter_list.svg?component'
import PentagonIcon    from '@renderer/assets/icons/custom/pentagon.svg?component'
import CropSquareIcon    from '@renderer/assets/icons/custom/crop_square.svg?component'
import PolyLineIcon    from '@renderer/assets/icons/custom/polyline.svg?component'
import KeypointIcon    from '@renderer/assets/icons/custom/adjust.svg?component'
import CircleIcon    from '@renderer/assets/icons/custom/circle.svg?component'
import DeleteIcon    from '@renderer/assets/icons/custom/delete.svg?component'

import road from '@renderer/assets/images/road.jpg';

/** Basit tipler */
type Point = { x: number; y: number }

type BBox = {
  id: number
  type: 'bbox'
  label: string | null
  x: number
  y: number
  width: number
  height: number
}

type PolygonAnn = {
  id: number
  type: 'polygon'
  label: string | null
  points: Point[]
}

type PolylineAnn = {
  id: number
  type: 'polyline'
  label: string | null
  points: Point[]
}

type KeypointAnn = {
  id: number
  type: 'keypoint'
  label: string | null
  x: number
  y: number
}

type CircleAnn = {
  id: number
  type: 'circle'
  label: string | null
  cx: number
  cy: number
  r: number
}

type Annotation = BBox | PolygonAnn | PolylineAnn | KeypointAnn | CircleAnn


type TaskStatus = 'in_progress' | 'completed' | 'queued'
type Task = {
  id: number
  title: string
  image: string
  status: TaskStatus
}

/** Demo görevler */
const tasks = ref<Task[]>([
  { id: 1, title: 'Task 1', image: road, status: 'in_progress' },
  { id: 2, title: 'Task 2', image: road, status: 'completed' }
]);


const currentTaskIndex = ref(0)
const currentTask = computed(() => tasks.value[currentTaskIndex.value])


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

const prevBtn = ref<HTMLButtonElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)

const deleteBtn = ref<HTMLButtonElement | null>(null)



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
  lastUsedShape: 'bbox' as 'bbox' | 'polygon' | 'polyline' | 'keypoint' | 'circle',
  activeLabel: null as string | null,

  // çizim süreci için küçük ekler
  drawingShape: null as ('bbox'|'polygon'|'polyline'|'circle'|null),
  polyPoints: [] as Point[],


  img: new Image()
}

const SVG_NS = 'http://www.w3.org/2000/svg'
let containerRO: ResizeObserver | null = null


/** Shapes dropdown control */
let isShapesOpen = false
let onDocClick: ((e: MouseEvent) => void) | null = null
let onEsc: ((e: KeyboardEvent) => void) | null = null

function openShapes() {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.add('show')
  isShapesOpen = true
}
function closeShapes() {
  if (!shapesDropdown.value) return
  shapesDropdown.value.classList.remove('show')
  isShapesOpen = false
}
function toggleShapes(e?: Event) {
  e?.preventDefault()
  e?.stopPropagation()
  isShapesOpen ? closeShapes() : openShapes()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    // cache-bust: uzak sunucu cache'inde takılmasın
    img.src = url.startsWith('http') ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;
  });
}

function enterPanMode() {
  // temp şekli varsa temizle
  const temp = annotationsSvg.value?.querySelector('#temp-shape')
  temp?.remove()

  // çizim durumlarını sıfırla
  state.isDrawing = false
  state.drawingShape = null
  state.polyPoints = []

  // aracı "select"e al (UI highlight düzelsin)
  const selectTool = toolGroup.value?.querySelector(
    '.annotation-tool[data-tool="select"]'
  ) as HTMLElement | null
  setActiveTool(selectTool)

  // cursor & tool-active class güncelle
  updateCursor()
}


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

// --- Theme helpers (persist + system follow) ---
const THEME_KEY = 'labelgun_theme' as const;
type ThemeMode = 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

function getStoredTheme(): ThemeMode | null {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'dark' || v === 'light' ? v : null;
}

function setStoredTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
}

function getSystemTheme(): ThemeMode {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function initTheme() {
  const stored = getStoredTheme();
  if (stored) {
    applyTheme(stored);              // kullanıcı tercihi varsa onu uygula
    return;
  }
  // kullanıcı tercihi yoksa sistemi taklit et
  applyTheme(getSystemTheme());

  // Kullanıcı tercihi oluşana kadar sistem değişikliğini izle
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (e: MediaQueryListEvent) => {
    if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
  };
  // modern tarayıcılar:
  if ('addEventListener' in mql) mql.addEventListener('change', onChange);
  // eski fallback (gerekirse):
  else (mql as any).addListener?.(onChange);
}

function clearSelection() {
  state.selectedAnnotationId = null
  renderAnnotations()
}

function deleteSelected() {
  if (state.selectedAnnotationId == null) return
  const i = state.annotations.findIndex(a => a.id === state.selectedAnnotationId)
  if (i !== -1) {
    state.annotations.splice(i, 1)
    recordHistory()
  }
  state.selectedAnnotationId = null
  renderAnnotations()
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
  
  // Eğer pan yapılıyorsa cursor grabbing olsun
  if (state.isPanning) {
    target.style.cursor = 'grabbing'
  }
  // Eğer polygon/polyline çizimi devam ediyorsa, cursor'ı crosshair yap
  else if (state.isDrawing && (state.drawingShape === 'polygon' || state.drawingShape === 'polyline')) {
    target.style.cursor = 'crosshair'
  } else {
    // Diğer durumlarda normal cursor
    target.style.cursor = isToolActive ? 'crosshair' : 'grab'
  }
}

/** Render */
function renderAnnotations() {
  if (!annotationsSvg.value || !annotationList.value) return
  annotationsSvg.value.innerHTML = ''
  annotationList.value.innerHTML = ''

  state.annotations.forEach((ann) => {
    if (ann.type === 'bbox') {
      const el = document.createElementNS(SVG_NS, 'rect')
      el.setAttribute('x', String(ann.x))
      el.setAttribute('y', String(ann.y))
      el.setAttribute('width', String(ann.width))
      el.setAttribute('height', String(ann.height))
      el.setAttribute('fill', 'rgba(17,115,212,0.4)')
      el.setAttribute('stroke', '#1173d4')
      el.setAttribute('stroke-width', '2')
      el.dataset.id = String(ann.id)
      el.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
      annotationsSvg.value!.appendChild(el)
    }
    else if (ann.type === 'polygon') {
      const el = document.createElementNS(SVG_NS, 'polygon')
      el.setAttribute('points', ann.points.map(p => `${p.x},${p.y}`).join(' '))
      el.setAttribute('fill', 'rgba(17,115,212,0.25)')
      el.setAttribute('stroke', '#1173d4')
      el.setAttribute('stroke-width', '2')
      el.dataset.id = String(ann.id)
      el.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
      annotationsSvg.value!.appendChild(el)
    }
    else if (ann.type === 'polyline') {
      const el = document.createElementNS(SVG_NS, 'polyline')
      el.setAttribute('points', ann.points.map(p => `${p.x},${p.y}`).join(' '))
      el.setAttribute('fill', 'none')
      el.setAttribute('stroke', '#1173d4')
      el.setAttribute('stroke-width', '2')
      el.dataset.id = String(ann.id)
      el.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
      annotationsSvg.value!.appendChild(el)
    }
    else if (ann.type === 'keypoint') {
      const el = document.createElementNS(SVG_NS, 'circle')
      el.setAttribute('cx', String(ann.x))
      el.setAttribute('cy', String(ann.y))
      el.setAttribute('r', '4')
      el.setAttribute('fill', '#1173d4')
      el.setAttribute('stroke', '#ffffff')
      el.setAttribute('stroke-width', '1.5')
      el.dataset.id = String(ann.id)
      el.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
      annotationsSvg.value!.appendChild(el)
    }
    else if (ann.type === 'circle') {
      const el = document.createElementNS(SVG_NS, 'circle')
      el.setAttribute('cx', String(ann.cx))
      el.setAttribute('cy', String(ann.cy))
      el.setAttribute('r', String(ann.r))
      el.setAttribute('fill', 'rgba(17,115,212,0.25)')
      el.setAttribute('stroke', '#1173d4')
      el.setAttribute('stroke-width', '2')
      el.dataset.id = String(ann.id)
      el.classList.add('annotation-shape')
      if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
      annotationsSvg.value!.appendChild(el)
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
  // Eski: 0.1, Yeni: 0.05 (%50 daha yavaş)
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  zoom(delta, e.clientX, e.clientY)
}

/** Mount */
onMounted(() => {
  
  initTheme(); // (YENİ) Tema: önce kalıcı tercih, yoksa sistem temasını uygula

  // Başlık
  if (taskTitle.value) taskTitle.value.textContent = 'Image Annotation - Task 1'

  // Shapes dropdown – click ile aç/kapa + dışarı tıklayınca/ESC’de kapat
  if (shapesToolBtn.value && shapesDropdown.value) {
    // butona tıklayınca toggle
    shapesToolBtn.value.addEventListener('click', toggleShapes)
    // içeride tıklamalar kapanmayı tetiklemesin
    // dropdown içinden bir shape seçildiğinde aracı aktif et + dropdown'u kapat
    shapesDropdown.value.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
      if (t) {
        e.preventDefault()            // <a href="#"> atlamasın
        setActiveTool(t)              // lastUsedTool='shapes' ve lastUsedShape=... ayarlanır
        closeShapes()                 // menüyü kapat
      }
      e.stopPropagation()             // dışarıya taşmasın
    })
    // dışarı tıklanınca kapa
    onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (!shapesDropdown.value!.contains(t) && !shapesToolBtn.value!.contains(t)) {
        closeShapes()
      }
    }
    document.addEventListener('click', onDocClick)
    // ESC ile kapa
    onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeShapes()
    }
    document.addEventListener('keydown', onEsc)
    deleteBtn.value?.addEventListener('click', deleteSelected)
  }

  // Tema – kullanıcı tıklarsa tercihi KALICI yap
  themeToggle.value?.addEventListener('click', () => {
    const current: ThemeMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setStoredTheme(next); // kalıcılaştır: yeniden açsa da bu kalsın
  });

  annotationList.value?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.annotation-item') as HTMLElement | null
    if (t) selectAnnotation(parseInt(t.dataset.id!))
    else clearSelection()
  })

  canvasEl.value?.addEventListener('click', () => {
    // çizim/pan yoksa ve select modundaysak boş tık seçim temizlesin
    if (!state.isDrawing && !state.isPanning && state.lastUsedTool === 'select') {
      clearSelection()
    }
  })

  // Araç tıklamaları
  toolGroup.value?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.annotation-tool') as HTMLElement | null
    if (!target) return
    if ((target as HTMLElement).tagName === 'A') (e as MouseEvent).preventDefault()
    setActiveTool(target)

   if ((target as HTMLElement).closest('#shapes-dropdown')) closeShapes()

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

  const submitBtn = document.querySelector('button:has(> .ui-svg.text-white)') as HTMLButtonElement | null
submitBtn?.addEventListener('click', () => {
  tasks.value[currentTaskIndex.value].status = 'completed'
  alert('Submitted ✔️')
})


  // Undo/Redo/Save
  undoBtn.value?.addEventListener('click', () => undo())
  redoBtn.value?.addEventListener('click', () => redo())
  saveBtn.value?.addEventListener('click', () => {
    // eslint-disable-next-line no-console
    console.log('--- ANNOTATION DATA (JSON) ---\n', JSON.stringify(state.annotations, null, 2))
    alert('Annotation JSON verisi konsola yazıldı (F12).')
  })
  
  canvasContainer.value?.addEventListener('wheel', onWheel, { passive: false })

  // Zoom toolbar
zoomInBtn.value?.addEventListener('click', () => {
  if (!canvasContainer.value) return
  const r = canvasContainer.value.getBoundingClientRect()
  // Eski: 0.2, Yeni: 0.1 (%50 daha yavaş)
  zoom(0.1, r.left + r.width / 2, r.top + r.height / 2)
})
zoomOutBtn.value?.addEventListener('click', () => {
  if (!canvasContainer.value) return
  const r = canvasContainer.value.getBoundingClientRect()
  // Eski: -0.2, Yeni: -0.1 (%50 daha yavaş)
  zoom(-0.1, r.left + r.width / 2, r.top + r.height / 2)
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
  const isToolActive = canvasContainer.value!.classList.contains('tool-active')
  
  // SAĞ CLICK (button 2) - HER ZAMAN PAN YAPSIN
  // Çizim modunda bile sağ click pan yapabilmeli
  if (e.button === 2) {
    e.preventDefault() // context menu'yu engelle
    state.isPanning = true
    state.startPanX = e.clientX - state.translateX
    state.startPanY = e.clientY - state.translateY
    canvasContainer.value!.classList.add('panning')
    canvasContainer.value!.style.cursor = 'grabbing'
    return
  }
  
  // SOL CLICK (button 0) işlemleri
  if (e.button !== 0) return

  // SAM şimdilik pasif
  if (state.lastUsedTool === 'sam') { return }

  if (isToolActive && state.lastUsedTool === 'shapes') {
    const rect = canvasContainer.value!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const imgX = (mouseX - state.translateX) / state.scale
    const imgY = (mouseY - state.translateY) / state.scale

    if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) return

    const shape = state.lastUsedShape

    if (shape === 'bbox') {
      state.isDrawing = true
      state.drawingShape = 'bbox'
      state.drawingStartX = imgX
      state.drawingStartY = imgY
      const temp = document.createElementNS(SVG_NS, 'rect')
      temp.setAttribute('id', 'temp-shape')
      temp.setAttribute('stroke', '#ffc107')
      temp.setAttribute('stroke-width', '2')
      temp.setAttribute('fill', 'none')
      annotationsSvg.value!.appendChild(temp)
    }
    else if (shape === 'circle') {
      state.isDrawing = true
      state.drawingShape = 'circle'
      state.drawingStartX = imgX
      state.drawingStartY = imgY
      const temp = document.createElementNS(SVG_NS, 'circle')
      temp.setAttribute('id', 'temp-shape')
      temp.setAttribute('stroke', '#ffc107')
      temp.setAttribute('stroke-width', '2')
      temp.setAttribute('fill', 'none')
      temp.setAttribute('cx', String(imgX))
      temp.setAttribute('cy', String(imgY))
      temp.setAttribute('r', '0')
      annotationsSvg.value!.appendChild(temp)
    }
    else if (shape === 'keypoint') {
      const kp: KeypointAnn = {
        id: Date.now(),
        type: 'keypoint',
        label: state.activeLabel,
        x: imgX,
        y: imgY
      }
      state.annotations.push(kp)
      recordHistory()
      renderAnnotations()
    }
    else if (shape === 'polygon' || shape === 'polyline') {
      if (!state.isDrawing || state.drawingShape !== shape) {
        // yeni çizim başlat
        state.isDrawing = true
        state.drawingShape = shape
        state.polyPoints = [{ x: imgX, y: imgY }]
        const temp = document.createElementNS(SVG_NS, 'polyline')
        temp.setAttribute('id', 'temp-shape')
        temp.setAttribute('stroke', '#ffc107')
        temp.setAttribute('stroke-width', '2')
        temp.setAttribute('fill', shape === 'polygon' ? 'rgba(255,193,7,0.08)' : 'none')
        temp.setAttribute('points', `${imgX},${imgY}`)
        annotationsSvg.value!.appendChild(temp)
        
        // Polygon/polyline çiziminde cursor'ı crosshair yap
        canvasContainer.value!.style.cursor = 'crosshair'
      } else {
        // noktaya devam
        state.polyPoints.push({ x: imgX, y: imgY })
        const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGPolylineElement | null
        if (temp) temp.setAttribute('points', state.polyPoints.map(p => `${p.x},${p.y}`).join(' '))
      }
    }
  } else {
    // Normal pan (sol click + etiketleme modu değil)
    state.isPanning = true
    state.startPanX = e.clientX - state.translateX
    state.startPanY = e.clientY - state.translateY
    canvasContainer.value!.classList.add('panning')
  }
})

// Context menu'yu engelle (sağ click menüsü)
canvasContainer.value?.addEventListener('contextmenu', (e: Event) => {
  const isToolActive = canvasContainer.value!.classList.contains('tool-active')
  if (isToolActive) {
    e.preventDefault()
  }
})

  // Polygon / Polyline bitir
const cancelPoly = () => {
  if (!state.isDrawing) return
  const temp = annotationsSvg.value!.querySelector('#temp-shape')
  temp?.remove()
  state.polyPoints = []
  state.drawingShape = null
  state.isDrawing = false
  // Cursor'ı normale döndür
  updateCursor()
}

const commitPoly = () => {
  if (!state.isDrawing || !(state.drawingShape === 'polygon' || state.drawingShape === 'polyline')) return
  const minPts = state.drawingShape === 'polygon' ? 3 : 2
  if (state.polyPoints.length >= minPts) {
    const ann = (state.drawingShape === 'polygon')
      ? ({ id: Date.now(), type: 'polygon', label: state.activeLabel, points: [...state.polyPoints] } as PolygonAnn)
      : ({ id: Date.now(), type: 'polyline', label: state.activeLabel, points: [...state.polyPoints] } as PolylineAnn)
    state.annotations.push(ann)
    recordHistory()
    renderAnnotations()
  }
  // temp'i temizle
  const temp = annotationsSvg.value!.querySelector('#temp-shape')
  temp?.remove()
  state.polyPoints = []
  state.drawingShape = null
  state.isDrawing = false
  // Cursor'ı normale döndür
  updateCursor()
}

 document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return }

  // Silme kısayolu
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAnnotationId != null) {
      e.preventDefault()
      deleteSelected()
      return
    }

  // Polygon/Polyline çizimini yönet
  if (state.isDrawing && (state.drawingShape === 'polygon' || state.drawingShape === 'polyline')) {
    if (e.key === 'Enter') { e.preventDefault(); commitPoly(); return }
    if (e.key === 'Escape') { e.preventDefault(); cancelPoly(); return }
  }

  // GENEL: ESC = Pan moduna dön
  if (e.key === 'Escape') {
    if (state.selectedAnnotationId != null) {
      e.preventDefault()
      clearSelection()
      return
    }
    const isToolActive =
      !!state.activeLabel && (state.lastUsedTool === 'shapes' || state.lastUsedTool === 'sam')

    // Seçili bir etiket/arac varken ESC'ye basıldıysa pan moduna dön
    if (isToolActive || state.lastUsedTool !== 'select' || state.isDrawing) {
      e.preventDefault()
      enterPanMode()
    }
  }
})


  // Dblclick ile bitir
  canvasContainer.value?.addEventListener('dblclick', () => {
    commitPoly()
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

  // ÖNCE PAN KONTROLÜ - pan öncelikli olsun
  if (state.isPanning) {
    state.translateX = e.clientX - state.startPanX
    state.translateY = e.clientY - state.startPanY
    updateTransform()
  } 
  // Sonra çizim kontrolü
  else if (state.isDrawing) {
    if (state.drawingShape === 'bbox') {
      const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGRectElement | null
      if (!temp) return
      const x = Math.min(imgX, state.drawingStartX)
      const y = Math.min(imgY, state.drawingStartY)
      const w = Math.abs(imgX - state.drawingStartX)
      const h = Math.abs(imgY - state.drawingStartY)
      temp.setAttribute('x', String(x))
      temp.setAttribute('y', String(y))
      temp.setAttribute('width', String(w))
      temp.setAttribute('height', String(h))
    }
    else if (state.drawingShape === 'circle') {
      const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGCircleElement | null
      if (!temp) return
      const dx = imgX - state.drawingStartX
      const dy = imgY - state.drawingStartY
      const r = Math.sqrt(dx*dx + dy*dy)
      temp.setAttribute('r', String(r))
    }
    else if (state.drawingShape === 'polygon' || state.drawingShape === 'polyline') {
      const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGPolylineElement | null
      if (!temp) return
      const pts = [...state.polyPoints, { x: imgX, y: imgY }]
      temp.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '))
    }
  }

  // Cursor güncelleme
  updateCursor()
})

const finishPointer = () => {
  if (state.isDrawing && !state.isPanning) {
    // Sadece çizim yapılıyorsa ve pan yapılmıyorsa çizim işlemlerini bitir
    if (state.drawingShape === 'bbox') {
      const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGRectElement | null
      if (temp) {
        const w = parseFloat(temp.getAttribute('width') || '0')
        const h = parseFloat(temp.getAttribute('height') || '0')
        if (w > 5 && h > 5) {
          const newAnn: BBox = {
            id: Date.now(),
            type: 'bbox',
            label: state.activeLabel,
            x: parseFloat(temp.getAttribute('x') || '0'),
            y: parseFloat(temp.getAttribute('y') || '0'),
            width: w,
            height: h
          }
          state.annotations.push(newAnn)
          recordHistory()
          renderAnnotations()
        }
        temp.remove()
      }
      state.drawingShape = null
      state.isDrawing = false
    }
    else if (state.drawingShape === 'circle') {
      const temp = annotationsSvg.value!.querySelector('#temp-shape') as SVGCircleElement | null
      if (temp) {
        const r = parseFloat(temp.getAttribute('r') || '0')
        if (r > 3) {
          const newAnn: CircleAnn = {
            id: Date.now(),
            type: 'circle',
            label: state.activeLabel,
            cx: parseFloat(temp.getAttribute('cx') || '0'),
            cy: parseFloat(temp.getAttribute('cy') || '0'),
            r
          }
          state.annotations.push(newAnn)
          recordHistory()
          renderAnnotations()
        }
        temp.remove()
      }
      state.drawingShape = null
      state.isDrawing = false
    }
    // polygon/polyline çizimi devam ediyorsa, cursor'ı crosshair olarak koru
    else if (state.drawingShape === 'polygon' || state.drawingShape === 'polyline') {
      // Çizim devam ediyor, cursor crosshair kalacak
      canvasContainer.value!.style.cursor = 'crosshair'
    }
  }
  
  state.isPanning = false
  canvasContainer.value?.classList.remove('panning')

  // Cursor'ı güncelle
  updateCursor()
}

  canvasContainer.value?.addEventListener('mouseup', finishPointer)
  canvasContainer.value?.addEventListener('mouseleave', finishPointer)

  prevBtn.value?.addEventListener('click', goPrevTask)
  nextBtn.value?.addEventListener('click', goNextTask)

  loadTaskByIndex(0)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitToScreen)
  canvasContainer.value?.removeEventListener('wheel', onWheel as any)
  containerRO?.disconnect()
  shapesToolBtn.value?.removeEventListener('click', toggleShapes)
  if (onDocClick) document.removeEventListener('click', onDocClick)
  if (onEsc) document.removeEventListener('keydown', onEsc)
})



async function loadTaskByIndex(i: number) {
  if (tasks.value.length === 0) return;
  const clamped = Math.max(0, Math.min(tasks.value.length - 1, i));
  currentTaskIndex.value = clamped;
  const t = tasks.value[clamped];

  if (taskTitle.value) {
    taskTitle.value.textContent = `Image Annotation - ${t.title}`;
  }

  // görev değişince state sıfırla
  state.annotations = [];
  state.history = [];
  state.historyIndex = -1;

  try {
    // ⬇️ Görseli preload et, sonra state.img olarak ata
    const img = await loadImage(t.image);
    state.img = img;

    // çiz ve sığdır
    fitToScreen();

    // varsayılan label + tool
    const firstLabel = labelList.value?.querySelector('.label-item') as HTMLElement | null;
    setActiveLabel(firstLabel);
    const selectTool = toolGroup.value?.querySelector(
      '.annotation-tool[data-tool="select"]'
    ) as HTMLElement | null;
    setActiveTool(selectTool);
    recordHistory();
  } catch (err) {
    console.error('Image load failed:', err);
    // istersek burada kullanıcıya mesaj gösterebiliriz
  }
}


function goPrevTask() {
  loadTaskByIndex((currentTaskIndex.value - 1 + tasks.value.length) % tasks.value.length)
}
function goNextTask() {
  loadTaskByIndex((currentTaskIndex.value + 1) % tasks.value.length)
}

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
        <li v-for="(t, idx) in tasks" :key="t.id">
          <a
            href="#"
            @click.prevent="loadTaskByIndex(idx)"
            :class="[
              'block rounded-lg overflow-hidden border-2',
              idx === currentTaskIndex ? 'border-primary dark:border-primary/80 bg-primary/5' : 'border-transparent hover:border-primary/50'
            ]"
          >
            <div class="h-24 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <span class="text-gray-400 dark:text-gray-500">image</span>
            </div>
            <div class="p-3">
              <div class="flex justify-between items-start">
                <span class="text-sm font-medium">{{ t.title }}</span>

                <span
                  v-if="t.status === 'in_progress'"
                  class="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                >In Progress</span>

                <span
                  v-else-if="t.status === 'completed'"
                  class="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                >Completed</span>

                <span
                  v-else
                  class="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700/60 dark:text-gray-300"
                >Queued</span>
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
          <FilterIcon class="ui-svg h-5 w-5 text-primary dark:text-primary/80" />
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
            <button ref="prevBtn" class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200">
              <ArrowBackIcon class="ui-svg h-5 w-5 text-gray-700 dark:text-gray-200" />
            </button>
            <button ref="nextBtn" class="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200">
              <ArrowFwdIcon class="ui-svg h-5 w-5 text-gray-700 dark:text-gray-200" />
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            ref="themeToggle"
            class="relative inline-flex items-center h-8 w-14 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 ml-2"
          >
            <span
              class="absolute left-1.5 top-1.5 h-5 w-5 bg-white dark:bg-gray-800 rounded-full shadow-md transform transition-transform duration-300 dark:translate-x-6 flex items-center justify-center"
            >
              <SunIcon  class="ui-svg h-4 w-4 text-gray-600  opacity-100 dark:opacity-0" />
             <MoonIcon class="ui-svg h-4 w-4 text-primary absolute opacity-0 dark:opacity-100" />
            </span>
          </button>

          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <TimerIcon class="ui-svg h-5 w-5" />
            <div class="font-mono bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-lg font-bold">
              01:23:45
            </div>
          </div>

          <button
            ref="saveBtn"
            class="flex items-center gap-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-semibold hover:bg-gray-50"
          >
            <SaveIcon class="ui-svg h-5 w-5 text-green-500" />
            <span>Save Draft</span>
          </button>
          <button
            class="flex items-center gap-2 rounded bg-primary py-2 px-4 text-sm font-semibold text-white hover:opacity-90">
            <ApproveIcon class="ui-svg h-5 w-5 text-white" />
            <span>Submit Work</span>
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
                <SelectIcon class="ui-svg h-6 w-6 text-gray-600 dark:text-gray-300" />
              </button>
              
              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

              <button
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 annotation-tool"
                data-tool="sam"
                title="SAM"
              >
                <SamIcon class="ui-svg h-6 w-6 text-gray-600 dark:text-gray-300" />
              </button>

              <div class="relative">
                <button
                  ref="shapesToolBtn"
                  class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
                  id="shapes-tool-btn"
                  title="Annotation Shapes"
                >
                   <ShapesIcon class="ui-svg h-6 w-6 text-gray-600 dark:text-gray-300" />
                   <ChevronDownIcon class="ui-svg h-4 w-4 text-gray-600 dark:text-gray-300" />
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
                    <CropSquareIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" />
                    <span>Bounding Box</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="polygon"
                  >
                    <PentagonIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" /><span>Polygon</span>
                  </a>
                   <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="polyline"
                  >
                    <PolyLineIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" /><span>Polyline</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="keypoint"
                  >
                    <KeypointIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" /><span>Keypoint</span>
                  </a>
                  <a
                    href="#"
                    class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 annotation-tool"
                    data-tool="circle"
                  >
                    <CircleIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" /><span>Circle</span>
                  </a>


                  
                </div>
              </div>

              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
              <button
                ref="undoBtn"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Undo (Ctrl+Z)" >
                <UndoIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>

              <button
                ref="redoBtn"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Redo (Ctrl+Y)">
                <RedoIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
              
              <button
                ref="deleteBtn"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                title="Delete (Del)"
              >
                <DeleteIcon class="ui-svg h-5 w-5 text-gray-600 dark:text-gray-300" />
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
              <SearchIcon class="ui-svg h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
/* --- Icon system: tema rengiyle boyansın --- */
.ui-svg {
  display: inline-block;
  width: 1.25rem;   /* h-5 */
  height: 1.25rem;  /* w-5 */
  vertical-align: middle;
}

/* Bileşen kökü genelde <svg> olduğu için boyut garanti */
.ui-svg > svg {
  width: 100%;
  height: 100%;
}

/* Asıl önemli kısım: tüm şekilleri currentColor ile boya */
.ui-svg :where(path, circle, rect, polygon, polyline, line) {
  fill: currentColor !important;
  stroke: currentColor !important;
}

</style>
