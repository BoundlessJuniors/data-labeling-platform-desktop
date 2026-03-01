<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue'
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
import ArrowDropDownIcon from '@renderer/assets/icons/custom/arrow_drop_down.svg?component'
import PauseIcon from '@renderer/assets/icons/custom/pause.svg?component'
import PlayIcon from '@renderer/assets/icons/custom/play_arrow.svg?component'
import CloseIcon from '@renderer/assets/icons/custom/close.svg?component'

// Tipler
import type { Annotation, Task } from '@renderer/types/annotation'

// Util
import { loadImage } from '@renderer/utils/image'
import { qsa } from '@renderer/utils/dom'

// Composable’lar
import { useLabelerState } from '@renderer/composables/useLabelerState'
import { useHistory } from '@renderer/composables/useHistory'
import { useCanvasTransform } from '@renderer/composables/useCanvasTransform'
import { useTasks } from '@renderer/composables/useTasks'
import { useAnnotationsRenderer } from '@renderer/composables/useAnnotationsRenderer'
import { useKeyboardShortcuts } from '@renderer/composables/useKeyboardShortcuts'
import { useLabelerActions } from '@renderer/composables/useLabelerActions'
import KonvaCanvas from '@renderer/components/KonvaCanvas.vue'

/* =============================
   Refs (DOM erişimi)
   ============================= */
const canvasContainer = ref<HTMLDivElement | null>(null)
// Eski canvas/SVG artık kullanılmıyor, ancak bazı composable'lar tip için referansa ihtiyaç duyuyor
const canvasEl = ref<HTMLCanvasElement | null>(null)
const annotationsSvg = ref<SVGSVGElement | null>(null)

const shapesToolBtn = ref<HTMLButtonElement | null>(null)
const shapesDropdown = ref<HTMLDivElement | null>(null)

// Filter butonu/düğmesi henüz script tarafında kullanılmıyor; sadece template için mevcut.

// Crosshair ve koordinat overlay'leri şimdilik sadece template tarafında, script içinde
// kullanılmıyor; bu yüzden burada ref tanımlamıyoruz.

const zoomInBtn = ref<HTMLButtonElement | null>(null)
const zoomOutBtn = ref<HTMLButtonElement | null>(null)
const fitScreenBtn = ref<HTMLButtonElement | null>(null)
const resetViewBtn = ref<HTMLButtonElement | null>(null)

const crosshairH = ref<HTMLDivElement | null>(null)
const crosshairV = ref<HTMLDivElement | null>(null)
const coords = ref<HTMLDivElement | null>(null)

const toolGroup = ref<HTMLDivElement | null>(null)
const labelList = ref<HTMLDivElement | null>(null)
const annotationList = ref<HTMLDivElement | null>(null)

const undoBtn = ref<HTMLButtonElement | null>(null)
const redoBtn = ref<HTMLButtonElement | null>(null)
const saveBtn = ref<HTMLButtonElement | null>(null)
const themeToggle = ref<HTMLButtonElement | null>(null)
const submitBtn = ref<HTMLButtonElement | null>(null)

const taskTitle = ref<HTMLHeadingElement | null>(null)

const prevBtn = ref<HTMLButtonElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)

const deleteBtn = ref<HTMLButtonElement | null>(null)

const tasksNav = ref<HTMLElement | null>(null)
const autoSaveOverlay = ref<HTMLDivElement | null>(null)

// SAM durumu (model indirildi / hazır mı?)
// SAM durumu (model indirildi / hazır mı?)
const samReady = ref(false)
const samDownloading = ref(false)
const samPaused = ref(false) // Track if download is paused
const samDownloadProgress = ref(0)
const samDownloadStage = ref<'idle' | 'encoder' | 'decoder' | 'done'>('idle')
const samDownloadingModelId = ref<string | null>(null) // Track which model is downloading

const showSamSettings = ref(false)
const samModels = ref<Record<string, any>>({})
const samStatus = ref<any>({
  status: 'idle',
  currentModelId: 'vit_b',
  modelsStatus: {},
  error: null
})
const downloadConfirmation = ref<{
  show: boolean
  modelId: string
  modelName: string
  size: string
}>({
  show: false,
  modelId: '',
  modelName: '',
  size: ''
})

// Polygon düzenleme modu (SAM veya normal polygon)
const editingAnnotationId = ref<number | null>(null)
const editingOriginalState = ref<any>(null)
// Edit modu için yerel undo/redo geçmişi
const editHistory = ref<any[]>([])
const editHistoryIndex = ref(-1)

// Edit ipucu (artık genel)
const showEditHint = ref(false)
let editHintTimer: number | null = null
const editHintDismissed = ref(false)

// Label seçilmeden shapes aracı kullanıldığında gösterilecek küçük uyarı
const showLabelHint = ref(false)
let labelHintTimer: number | null = null

// Global ve task bazlı zamanlayıcılar (saniye cinsinden)
const globalSeconds = ref(0)
const taskSecondsById = ref<Record<string, number>>({})

// Çizgi kalınlığı ayarı (1-10 arası)
const savedStroke = localStorage.getItem('labelgun-stroke-width')
const strokeWidth = ref(savedStroke ? parseFloat(savedStroke) : 2)

watch(strokeWidth, (val) => {
  localStorage.setItem('labelgun-stroke-width', String(val))
})

/* =============================
  İç durum
  ============================= */

// Props & emit (dataset kimliği ve geri dönüş olayı)
const props = defineProps<{ datasetId: string }>()
const emit = defineEmits<{ (e: 'back-to-datasets'): void }>()

// Başlangıçta boş; dataset seçilince DB'den doldurulacak
const initialTasks: Task[] = []
// Görevler (task listesi) ve aktif indeks
const { tasks, currentTaskIndex, initFromDb } = useTasks(initialTasks)

// Reactif state
const { state } = useLabelerState()

const konvaCanvasRef = ref<InstanceType<typeof KonvaCanvas> | null>(null)

// Uygulama açıkken, her task için geçici (kaydedilmemiş) annotation'ları hafızada tutmak için
// basit bir cache. Key: media_id (şu an Task.title), Value: Annotation[] snapshot.
const localAnnotationsByTask = new Map<string, Annotation[]>()

// Undo/Redo vb. geçmiş yönetimi
const { recordHistory, undo, redo } = useHistory(state)

// Canvas transform & zoom yönetimi (eski canvas için). Şu an KonvaCanvas zoom/pan'i
// yönettiği için buradan sadece fitToScreen kullanılıyor.
const { fitToScreen } = useCanvasTransform(state, canvasEl, annotationsSvg)

const {
  renderAnnotations,
  exportAnnotationsToImageSpace,
  clearSelection,
  deleteSelected,
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

const undoAndRender = (): void => {
  undo()
  renderAnnotations()
}

const redoAndRender = (): void => {
  redo()
  renderAnnotations()
}

function getTaskMediaId(t: Task): string {
  return t.mediaId ?? t.title ?? String(t.id)
}

function getTaskSeconds(t: Task): number {
  const id = getTaskMediaId(t)
  return taskSecondsById.value[id] ?? 0
}

function getCurrentTaskSeconds(): number {
  const t = tasks.value[currentTaskIndex.value]
  return t ? getTaskSeconds(t) : 0
}

function formatTime(total: number): string {
  const sec = Math.max(0, Math.floor(total))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

const { onUndo, onRedo, onDelete, onSaveDraft, onSubmit } = useLabelerActions({
  tasks,
  currentTaskIndex,
  canvasEl,
  undo: undoAndRender,
  redo: redoAndRender,
  deleteSelected,
  exportAnnotationsToImageSpace,
  fitToScreen
})

const autoSaveProgress = ref(0)
let autoSaveTimer: number | null = null
let timerInterval: number | null = null
let onThemeToggleClick: (() => void) | null = null
let samProgressUnsub: (() => void) | null = null

function playAutoSaveOverlayAnimation(): void {
  const el = autoSaveOverlay.value
  if (!el) return

  el.classList.remove('show')
  // Force reflow so the animation can restart even if class was already present
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void el.offsetWidth
  el.classList.add('show')
}

async function restartCurrentTask(): Promise<void> {
  const current = tasks.value[currentTaskIndex.value]
  if (!current) return

  // 1) Görünümü ekrana sığdır
  konvaCanvasRef.value?.fitToContainer()

  // 2) Mevcut task için tüm etiketleri temizle (hafıza + UI)
  state.annotations = []
  state.selectedAnnotationId = null
  state.history = []
  state.historyIndex = -1
  clearSelection()
  renderAnnotations()
  updateDeleteButton()

  const mediaId = getTaskMediaId(current)
  localAnnotationsByTask.delete(mediaId)

  // 3) DB'deki kaydı da boş bir liste ile overwrite et (tam temizlik)
  try {
    const emptyJson = JSON.stringify([], null, 2)
    await window.api.db.annotations.saveExport({ media_id: mediaId, data_json: emptyJson })
  } catch (e) {
    console.error('[Restart] failed to clear annotations in DB:', e)
  }
}

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
  // KonvaCanvas üzerinde devam eden bir çizim varsa iptal et
  konvaCanvasRef.value?.cancelCurrentShape?.()

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
  if (!el) {
    updateCursor()
    return
  }

  const tool = el.dataset.tool

  // Shapes dropdown içindeki gerçek şekil seçimi
  if (el.closest('#shapes-dropdown')) {
    // Henüz label seçili değilse: shapes moduna geçme, sadece küçük bir uyarı göster
    if (!state.activeLabel) {
      showLabelHint.value = true
      if (labelHintTimer != null) window.clearTimeout(labelHintTimer)
      labelHintTimer = window.setTimeout(() => {
        showLabelHint.value = false
        labelHintTimer = null
      }, 3000)
      updateCursor()
      return
    }

    // Label seçiliyse shapes aracı ve ilgili şekli gerçekten aktif et
    shapesToolBtn.value?.classList.add('active')
    el.classList.add('active')

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
    updateCursor()
    return
  }

  // Dropdown dışında: select / sam / ana shapes butonu
  if (tool === 'shapes' && !state.activeLabel) {
    // Label yokken shapes moduna hiç geçme, uyarı göster
    showLabelHint.value = true
    if (labelHintTimer != null) window.clearTimeout(labelHintTimer)
    labelHintTimer = window.setTimeout(() => {
      showLabelHint.value = false
      labelHintTimer = null
    }, 3000)
    updateCursor()
    return
  }

  // Buraya gelmişsek, ya select/sam seçiliyor ya da label zaten seçiliyken ana shapes butonu basıldı
  el.classList.add('active')

  if (tool === 'select' || tool === 'sam' || tool === 'shapes') {
    state.lastUsedTool = tool
  } else {
    state.lastUsedTool = 'select'
  }

  updateCursor()
}

function toLocalUrlMaybe(p: string): string {
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('local://')) return p

  const isWinAbs = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\')
  const isPosixAbs = p.startsWith('/')

  if (isWinAbs) {
    const normalized = p.replace(/\\/g, '/')
    // local:///C:/Users/... (3 slash) + boşlukları güvenli taşı
    return `local:///${encodeURI(normalized)}`
  }

  if (isPosixAbs) {
    // local:///home/... formatını garanti et
    return `local:///${encodeURI(p.replace(/^\/+/, ''))}`
  }

  return p
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

function handlePointerMove(payload: {
  screenX: number
  screenY: number
  imgX: number | null
  imgY: number | null
}): void {
  const container = canvasContainer.value
  if (!container) return

  container.classList.add('has-pointer')

  if (crosshairH.value) crosshairH.value.style.top = `${payload.screenY}px`
  if (crosshairV.value) crosshairV.value.style.left = `${payload.screenX}px`

  if (coords.value) {
    if (payload.imgX != null && payload.imgY != null) {
      const x = Math.round(payload.imgX)
      const y = Math.round(payload.imgY)
      coords.value.textContent = `X: ${x}, Y: ${y}`
    } else {
      coords.value.textContent = 'X: -, Y: -'
    }
  }
}

function handlePointerLeave(): void {
  const container = canvasContainer.value
  if (container) container.classList.remove('has-pointer')

  if (coords.value) {
    coords.value.textContent = 'X: -, Y: -'
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
    // FIX: Eğer zaten düzenleme modundaysak ve aynı etikete tıklandıysa (long-press sonrası click),
    // araç değişimini (pan moda geçişi) engellemek için işlem yapma.
    if (editingAnnotationId.value === id) {
      return
    }
    selectAnnotation(id)
  }
}

async function handleSamClickFromKonva(payload: { imgX: number; imgY: number }): Promise<void> {
  if (!tasks.value.length) return

  // SAM aracı seçiliyken, her tıklamada önceden hazır olduğunu varsayıyoruz.
  if (!samReady.value) {
    // Modeli yüklemeyi dene (sessizce veya loading göstererek)
    try {
      await window.api.sam.ensureReady()
      // samReady should be updated by polling or state sync?
      // We rely on status polling or the resolve of ensureReady updating state?
      // Let's manually double check or re-fetch status
      const s = await window.api.sam.status()
      samStatus.value = s
      samReady.value = s.status === 'ready'
      if (!samReady.value) return
    } catch (e) {
      console.error('Auto-ensure ready failed', e)
      return
    }
  }

  const current = tasks.value[currentTaskIndex.value]
  if (!current) return

  // Eğer tıklanan nokta hali hazırda bir polygon etiketinin içindeyse
  // yeni SAM isteği üretme (mevcut maske üzerinde sadece düzenleme beklenir).
  const px = payload.imgX
  const py = payload.imgY
  const isInsideExistingPolygon = state.annotations.some((a) => {
    if (a.type !== 'polygon' || !Array.isArray(a.points) || a.points.length < 3) return false
    let inside = false
    for (let i = 0, j = a.points.length - 1; i < a.points.length; j = i++) {
      const xi = a.points[i].x
      const yi = a.points[i].y
      const xj = a.points[j].x
      const yj = a.points[j].y

      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi
      if (intersect) inside = !inside
    }
    return inside
  })

  if (isInsideExistingPolygon) {
    return
  }

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
      label: state.activeLabel,
      points: res.mask.points.map((p) => ({ x: p.x, y: p.y }))
    } as Annotation

    state.annotations.push(polygonAnn)
    state.selectedAnnotationId = polygonAnn.id
    recordHistory()
    renderAnnotations()
    updateDeleteButton()

    // Kullanıcıya maskeyi düzenleyebileceğini göster
    if (!editHintDismissed.value) {
      showEditHint.value = true
      if (editHintTimer != null) window.clearTimeout(editHintTimer)
      editHintTimer = window.setTimeout(() => {
        showEditHint.value = false
        editHintTimer = null
      }, 2600)
    }
  } catch (e) {
    console.error('[SAM] run failed:', e)
    alert('SAM ile maske oluşturulurken bir hata oluştu. Ayrıntılar için konsolu kontrol edin.')
  }
}

async function handleSamDrawFromKonva(payload: {
  points: { x: number; y: number }[]
  labels: number[]
}): Promise<void> {
  if (!tasks.value.length) return

  // Ensure tool is ready
  if (!samReady.value) {
    try {
      await window.api.sam.ensureReady()
      const s = await window.api.sam.status()
      samReady.value = s.status === 'ready'
      if (!samReady.value) return
    } catch (e) {
      console.error('Auto-ensure ready failed', e)
      return
    }
  }

  const current = tasks.value[currentTaskIndex.value]
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
      label: state.activeLabel,
      points: res.mask.points.map((p) => ({ x: p.x, y: p.y }))
    } as Annotation

    state.annotations.push(polygonAnn)
    state.selectedAnnotationId = polygonAnn.id
    recordHistory()
    renderAnnotations()
    updateDeleteButton()

    if (!editHintDismissed.value) {
      showEditHint.value = true
      if (editHintTimer != null) window.clearTimeout(editHintTimer)
      editHintTimer = window.setTimeout(() => {
        showEditHint.value = false
        editHintTimer = null
      }, 2600)
    }
  } catch (e) {
    console.error('[SAM] run failed:', e)
  }
}

function handleEditRequestFromKonva(id: number): void {
  const ann = state.annotations.find((a) => a.id === id)
  if (!ann) return

  editingAnnotationId.value = id

  // Tipe göre orijinal hali sakla
  if (ann.type === 'polygon' || ann.type === 'polyline') {
    editingOriginalState.value = { points: ann.points.map((p) => ({ ...p })) }
    editHistory.value = [{ points: ann.points.map((p) => ({ ...p })) }]
  } else if (ann.type === 'bbox') {
    editingOriginalState.value = { x: ann.x, y: ann.y, width: ann.width, height: ann.height }
    editHistory.value = [{ x: ann.x, y: ann.y, width: ann.width, height: ann.height }]
  } else if (ann.type === 'circle') {
    editingOriginalState.value = { cx: ann.cx, cy: ann.cy, r: ann.r }
    editHistory.value = [{ cx: ann.cx, cy: ann.cy, r: ann.r }]
  } else if (ann.type === 'keypoint') {
    editingOriginalState.value = { x: ann.x, y: ann.y, r: ann.r || 5 }
    editHistory.value = [{ x: ann.x, y: ann.y, r: ann.r || 5 }]
  }

  editHistoryIndex.value = 0
  state.selectedAnnotationId = id
  renderAnnotations()
  updateDeleteButton()
}

function handleUpdateAnnotationStateFromKonva(payload: { id: number; patch: any }): void {
  const idx = state.annotations.findIndex((a) => a.id === payload.id)
  if (idx === -1) return

  const updated = {
    ...state.annotations[idx],
    ...payload.patch
  }

  const next = state.annotations.slice()
  next[idx] = updated as Annotation
  state.annotations = next

  // Eğer SAM edit modundaysak, her geometri güncellemesini yerel geçmişe ekle
  // Ancak "sürükleme sırasında" yüzlerce kez tetiklenmemesi için
  // KonvaCanvas tarafında "annotation-transform-end" kullanacağız.
  // FAKAT burada basitlik adına ve "Ctrl+Z"nin anlık çalışması için:
  // Mouse sürüklerken sürekli update gelir. Bunu history'ye yazmak yerine
  // sadece interaction bittiğinde yazmak daha doğru.
  // O yüzden buraya eklemiyoruz. KonvaCanvas'tan gelen özel bir event bekleyeceğiz.
  // YA DA: Kullanıcı isteği "noktaları düzenlerken" yani drag+drop sonrasında.
  // KonvaCanvas güncellemesi drag sırasında sürekli akar. Biz bunu anlık state'e yansıttık.
  // History kaydını ise handleAnnotationTransformEndFromKonva'da yapacağız.
}

function handleAnnotationTransformEndFromKonva(): void {
  // Eğer edit modundaysak, bu bitişi yerel history'ye ekle
  if (editingAnnotationId.value != null) {
    const ann = state.annotations.find((a) => a.id === editingAnnotationId.value)
    if (ann) {
      let snapshot: any = {}
      if (ann.type === 'polygon' || ann.type === 'polyline') {
        snapshot = { points: ann.points.map((p) => ({ ...p })) }
      } else if (ann.type === 'bbox') {
        snapshot = { x: ann.x, y: ann.y, width: ann.width, height: ann.height }
      } else if (ann.type === 'circle') {
        snapshot = { cx: ann.cx, cy: ann.cy, r: ann.r }
      } else if (ann.type === 'keypoint') {
        snapshot = { x: ann.x, y: ann.y, r: ann.r }
      }

      editHistory.value = editHistory.value.slice(0, editHistoryIndex.value + 1)
      editHistory.value.push(snapshot)
      editHistoryIndex.value++
    }
    return
  }

  // Normal modda (BBox resize vb.) global history kaydı al
  recordHistory()
}

// Local Undo
function undoLocalEdit(): void {
  if (editHistoryIndex.value > 0) {
    editHistoryIndex.value--
    const stateSnapshot = editHistory.value[editHistoryIndex.value]
    applyLocalState(stateSnapshot)
  }
}

// Local Redo
function redoLocalEdit(): void {
  if (editHistoryIndex.value < editHistory.value.length - 1) {
    editHistoryIndex.value++
    const stateSnapshot = editHistory.value[editHistoryIndex.value]
    applyLocalState(stateSnapshot)
  }
}

function applyLocalState(snapshot: any): void {
  if (editingAnnotationId.value == null) return
  const idx = state.annotations.findIndex((a) => a.id === editingAnnotationId.value)
  if (idx === -1) return

  const updated = { ...state.annotations[idx], ...snapshot }
  const next = state.annotations.slice()
  next[idx] = updated as Annotation
  state.annotations = next
}

function dismissEditHint(): void {
  editHintDismissed.value = true
  showEditHint.value = false
  if (editHintTimer != null) {
    window.clearTimeout(editHintTimer)
    editHintTimer = null
  }
  localStorage.setItem('editHintDismissed', '1')
}

/* =============================
   Polygon / Polyline Tamamlama
   ============================= */
const cancelPoly = (): void => {
  // Önce düzenleme modundan çıkmak gerekiyorsa onu ele al
  if (editingAnnotationId.value != null) {
    if (editingOriginalState.value) {
      applyLocalState(editingOriginalState.value)
    }
    editingAnnotationId.value = null
    editingOriginalState.value = null
    editHistory.value = []
    return
  }

  // Eğer Konva tarafında devam eden bir polygon/polyline çizimi varsa
  // önce sadece o çizimi iptal et (shapes modunda kal).
  const konva = konvaCanvasRef.value as {
    hasActiveDrawing?: () => boolean
    cancelCurrentShape?: () => void
  } | null

  if (konva?.hasActiveDrawing?.()) {
    konva.cancelCurrentShape?.()

    // Global state'i de temizle (cursor vs. için)
    state.polyPoints = []
    state.drawingShape = null
    state.isDrawing = false
    updateCursor()
    return
  }

  // Herhangi bir aktif çizim yoksa normal pan/select moduna geç
  enterPanMode()
}

const commitPoly = (): void => {
  // Düzenleme modunda Enter: son halini kabul et
  if (editingAnnotationId.value != null) {
    editingAnnotationId.value = null
    editingOriginalState.value = null
    editHistory.value = []
    recordHistory()
    return
  }

  // Enter ile mevcut Konva çizimini (bbox/polygon/polyline) tamamla
  konvaCanvasRef.value?.finishCurrentShape?.()

  // Eski state bayraklarını resetle
  state.polyPoints = []
  state.drawingShape = null
  state.isDrawing = false
  updateCursor()
}

const saveDraftAndReset = (): void => {
  onSaveDraft()
  // Manuel kayıttan sonra otomatik kaydetme sayacını sıfırla ve süreleri kaydet
  autoSaveProgress.value = 0
  void flushTimeToDb()
  playAutoSaveOverlayAnimation()
}

async function flushTimeToDb(): Promise<void> {
  if (!tasks.value.length) return

  try {
    for (const t of tasks.value) {
      const mediaId = getTaskMediaId(t)
      const secs = taskSecondsById.value[mediaId] ?? 0
      await window.api.db.media.setTime({ media_id: mediaId, seconds: secs })
    }
  } catch (e) {
    console.error('[DB] flush time failed:', e)
  }
}

const { attachKeyboardShortcuts, detachKeyboardShortcuts } = useKeyboardShortcuts({
  state,
  undo: undoAndRender,
  redo: redoAndRender,
  deleteSelected,
  commitPoly,
  cancelPoly,
  clearSelection,
  enterPanMode,
  saveDraft: saveDraftAndReset,
  goPrevTask,
  goNextTask,
  hasLocalEditing: () => editingAnnotationId.value != null,
  undoLocalEdit,
  redoLocalEdit
})

// Eski canvas etkileşimleri (useCanvasInteractions) Konva geçişiyle birlikte devre dışı bırakıldı.

/* =============================
   Lifecycle: onMounted / onBeforeUnmount
   ============================= */
onMounted(async (): Promise<void> => {
  // Seçilen dataset'ten görevleri yükle
  try {
    console.log('[UI] 🔄 Calling initFromDb...')
    console.log('[UI] Dataset ID:', props.datasetId)

    await initFromDb(props.datasetId)

    console.log(`[UI] ✅ initFromDb done!`)
    console.log(`[UI] Tasks count: ${tasks.value.length}`)
    console.log(`[UI] Current task index: ${currentTaskIndex.value}`)

    if (tasks.value.length === 0) {
      console.warn('[UI] ⚠️ NO TASKS FOUND! Dataset might be empty.')
      console.warn('[UI] ⚠️ Prefetch will NOT initialize (no tasks to cache)')
    }

    // ⚡ PREFETCH: Start AFTER tasks are loaded
    console.log(`[UI] Tasks loaded: ${tasks.value.length} tasks`)

    // WAIT for SAM to be ready before starting prefetch
    console.log('[UI] Waiting for SAM session to be ready...')
    await window.electron.ipcRenderer.invoke('sam:ensureReady')
    console.log('[UI] SAM session ready!')

    // Start background processing
    await window.electron.ipcRenderer.invoke('sam:startPrefetch')
    console.log('[UI] Prefetch background processing started')

    // Initialize plan for first task
    if (tasks.value.length > 0 && currentTaskIndex.value >= 0) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
      console.log(
        `[${timestamp}] [UI] ✅ Initializing prefetch plan for task ${currentTaskIndex.value}`
      )
      // Send simplified task data (only serializable properties)
      const simplifiedTasks = tasks.value.map((task) => ({ image: task.image }))
      await window.electron.ipcRenderer.invoke(
        'sam:updatePrefetchPlan',
        currentTaskIndex.value,
        tasks.value.length,
        simplifiedTasks
      )
    } else {
      console.warn('[UI] ⚠️ Skipping prefetch initialization:')
      console.warn(`[UI]    - Tasks count: ${tasks.value.length}`)
      console.warn(`[UI]    - Current index: ${currentTaskIndex.value}`)
    }
  } catch (e) {
    console.error('[UI] ❌ initFromDb failed:', e)
  }

  // === THEME INIT (light/dark) ===
  const saved = localStorage.getItem('theme')
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const shouldDark = saved ? saved === 'dark' : prefersDark
  document.documentElement.classList.toggle('dark', shouldDark)

  // SAM edit ipucu daha önce kapatıldıysa tekrar gösterme
  const dismissed = localStorage.getItem('editHintDismissed')
  if (dismissed === '1') {
    editHintDismissed.value = true
  }

  // === THEME TOGGLE BUTTON ===
  onThemeToggleClick = (): void => {
    const nextDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', nextDark)
    localStorage.setItem('theme', nextDark ? 'dark' : 'light')
  }
  themeToggle.value?.addEventListener('click', onThemeToggleClick)

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
    const tool = target.dataset.tool
    if (tool === 'sam') {
      const currentModelId = samStatus.value.currentModelId
      const isAvailable = samStatus.value.modelsStatus[currentModelId] === 'available'

      if (isAvailable) {
        setActiveTool(target)
        // Eğer session yüklü değilse (idle), arkada yüklemeye başla
        if (samStatus.value.status !== 'ready' && samStatus.value.status !== 'loading') {
          samStatus.value.status = 'loading' // Optimistic UI
          window.api.sam.ensureReady().then((res) => {
            samStatus.value = res.state // Update full state
            samReady.value = res.state.status === 'ready'
          })
        }
      } else {
        // Model yoksa indirme onayı aç
        void handleSamModelSelect(currentModelId)
        // Aracı aktif etme, Pan moduna geç (veya kal)
        enterPanMode()
      }
    } else {
      setActiveTool(target)
    }
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

  undoBtn.value?.addEventListener('click', onUndo)
  redoBtn.value?.addEventListener('click', onRedo)
  deleteBtn.value?.addEventListener('click', onDelete)
  saveBtn.value?.addEventListener('click', saveDraftAndReset)
  submitBtn.value?.addEventListener('click', onSubmit)

  // Zoom butonlarını şimdilik KonvaCanvas üzerinden elle yöneteceğiz
  zoomInBtn.value?.addEventListener('click', () => {
    konvaCanvasRef.value?.zoomBy(0.1)
  })
  zoomOutBtn.value?.addEventListener('click', () => {
    konvaCanvasRef.value?.zoomBy(-0.1)
  })
  fitScreenBtn.value?.addEventListener('click', () => {
    konvaCanvasRef.value?.fitToContainer()
  })
  resetViewBtn.value?.addEventListener('click', () => {
    void restartCurrentTask()
  })

  // Eski canvas tabanlı fitToScreen/zoom artık KonvaCanvas içinde yönetiliyor.
  // window.addEventListener('resize', fitToScreen)

  // Eski canvas etkileşimleri (pan/zoom/çizim) devre dışı; KonvaCanvas bunları devralıyor.
  // containerRO = new ResizeObserver((): void => {
  //   requestAnimationFrame(fitToScreen)
  // })
  // if (canvasContainer.value) containerRO.observe(canvasContainer.value)
  // attachCanvasInteractions()

  prevBtn.value?.addEventListener('click', (): void => goPrevTask())
  nextBtn.value?.addEventListener('click', (): void => goNextTask())

  if (tasks.value.length > 0) {
    await loadTaskByIndex(0)
  }
  updateDeleteButton()

  // DB'den gelen sürelerle zamanlayıcıları başlat
  const byId: Record<string, number> = {}
  let totalSeconds = 0
  for (const t of tasks.value) {
    const id = getTaskMediaId(t)
    const secs = t.timeSeconds ?? 0
    byId[id] = secs
    totalSeconds += secs
  }
  taskSecondsById.value = byId
  globalSeconds.value = totalSeconds

  // 1 dakikalık döngüde, Save Draft butonu üzerinde saat yönünde ilerleyen bir
  // progress halkası ve tam dolduğunda otomatik DB kaydı (oto-kayıt).
  const AUTO_SAVE_INTERVAL_MS = 1 * 60 * 1000
  const AUTO_SAVE_TICK_MS = 200

  const triggerAutoSave = async (): Promise<void> => {
    if (!tasks.value.length) return

    // Küçük bir görsel geri bildirim için Save Draft butonuna animasyon sınıfı ekle
    const btn = saveBtn.value
    if (btn) {
      btn.classList.add('save-autosaving')
    }

    try {
      for (const t of tasks.value) {
        const mediaId = t.mediaId ?? t.title ?? String(t.id)

        let anns: Annotation[] | null = null
        // Aktif task ise export fonksiyonunu kullan (image-space rounding için)
        if (t === tasks.value[currentTaskIndex.value]) {
          anns = exportAnnotationsToImageSpace() as Annotation[]
        } else {
          const cached = localAnnotationsByTask.get(mediaId)
          if (cached && cached.length > 0) {
            anns = JSON.parse(JSON.stringify(cached)) as Annotation[]
          }
        }

        if (anns && anns.length > 0) {
          const dataJson = JSON.stringify(anns, null, 2)
          await window.api.db.annotations.saveExport({ media_id: mediaId, data_json: dataJson })
        }
      }

      // Süreleri de periyodik olarak DB'ye yaz
      await flushTimeToDb()

      // Canvas üzerinde belirgin bir oto-kayıt bildirimi göster
      playAutoSaveOverlayAnimation()
    } catch (e) {
      console.error('[AutoSave] failed:', e)
    } finally {
      if (btn) {
        // Animasyon sınıfını kısa bir süre sonra kaldır
        window.setTimeout(() => {
          btn.classList.remove('save-autosaving')
        }, 900)
      }
    }
  }

  let elapsed = 0
  autoSaveProgress.value = 0

  if (timerInterval == null) {
    timerInterval = window.setInterval(() => {
      if (!tasks.value.length) return
      globalSeconds.value += 1

      const current = tasks.value[currentTaskIndex.value]
      if (!current) return

      const mediaId = getTaskMediaId(current)
      const prevTaskSeconds = taskSecondsById.value[mediaId] ?? 0
      taskSecondsById.value = {
        ...taskSecondsById.value,
        [mediaId]: prevTaskSeconds + 1
      }

      // Bu görsel üzerinde ilk kez zaman geçirilirse, status'u queued'dan in_progress'a çek
      if (prevTaskSeconds === 0 && current.status !== 'completed') {
        current.status = 'in_progress'
      }
    }, 1000)
  }

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

  // Fetch SAM Status & Models
  await window.api.sam.getModels().then((models) => {
    samModels.value = models
  })

  // Initial Status Check & Auto-Select Logic
  await window.api.sam.status().then(async (status) => {
    samStatus.value = status
    samReady.value = status.status === 'ready'

    // 1. Try to restore last used model
    const savedModel = localStorage.getItem('lastSamModel')
    let targetModel = savedModel

    // 2. If no saved model (or invalid), look for ANY downloaded model
    if (!targetModel || !samModels.value[targetModel]) {
      // Find first available 'available' model
      const available = Object.entries(status.modelsStatus).find(([id, st]) => st === 'available')
      if (available) {
        targetModel = available[0]
      } else {
        targetModel = 'vit_b' // Default fallback
      }
    }

    // 3. Switch if needed (and valid)
    if (targetModel && targetModel !== status.currentModelId) {
      // If we prioritize downloaded, we just switch.
      // We don't trigger download here, just selection.
      console.log('[SAM] Auto-switching to preferred model:', targetModel)
      await performModelSwitch(targetModel)
    } else if (targetModel) {
      // Ensure localStorage is synced if we fell back to a default
      localStorage.setItem('lastSamModel', targetModel)
    }
  })

  // Setup Download Listener
  samProgressUnsub = window.api.sam.onDownloadProgress((payload) => {
    // If the progress event matches the intended model or just generally update UI
    if (payload.total && payload.total > 0) {
      samDownloadProgress.value = payload.loaded / payload.total
    }
    samDownloadStage.value = payload.stage
  })

  // Listen for global click to close dropdowns
  onDocClick = (e: Event) => {
    const target = e.target as HTMLElement
    if (shapesDropdown.value && !shapesToolBtn.value?.contains(target)) {
      // Logic for shapes dropdown already handled by toggleShapes hopefully or similar
    }
    // Also close SAM settings if clicked outside
    if (showSamSettings.value && !target.closest('.sam-settings-container')) {
      showSamSettings.value = false
    }
  }
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount((): void => {
  if (onThemeToggleClick) themeToggle.value?.removeEventListener('click', onThemeToggleClick)
  // window.removeEventListener('resize', fitToScreen)
  // containerRO?.disconnect()
  shapesToolBtn.value?.removeEventListener('click', toggleShapes)
  if (onDocClick) document.removeEventListener('click', onDocClick)
  if (onEsc) document.removeEventListener('keydown', onEsc)
  detachKeyboardShortcuts()
  // detachCanvasInteractions()

  undoBtn.value?.removeEventListener('click', onUndo)
  redoBtn.value?.removeEventListener('click', onRedo)
  deleteBtn.value?.removeEventListener('click', onDelete)
  saveBtn.value?.removeEventListener('click', saveDraftAndReset)
  submitBtn.value?.removeEventListener('click', onSubmit)

  if (labelHintTimer != null) {
    window.clearTimeout(labelHintTimer)
    labelHintTimer = null
  }

  if (autoSaveTimer != null) {
    window.clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }

  if (timerInterval != null) {
    window.clearInterval(timerInterval)
    timerInterval = null
  }

  if (editHintTimer != null) {
    window.clearTimeout(editHintTimer)
    editHintTimer = null
  }

  if (samProgressUnsub) {
    samProgressUnsub()
    samProgressUnsub = null
  }

  // Çıkarken en son süreleri de sakla (fire-and-forget)
  void flushTimeToDb()

  // Zoom/reset butonları için addEventListener'da anonim fonksiyon kullandığımız için
  // burada removeEventListener ile temizleyemiyoruz; bu, sadece küçük bir sızıntı ve
  // Konva geçişi tamamlanırken ayrı bir refaktörde ele alınabilir.
})

/* =============================
   Task Yükleme & Navigasyon
   ============================= */
async function loadTaskByIndex(i: number): Promise<void> {
  if (tasks.value.length === 0) return

  const prevTool = state.lastUsedTool
  const prevShape = state.lastUsedShape
  const prevLabel = state.activeLabel

  // Önce mevcut task'in annotation'larını hafızaya yaz (uygulama açıkken geçerli).
  const currentTask = tasks.value[currentTaskIndex.value]
  if (currentTask) {
    const currentMediaId = currentTask.mediaId ?? currentTask.title ?? String(currentTask.id)
    // Eğer gerçekten RAM'de annotation varsa cache'e yaz; aksi halde DB'deki kaydı
    // "boş" bir snapshot ile gölgeleme.
    if (state.annotations.length > 0) {
      const snapshot = JSON.parse(JSON.stringify(state.annotations)) as Annotation[]
      localAnnotationsByTask.set(currentMediaId, snapshot)
    }
  }

  const clamped = Math.max(0, Math.min(tasks.value.length - 1, i))
  // Aynı task'e tekrar tıklanıyorsa, mevcut (kaydedilmemiş) etiketleri silmemek için yeniden yükleme
  // yapma. Böylece tek task senaryosunda etiketler korunur.
  if (clamped === currentTaskIndex.value && state.img?.src) return

  currentTaskIndex.value = clamped
  const t = tasks.value[clamped]

  if (taskTitle.value) {
    taskTitle.value.textContent = `Image Annotation - ${t.title}`
  }

  state.annotations = []
  state.history = []
  state.historyIndex = -1
  state.selectedAnnotationId = null

  try {
    const imgSrc = toLocalUrlMaybe(t.image)
    console.log('IMG SRC =>', imgSrc)
    const img = await loadImage(imgSrc)
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

    const mediaId = t.mediaId ?? t.title ?? String(t.id) // en sağlam kimlik

    // Önce, bu task için oturum içi cache'te annotation var mı diye bak.
    const cached = localAnnotationsByTask.get(mediaId)
    if (cached && cached.length > 0) {
      // Sadece gerçekten dolu bir cache varsa onu kullan
      state.annotations = JSON.parse(JSON.stringify(cached)) as Annotation[]
    } else {
      // === RESTORE SAVED ANNOTATIONS (DB) ===
      try {
        const saved = await window.api.db.annotations.getExport(mediaId)
        if (saved?.data_json) {
          const parsed = JSON.parse(saved.data_json)
          if (Array.isArray(parsed)) {
            // parsed beklenen format: Annotation[]
            state.annotations = parsed
          } else {
            state.annotations = []
          }
        } else {
          state.annotations = []
        }
      } catch (e) {
        console.error('[DB] restore annotations failed:', e)
        state.annotations = []
      }
    }

    let labelEl: HTMLElement | null = null
    if (prevLabel && labelList.value) {
      labelEl = labelList.value.querySelector(
        `.label-item[data-label="${prevLabel}"]`
      ) as HTMLElement | null
    }
    if (!labelEl) {
      labelEl = labelList.value?.querySelector('.label-item') as HTMLElement | null
    }
    setActiveLabel(labelEl)

    let toolEl: HTMLElement | null = null
    if (prevTool === 'shapes') {
      const shape = prevShape ?? 'bbox'
      toolEl = shapesDropdown.value?.querySelector(
        `.annotation-tool[data-tool="${shape}"]`
      ) as HTMLElement | null
    } else {
      toolEl = toolGroup.value?.querySelector(
        `.annotation-tool[data-tool="${prevTool}"]`
      ) as HTMLElement | null
    }

    if (!toolEl) {
      toolEl = toolGroup.value?.querySelector(
        '.annotation-tool[data-tool="select"]'
      ) as HTMLElement | null
    }
    setActiveTool(toolEl)
    // Restore sonrası UI güncelle
    renderAnnotations()
    recordHistory()

    void nextTick(() => {
      const container = tasksNav.value
      if (!container) return

      // Eğer 1. göreve geldiysek (Task 1), sidebar'ı tamamen en üste sar
      if (currentTaskIndex.value === 0) {
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

    // ⚡ PREFETCH: Record user activity and update cache plan
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
    const taskImage = t.image.split(/[\\/]/).pop() || t.image
    console.log(`\n[${timestamp}] [UI] 📄 Task ${i} loaded: ${taskImage}`)

    window.electron.ipcRenderer.invoke('sam:recordPrefetchActivity')
    // Send simplified task data (only serializable properties)
    const simplifiedTasks = tasks.value.map((task) => ({ image: task.image }))
    window.electron.ipcRenderer.invoke(
      'sam:updatePrefetchPlan',
      i,
      tasks.value.length,
      simplifiedTasks
    )
  } catch (err) {
    console.error('Image load failed:', err)
  }
}

function handleTaskNavigation(idx: number): void {
  if (editingAnnotationId.value !== null) {
    alert('⚠️ Finish editing first! Press ESC to cancel or Enter to save.')
    return
  }
  loadTaskByIndex(idx)
}

function goPrevTask(): void {
  handleTaskNavigation((currentTaskIndex.value - 1 + tasks.value.length) % tasks.value.length)
}

function goNextTask(): void {
  handleTaskNavigation((currentTaskIndex.value + 1) % tasks.value.length)
}

function handleStrokeWidthScroll(e: WheelEvent): void {
  const delta = Math.sign(e.deltaY) * -1 // Aşağı scroll -> değer azalır, Yukarı scroll -> değer artar
  let newVal = strokeWidth.value + delta * 0.5
  newVal = Math.max(1, Math.min(10, newVal))
  strokeWidth.value = newVal
}

async function handleSamModelSelect(modelId: string): Promise<void> {
  // Guard: Confirm dialog is already open
  if (downloadConfirmation.value.show) return

  // Guard: Download in progress
  if (samDownloading.value || samPaused.value) {
    if (samDownloadingModelId.value === modelId) {
      // Already downloading this model, ignore click
      return
    } else {
      // Downloading a DIFFERENT model, block switching
      alert('Please wait for the current download to complete or cancel it first.')
      return
    }
  }

  if (samStatus.value.currentModelId === modelId && samStatus.value.status === 'ready') return

  // Check if downloaded
  const isDownloaded = samStatus.value.modelsStatus?.[modelId] === 'available'

  if (!isDownloaded) {
    // Show confirmation instead of downloading immediately
    const model = samModels.value[modelId]
    downloadConfirmation.value = {
      show: true,
      modelId,
      modelName: model?.name || modelId,
      size: model?.size || 'Unknown'
    }
    // Close settings dropdown
    showSamSettings.value = false
    return
  }

  performModelSwitch(modelId)
}

async function performModelSwitch(modelId: string, downloadFirst = false): Promise<void> {
  // Optimistic update
  samStatus.value.currentModelId = modelId
  samStatus.value.status = 'idle' // Reset ready status until loaded
  samReady.value = false

  if (downloadFirst) {
    samDownloading.value = true
    samDownloadingModelId.value = modelId // Track ID
    samPaused.value = false
    samDownloadProgress.value = 0
    try {
      await window.api.sam.download(modelId)
      // Refresh status after download
      const newStatus = await window.api.sam.status()
      samStatus.value.modelsStatus[modelId] = 'available'
    } catch (e) {
      console.error('Download failed or paused', e)
      // Status check handles pause/cancel state logic in UI
    } finally {
      if (!samPaused.value) {
        samDownloading.value = false
        samDownloadingModelId.value = null
      }
    }
  }

  // Set model (this also unloads previous)
  const res = await window.api.sam.setModel(modelId)
  samStatus.value = res.state

  // Persist user preference
  localStorage.setItem('lastSamModel', modelId)
}

async function togglePauseDownload(modelId: string): Promise<void> {
  if (samPaused.value) {
    // Resume
    samPaused.value = false
    performModelSwitch(modelId, true)
  } else {
    // Pause
    samPaused.value = true
    samDownloading.value = false // Stop spinner
    await window.api.sam.pauseDownload(modelId)
  }
}

async function cancelDownload(modelId: string): Promise<void> {
  samDownloading.value = false
  samDownloadingModelId.value = null
  samPaused.value = false
  samDownloadProgress.value = 0
  await window.api.sam.cancelDownload(modelId)
  // Update status
  const newStatus = await window.api.sam.status()
  samStatus.value = newStatus
}

function confirmDownloadAction(accept: boolean): void {
  const { modelId } = downloadConfirmation.value
  downloadConfirmation.value.show = false

  if (accept && modelId) {
    performModelSwitch(modelId, true)
  }
}
</script>

<template>
  <div
    class="flex h-full bg-background-light dark:bg-background-dark font-display text-text-primary dark:text-white"
  >
    <!-- Sidebar (kısa) -->
    <aside
      class="flex flex-col w-72 bg-surface/80 dark:bg-background-dark border-r border-border/70 dark:border-gray-800"
    >
      <div class="p-5 bg-surface dark:bg-background-dark">
        <h1 class="text-2xl font-bold">LabelGun</h1>
      </div>

      <nav
        ref="tasksNav"
        class="flex-1 px-4 space-y-2 overflow-y-auto bg-surface/60 dark:bg-background-dark/60 p-3 tasks-scroll"
      >
        <div
          class="px-2 mb-2 flex items-center justify-between text-xs font-semibold text-text-secondary dark:text-gray-300 uppercase tracking-wider"
        >
          <h2>Tasks</h2>
          <div class="flex items-center gap-1">
            <button
              ref="prevBtn"
              class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
              title="Previous Task (←)"
            >
              <ArrowBackIcon class="ui-svg h-4 w-4 text-gray-700 dark:text-gray-200" />
            </button>
            <button
              ref="nextBtn"
              class="p-1 rounded-md bg-slate-100 dark:bg-gray-800 hover:bg-slate-200"
              title="Next Task (→)"
            >
              <ArrowFwdIcon class="ui-svg h-4 w-4 text-gray-700 dark:text-gray-200" />
            </button>
          </div>
        </div>
        <ul class="space-y-3">
          <li v-for="(t, idx) in tasks" :key="t.id">
            <a
              href="#"
              :data-active="idx === currentTaskIndex ? 'true' : null"
              :class="[
                'block rounded-lg overflow-hidden border-2',
                idx === currentTaskIndex
                  ? 'border-primary dark:border-primary/80 bg-primary/5'
                  : 'border-transparent hover:border-primary/50'
              ]"
              @click.prevent="handleTaskNavigation(idx)"
            >
              <div
                class="h-24 bg-background-light dark:bg-background-dark flex items-center justify-center"
              >
                <span class="text-text-secondary dark:text-gray-400">image</span>
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
                <div class="mt-1 text-xs text-slate-500 dark:text-gray-400">
                  Time: {{ formatTime(getTaskSeconds(t)) }}
                </div>
              </div>
            </a>
          </li>
        </ul>
      </nav>

      <div
        class="p-4 border-t border-border dark:border-gray-800 relative bg-surface dark:bg-background-dark"
      >
        <button
          ref="filterBtn"
          class="w-full flex items-center justify-center gap-2 rounded bg-primary text-white hover:bg-primary-light py-2 px-4 text-sm font-semibold"
        >
          <FilterIcon class="ui-svg h-5 w-5 text-white" />
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
        class="flex items-center justify-between p-5 border-b border-border dark:border-gray-800 bg-surface/70 dark:bg-background-dark"
      >
        <div class="flex items-center gap-4">
          <h2 ref="taskTitle" class="text-xl font-bold">Image Annotation - Task 1</h2>
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
              {{ formatTime(globalSeconds) }}
            </div>
          </div>

          <!-- Removed old floating progress bar as it is now in the menu -->

          <button
            ref="saveBtn"
            class="flex items-center gap-2 rounded bg-primary text-white hover:bg-primary-light py-2 px-4 text-sm font-semibold save-auto-btn"
            :style="{ '--save-progress': String(autoSaveProgress) }"
          >
            <SaveIcon class="ui-svg h-5 w-5 text-white" />
            <span>Save Draft</span>
          </button>

          <button
            ref="submitBtn"
            class="flex items-center gap-2 rounded bg-primary py-2 px-4 text-sm font-semibold text-white hover:bg-primary-light"
          >
            <ApproveIcon class="ui-svg h-5 w-5 text-white" />
            <span>Submit Work</span>
          </button>
        </div>
      </header>

      <div class="flex-1 flex p-4 gap-4 overflow-hidden">
        <div class="flex-1 flex flex-col gap-2">
          <!-- Toolbar -->
          <div
            class="flex items-center justify-between gap-1 p-2 bg-surface/70 dark:bg-background-dark rounded-lg border border-border dark:border-gray-800"
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

              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

              <div class="relative flex items-center sam-split-button group">
                <!-- Main Tool Button (Left) -->
                <button
                  class="p-2 rounded-l-lg hover:bg-gray-100 dark:hover:bg-gray-800 annotation-tool border-r border-gray-200 dark:border-gray-700 flex items-center justify-center relative"
                  data-tool="sam"
                  :title="`Shoot with labelGun (${samModels[samStatus.currentModelId]?.name || 'Fast'})`"
                >
                  <SamIcon
                    class="ui-svg h-6 w-6 text-slate-600 dark:text-gray-300"
                    :class="{ 'text-primary': samStatus.status === 'ready' }"
                  />
                  <!-- Loading Indicator Overlay -->
                  <div
                    v-if="samStatus.status === 'loading'"
                    class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-l-lg"
                  >
                    <div
                      class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"
                    ></div>
                  </div>
                </button>

                <!-- Dropdown Trigger (Right) -->
                <button
                  class="p-1 px-1.5 rounded-r-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center border-l-0"
                  @click.stop="showSamSettings = !showSamSettings"
                  title="Select Model"
                >
                  <ArrowDropDownIcon class="ui-svg h-5 w-5 text-slate-500 dark:text-gray-400" />
                </button>

                <!-- Professional Model Menu -->
                <div
                  v-if="showSamSettings"
                  class="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-20 border border-slate-200 dark:border-gray-700 overflow-hidden"
                >
                  <div
                    class="bg-slate-50 dark:bg-gray-800 px-3 py-2 border-b border-slate-200 dark:border-gray-700"
                  >
                    <div
                      class="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Active Model
                    </div>
                  </div>

                  <div class="p-1">
                    <div
                      v-for="(model, id) in samModels"
                      :key="id"
                      class="relative group/item flex flex-col gap-1 p-3 rounded-md cursor-pointer transition-all border border-transparent"
                      :class="{
                        'bg-primary/5 border-primary/20': samStatus.currentModelId === id,
                        'hover:bg-slate-50 dark:hover:bg-gray-800': samStatus.currentModelId !== id
                      }"
                      @click="handleSamModelSelect(String(id))"
                    >
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2.5">
                          <!-- Status Indicator -->
                          <div
                            class="w-2 h-2 rounded-full"
                            :class="{
                              'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]':
                                samStatus.currentModelId === id && samStatus.status === 'ready',
                              'bg-slate-300 dark:bg-gray-600': samStatus.currentModelId !== id
                            }"
                          ></div>
                          <span
                            class="text-sm font-semibold"
                            :class="
                              samStatus.currentModelId === id
                                ? 'text-primary'
                                : 'text-slate-700 dark:text-gray-200'
                            "
                            >{{ model.name }}</span
                          >
                        </div>
                        <span
                          class="text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors"
                          :class="
                            samStatus.modelsStatus[id] === 'available'
                              ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
                              : 'text-slate-400 bg-slate-100 dark:bg-gray-800'
                          "
                        >
                          {{
                            samStatus.modelsStatus[id] === 'available' ? 'Downloaded' : model.size
                          }}
                        </span>
                      </div>

                      <p class="text-[11px] text-slate-500 dark:text-gray-400 pl-4 leading-snug">
                        {{ model.description }}
                      </p>

                      <!-- Download/Progress Area -->
                      <div
                        v-if="(samDownloading || samPaused) && samDownloadingModelId === id"
                        class="mt-2 pl-4"
                        @click.stop
                      >
                        <div
                          class="flex items-center justify-between text-[10px] text-slate-500 mb-1"
                        >
                          <span>{{
                            samPaused
                              ? 'Paused'
                              : samDownloadStage === 'encoder'
                                ? 'Downloading Encoder...'
                                : 'Downloading Decoder...'
                          }}</span>
                          <span>{{ Math.floor(samDownloadProgress * 100) }}%</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <!-- Progress Bar Housing -->
                          <div
                            class="flex-1 h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden"
                          >
                            <div
                              class="h-full bg-primary transition-all duration-300 ease-out"
                              :style="{ width: `${Math.max(5, samDownloadProgress * 100)}%` }"
                            ></div>
                          </div>

                          <!-- Controls -->
                          <div class="flex items-center gap-1">
                            <button
                              @click="togglePauseDownload(String(id))"
                              class="p-0.5 hover:bg-slate-200 dark:hover:bg-gray-600 rounded"
                            >
                              <component
                                :is="samPaused ? PlayIcon : PauseIcon"
                                class="w-4 h-4 text-slate-600 dark:text-gray-300"
                              />
                            </button>
                            <button
                              @click="cancelDownload(String(id))"
                              class="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded group/cancel"
                            >
                              <CloseIcon
                                class="w-4 h-4 text-slate-400 group-hover/cancel:text-red-500"
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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

              <div class="h-6 w-px bg-slate-200 dark:bg-gray-700 mx-1"></div>

              <!-- Stroke Width Slider -->
              <div
                class="flex items-center gap-2 px-2"
                title="Border Thickness (Scroll to adjust)"
                @wheel.prevent="handleStrokeWidthScroll"
              >
                <span class="text-xs font-bold text-slate-500 dark:text-gray-400">Size</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  v-model.number="strokeWidth"
                  class="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
                />
                <span class="text-xs font-mono text-slate-500 dark:text-gray-400 w-6 text-right">{{
                  strokeWidth
                }}</span>
              </div>
            </div>
          </div>

          <!-- Canvas alanı (kart içinde) -->
          <div
            class="flex-1 rounded-lg bg-surface/70 dark:bg-background-dark border border-border dark:border-gray-800 shadow-sm p-2"
          >
            <div
              ref="canvasContainer"
              class="relative w-full h-full rounded-md bg-background-light dark:bg-background-dark overflow-hidden canvas-container"
            >
              <KonvaCanvas
                ref="konvaCanvasRef"
                :image-src="
                  tasks[currentTaskIndex]?.image
                    ? toLocalUrlMaybe(tasks[currentTaskIndex].image)
                    : null
                "
                :annotations="state.annotations"
                :active-tool="state.lastUsedTool"
                :active-shape="state.lastUsedShape"
                :active-label="state.activeLabel"
                :selected-id="state.selectedAnnotationId"
                :editing-id="editingAnnotationId"
                :stroke-width="strokeWidth"
                @create-annotation="handleCreateAnnotationFromKonva"
                @select-annotation="handleSelectAnnotationFromKonva"
                @pointer-move="handlePointerMove"
                @pointer-leave="handlePointerLeave"
                @sam-click="handleSamClickFromKonva"
                @sam-draw="handleSamDrawFromKonva"
                @edit-request="handleEditRequestFromKonva"
                @update-annotation-state="handleUpdateAnnotationStateFromKonva"
                @annotation-transform-end="handleAnnotationTransformEndFromKonva"
              />

              <!-- Edit hint toast -->
              <transition name="fade">
                <div
                  v-if="showEditHint"
                  class="absolute top-4 right-4 bg-black/80 text-white text-xs sm:text-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 max-w-xs"
                >
                  <SamIcon class="ui-svg h-4 w-4 text-primary-light" />
                  <span>Tip: Long-press on a polygon to adjust its shape.</span>
                  <button
                    type="button"
                    class="ml-1 text-[10px] sm:text-xs underline underline-offset-2 decoration-white/60 hover:decoration-white focus:outline-none"
                    @click.stop="dismissEditHint"
                  >
                    Don’t show again
                  </button>
                </div>
              </transition>

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
                <button ref="resetViewBtn" class="p-2 rounded-md hover:bg-white/20" title="Restart">
                  <ResetViewIcon class="ui-svg h-6 w-6 text-white" />
                </button>
              </div>

              <div
                ref="coords"
                class="absolute bottom-4 left-4 bg-black/50 text-white text-xs font-mono rounded px-2 py-1"
              >
                X: -, Y: -
              </div>

              <div ref="autoSaveOverlay" class="auto-save-overlay">
                <div class="auto-save-pill">
                  <div class="auto-save-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <span class="auto-save-text">Auto saved</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sağ paneller -->
        <div class="w-full lg:w-96 flex flex-col gap-4 pt-0 h-full overflow-hidden">
          <div
            class="bg-surface/70 dark:bg-background-dark p-4 rounded-lg border border-border dark:border-gray-800 flex flex-col min-h-0 flex-1"
          >
            <h3 class="text-lg font-semibold mb-3">Annotations</h3>
            <div ref="annotationList" class="space-y-3 overflow-y-auto flex-1 min-h-0"></div>
          </div>

          <div
            class="bg-surface/70 dark:bg-background-dark p-4 rounded-lg border border-border dark:border-gray-800 flex flex-col shrink-0"
          >
            <h3 class="text-lg font-semibold mb-3">Labels</h3>
            <p v-if="showLabelHint" class="text-xs text-amber-500 mb-2">
              Lütfen önce bir label seçin.
            </p>
            <div class="relative mb-3">
              <SearchIcon
                class="ui-svg h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              />
              <input
                type="search"
                placeholder="Search labels..."
                class="w-full pl-10 pr-4 py-2 rounded-lg border border-border dark:border-gray-700 bg-background-light dark:bg-background-dark"
              />
            </div>
            <div ref="labelList" class="flex flex-wrap gap-2">
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20 label-item"
                data-label="Göz"
                >Göz</span
              >
              <span
                class="cursor-pointer bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary/20 label-item"
                data-label="Kulak"
                >Kulak</span
              >
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Download Confirmation Modal -->
    <transition name="fade">
      <div
        v-if="downloadConfirmation.show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      >
        <div
          class="bg-surface dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-gray-700"
        >
          <h3 class="text-lg font-bold text-slate-800 dark:text-gray-100 mb-2">Download Model?</h3>
          <p class="text-sm text-slate-600 dark:text-gray-300 mb-4">
            You are about to download <strong>{{ downloadConfirmation.modelName }}</strong
            >. <br /><br />
            Approximate size:
            <span class="font-mono bg-slate-100 dark:bg-gray-700 px-1 rounded">{{
              downloadConfirmation.size
            }}</span>
          </p>
          <div class="flex items-center justify-end gap-3">
            <button
              @click="confirmDownloadAction(false)"
              class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              @click="confirmDownloadAction(true)"
              class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-light"
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
<style src="@renderer/styles/labeler-view.css"></style>
