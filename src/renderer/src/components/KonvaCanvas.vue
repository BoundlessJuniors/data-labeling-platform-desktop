<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
// vue-konva bileşenleri global plugin ile v-stage, v-layer vb. olarak kayıtlı; doğrudan kullanacağız.
import type {
  Annotation,
  BBox,
  PolygonAnn,
  PolylineAnn,
  KeypointAnn,
  CircleAnn
} from '@renderer/types/annotation'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'

const props = withDefaults(
  defineProps<{
    imageSrc: string | null
    annotations: Annotation[]
    activeTool: 'select' | 'sam' | 'shapes'
    activeShape: 'bbox' | 'polygon' | 'polyline' | 'keypoint' | 'circle'
    activeLabel: string | null
    selectedId: number | null
    // Düzenleme modu için, şu an düzenlenen polygon id'si (yoksa null)
    editingId?: number | null
    // Kullanıcı tarafından UI'dan seçilen kalınlık (default: 2)
    strokeWidth?: number
  }>(),
  {
    strokeWidth: 2
  }
)

const emit = defineEmits([
  'create-annotation',
  'select-annotation',
  'pointer-move',
  'pointer-leave',
  'sam-click',
  'sam-draw',
  'edit-request',
  'update-annotation-state',
  'annotation-transform-end'
])

const containerRef = ref<HTMLDivElement | null>(null)
const stageWidth = ref(0)
const stageHeight = ref(0)
const stageScale = ref(1)
const stageX = ref(0)
const stageY = ref(0)

const isPanning = ref(false)
const panStart = ref<{ x: number; y: number } | null>(null)

const isDrawing = ref(false)
const drawingShape = ref<'bbox' | 'polygon' | 'polyline' | 'circle' | null>(null)
const drawingStart = ref<{ x: number; y: number } | null>(null)
const tempBBox = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const polyPoints = ref<{ x: number; y: number }[]>([])
const tempPolyPoint = ref<{ x: number; y: number } | null>(null)
const tempCircle = ref<{ cx: number; cy: number; r: number } | null>(null)

// SAM Drawing State
const isSamDrawing = ref(false)
const samPath = ref<{ x: number; y: number }[]>([])

const imageObj = ref<HTMLImageElement | null>(null)

const hoverCursor = ref<string | null>(null)

const stageStyle = computed<Record<string, string>>(() => {
  // SAM mode should always show crosshair
  if (props.activeTool === 'sam') return { cursor: 'crosshair' }

  if (hoverCursor.value) return { cursor: hoverCursor.value }
  if (isPanning.value) return { cursor: 'grabbing' }
  if (props.activeTool === 'select') return { cursor: 'grab' }
  return {}
})

const LONG_PRESS_MS = 400
let longPressTimer: number | null = null
let longPressTargetId: number | null = null
const didTriggerLongPress = ref(false)

// SAM düzenleme modunda, hangi vertex'in sürüklendiğini takip etmek için
const activeEditVertex = ref<{ annId: number; idx: number } | null>(null)
// Keypoint/Circle radius düzenleme
const activeEditRadius = ref<{ annId: number } | null>(null)
// Sürüklenen şekil (transparanlık için)
const dragTargetId = ref<number | null>(null)

let resizeObserver: ResizeObserver | null = null
let keydownHandler: ((e: KeyboardEvent) => void) | null = null

const bboxAnnotations = computed(() => props.annotations.filter((a) => a.type === 'bbox') as BBox[])
const polygonAnnotations = computed(
  () => props.annotations.filter((a) => a.type === 'polygon') as PolygonAnn[]
)
const polylineAnnotations = computed(
  () => props.annotations.filter((a) => a.type === 'polyline') as PolylineAnn[]
)
const keypointAnnotations = computed(
  () => props.annotations.filter((a) => a.type === 'keypoint') as KeypointAnn[]
)
const circleAnnotations = computed(
  () => props.annotations.filter((a) => a.type === 'circle') as CircleAnn[]
)

const activeEditingAnnotation = computed(() => {
  if (props.editingId == null) return null
  return props.annotations.find((a) => a.id === props.editingId) || null
})

const MIN_SCALE = 0.05
const minScale = ref(MIN_SCALE)
const hasUserTransform = ref(false)

const clampStagePosition = (): void => {
  if (!imageObj.value) return

  const iw = imageObj.value.naturalWidth
  const ih = imageObj.value.naturalHeight
  const scale = stageScale.value || 1
  const drawnW = iw * scale
  const drawnH = ih * scale

  const cw = stageWidth.value
  const ch = stageHeight.value
  if (!cw || !ch || !drawnW || !drawnH) return

  // Ekranda her eksende en az "margin" kadar görüntü kalsın,
  // ama kullanıcı görüntüyü serbestçe etrafında gezdirebilsin.
  const margin = 40 // px

  const minX = margin - drawnW
  const maxX = cw - margin
  stageX.value = Math.min(maxX, Math.max(minX, stageX.value))

  const minY = margin - drawnH
  const maxY = ch - margin
  stageY.value = Math.min(maxY, Math.max(minY, stageY.value))
}

const handleResize = (forceFit = false): void => {
  const el = containerRef.value
  if (!el || !imageObj.value) return

  const cw = el.clientWidth
  const ch = el.clientHeight
  const iw = imageObj.value.naturalWidth
  const ih = imageObj.value.naturalHeight
  if (!cw || !ch || !iw || !ih) return

  stageWidth.value = cw
  stageHeight.value = ch

  if (forceFit || !hasUserTransform.value) {
    const fitScale = Math.min(cw / iw, ch / ih)
    stageScale.value = fitScale

    const relativeMin = fitScale * 0.5
    minScale.value = Math.min(fitScale, Math.max(MIN_SCALE, relativeMin))

    const drawnW = iw * fitScale
    const drawnH = ih * fitScale

    stageX.value = (cw - drawnW) / 2
    stageY.value = (ch - drawnH) / 2
  }

  clampStagePosition()
}

const loadImageFromSrc = (src: string | null): void => {
  // Reset (yeni image gelene kadar stage kapanıp açılabilsin)
  imageObj.value = null
  hasUserTransform.value = false

  if (!src) return

  const img = new window.Image()

  img.onload = () => {
    imageObj.value = img
    handleResize(true)
  }

  img.onerror = (err) => {
    console.error('[KonvaCanvas] Image load failed:', src, err)
  }

  // Cache kırmak bazen electron/local protokollerde hayat kurtarır
  const bust = src.includes('?') ? '&' : '?'
  img.src = `${src}${bust}t=${Date.now()}`
}

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(containerRef.value)
  }

  // ESC / Enter ile yerel olarak da çizimi kontrol et (her ihtimale karşı)
  keydownHandler = (e: KeyboardEvent): void => {
    if (!isDrawing.value) return

    if (e.key === 'Enter') {
      // Polygon için en az 3, polyline için en az 2 nokta varsa Enter ile tamamla
      if (drawingShape.value === 'polygon' && polyPoints.value.length >= 3) {
        e.preventDefault()
        e.stopPropagation()
        finishDrawing()
        return
      }
      if (drawingShape.value === 'polyline' && polyPoints.value.length >= 2) {
        e.preventDefault()
        e.stopPropagation()
        finishDrawing()
        return
      }
    }
  }
  window.addEventListener('keydown', keydownHandler, true)
})

watch(
  () => props.imageSrc,
  (src) => {
    loadImageFromSrc(src)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler, true)
    keydownHandler = null
  }
})

const imageConfig = computed(() => {
  if (!imageObj.value) return null
  return {
    image: imageObj.value,
    width: imageObj.value.naturalWidth,
    height: imageObj.value.naturalHeight
  }
})

const computedStyles = computed(() => {
  if (!imageObj.value) return { keypointRadius: 4 }
  const w = imageObj.value.naturalWidth
  const h = imageObj.value.naturalHeight
  const maxDim = Math.max(w, h)
  // Kullanıcının belirttiği formül: max(W, H) / 200
  // Ancak çok küçük görsellerde minik kalmasın diye alt limit (örn: 3px) koyuyoruz.
  const kpRadius = Math.max(3, maxDim / 200)
  return {
    keypointRadius: kpRadius
  }
})

watch(
  () => props.strokeWidth,
  (val) => {
    console.log('[KonvaCanvas] strokeWidth prop changed:', val, typeof val)
  }
)

const computedStrokeWidth = computed(() => props.strokeWidth || 2)

// Konva wheel event
const handleWheel = (e: KonvaEventObject<WheelEvent>): void => {
  const stage = e.target?.getStage?.()
  if (!stage) return

  const evt: WheelEvent | undefined = e.evt
  if (!evt) return

  // Sadece Ctrl basılıyken zoom yap (tarayıcı zoom'unu engelle)
  if (!evt.ctrlKey) return
  evt.preventDefault()

  const oldScale = stageScale.value || 1
  const pointer = stage.getPointerPosition()
  if (!pointer) return

  const scaleBy = 1.05
  const direction = evt.deltaY > 0 ? -1 : 1
  const rawScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
  const limit = minScale.value || MIN_SCALE
  const newScale = Math.max(limit, Math.min(rawScale, 10))

  const mousePointTo = {
    x: (pointer.x - stageX.value) / oldScale,
    y: (pointer.y - stageY.value) / oldScale
  }

  stageScale.value = newScale
  stageX.value = pointer.x - mousePointTo.x * newScale
  stageY.value = pointer.y - mousePointTo.y * newScale
  hasUserTransform.value = true
  clampStagePosition()
}

const toWorldCoords = (stage: Konva.Stage): { x: number; y: number } | null => {
  const pointer = stage.getPointerPosition()
  if (!pointer) return null
  const scale = stageScale.value || 1
  return {
    x: (pointer.x - stageX.value) / scale,
    y: (pointer.y - stageY.value) / scale
  }
}

const getImagePoint = (stage: Konva.Stage): { x: number; y: number } | null => {
  if (!imageObj.value) return null
  const world = toWorldCoords(stage)
  if (!world) return null

  const iw = imageObj.value.naturalWidth
  const ih = imageObj.value.naturalHeight

  if (world.x < 0 || world.y < 0 || world.x > iw || world.y > ih) return null

  return world
}

const getClampedImagePoint = (stage: Konva.Stage): { x: number; y: number } | null => {
  if (!imageObj.value) return null
  const world = toWorldCoords(stage)
  if (!world) return null

  const iw = imageObj.value.naturalWidth
  const ih = imageObj.value.naturalHeight

  const x = Math.min(Math.max(world.x, 0), iw)
  const y = Math.min(Math.max(world.y, 0), ih)

  return { x, y }
}

const emitPointerMove = (stage: Konva.Stage): void => {
  const pointer = stage.getPointerPosition()
  if (!pointer) return

  const imgPoint = getImagePoint(stage)

  const imgX: number | null = imgPoint ? imgPoint.x : null
  const imgY: number | null = imgPoint ? imgPoint.y : null

  emit('pointer-move', {
    screenX: pointer.x,
    screenY: pointer.y,
    imgX,
    imgY
  })
}

const handleMouseDown = (e: KonvaEventObject<MouseEvent>): void => {
  const stage = e.target?.getStage?.() as Konva.Stage | null
  if (!stage) return

  const evt: MouseEvent | undefined = e.evt
  if (!evt) return

  // Sağ tık ile pan: kullanıcı shapes (etiketleme) modundayken bile sahneyi
  // rahatça taşıyabilsin. BBox dahil tüm şekillerde sağ tık pan serbest.
  if (evt.button === 2) {
    evt.preventDefault()

    const pointer = stage.getPointerPosition()
    if (!pointer) return
    isPanning.value = true
    panStart.value = {
      x: pointer.x - stageX.value,
      y: pointer.y - stageY.value
    }
    hasUserTransform.value = true
    return
  }

  // Sol tık dışındaki her şeyi yok say
  if (evt.button !== 0) return

  // Eğer herhangi bir polygon düzenleniyorsa (SAM veya Shapes),
  // sahneye tıklanması yeni bir çizim başlatmamalıdır.
  // Sadece vertex handle'ları (drag) çalışmalı.
  if (props.editingId != null) return

  // SAM aracı aktifken: tek tıklamada imaj koordinatını dışarı bildir,
  // pan veya shapes çizimine geçme.
  if (props.activeTool === 'sam') {
    // (editingId kontrolü yukarı taşındı)

    // Arka plandaki image dışındaki bir şekle (polygon, bbox, vb.) tıklıyorsak
    // SAM isteği üretmeyelim. Bu durumlarda ya seçim ya da uzun basma ile edit beklenir.
    const targetNode = e.target as unknown as Konva.Node | null
    const className =
      targetNode && typeof (targetNode as any).getClassName === 'function'
        ? (targetNode as any).getClassName()
        : ''

    if (className && className !== 'Image') {
      // Örneğin polygon veya bbox; SAM tıklaması yapma.
      return
    }

    const imgPoint = getImagePoint(stage)
    if (imgPoint) {
      // START SAM DRAWING
      isSamDrawing.value = true
      samPath.value = [{ x: imgPoint.x, y: imgPoint.y }]
    }
    return
  }

  // Çizim modu: shapes + bbox / polygon / polyline / keypoint / circle
  if (props.activeTool === 'shapes') {
    const imgPoint = getImagePoint(stage)

    // Görüntü dışına tıklanmışsa çizim başlatma; bu durumda altta pan'e düşeceğiz.
    if (imgPoint) {
      if (props.activeShape === 'bbox') {
        // BBox çizimi (drag)
        isDrawing.value = true
        drawingShape.value = 'bbox'
        drawingStart.value = { ...imgPoint }
        tempBBox.value = { x: imgPoint.x, y: imgPoint.y, width: 0, height: 0 }
        isPanning.value = false
        panStart.value = null
        return
      }

      if (props.activeShape === 'keypoint') {
        // Tek tıklama ile keypoint oluştur
        const kp: KeypointAnn = {
          id: Date.now(),
          type: 'keypoint',
          label: props.activeLabel,
          x: imgPoint.x,
          y: imgPoint.y
        }
        emit('create-annotation', kp)
        return
      }

      if (props.activeShape === 'circle') {
        // Daire çizimi (merkez + drag ile yarıçap)
        isDrawing.value = true
        drawingShape.value = 'circle'
        drawingStart.value = { ...imgPoint }
        tempCircle.value = { cx: imgPoint.x, cy: imgPoint.y, r: 0 }
        isPanning.value = false
        panStart.value = null
        return
      }

      if (props.activeShape === 'polygon' || props.activeShape === 'polyline') {
        const shape = props.activeShape

        // Polygon / polyline: tıklayarak nokta ekle (ilk click veya normal tekli clickler)
        if (!isDrawing.value || drawingShape.value !== shape) {
          // İlk nokta
          isDrawing.value = true
          drawingShape.value = shape
          polyPoints.value = [{ x: imgPoint.x, y: imgPoint.y }]
        } else {
          // Sonraki noktalar
          polyPoints.value = [...polyPoints.value, { x: imgPoint.x, y: imgPoint.y }]
        }

        return
      }
    }
  }

  // Diğer durumlarda pan
  const pointer = stage.getPointerPosition()
  if (!pointer) return
  isPanning.value = true
  panStart.value = {
    x: pointer.x - stageX.value,
    y: pointer.y - stageY.value
  }
  hasUserTransform.value = true
}

const handleMouseMove = (e: KonvaEventObject<MouseEvent>): void => {
  const stage = e.target?.getStage?.() as Konva.Stage | null
  if (!stage) return

  emitPointerMove(stage)

  // Pan aktifse, öncelikle onu güncelle (çizimden bağımsız).
  if (isPanning.value && panStart.value) {
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    stageX.value = pointer.x - panStart.value.x
    stageY.value = pointer.y - panStart.value.y
    clampStagePosition()
    return
  }

  // SAM Drawing Update
  if (props.activeTool === 'sam' && isSamDrawing.value) {
    const imgPoint = getClampedImagePoint(stage)
    if (imgPoint) {
      samPath.value.push(imgPoint)
    }
    return
  }

  // Polygon düzenleme modunda: aktif bir vertex sürükleniyorsa, sadece
  // bu vertex'in konumunu güncelle.
  // Polygon/Polyline düzenleme modunda: aktif bir vertex sürükleniyorsa
  if (activeEditVertex.value && props.editingId != null) {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return

    const annId = activeEditVertex.value.annId
    const idx = activeEditVertex.value.idx
    const ann = props.annotations.find((a) => a.id === annId) as
      | PolygonAnn
      | PolylineAnn
      | undefined
    if (!ann || (ann.type !== 'polygon' && ann.type !== 'polyline')) return

    const nextPoints = ann.points.map((p, i) =>
      i === idx
        ? {
            x: imgPoint.x,
            y: imgPoint.y
          }
        : p
    )

    emit('update-annotation-state', { id: annId, patch: { points: nextPoints } })
    return
  }

  // Yarıçap düzenleme modunda (Keypoint/Circle)
  if (activeEditRadius.value && props.editingId != null) {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return

    const annId = activeEditRadius.value.annId
    const ann = props.annotations.find((a) => a.id === annId) as CircleAnn | KeypointAnn | undefined
    if (!ann) return

    let cx = 0
    let cy = 0
    if (ann.type === 'circle') {
      cx = ann.cx
      cy = ann.cy
    } else if (ann.type === 'keypoint') {
      cx = ann.x
      cy = ann.y
    } else {
      return
    }

    const dx = imgPoint.x - cx
    const dy = imgPoint.y - cy
    const newR = Math.sqrt(dx * dx + dy * dy)

    emit('update-annotation-state', { id: annId, patch: { r: newR } })
    return
  }

  if (isDrawing.value && drawingShape.value === 'bbox' && drawingStart.value) {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return
    const x = Math.min(imgPoint.x, drawingStart.value.x)
    const y = Math.min(imgPoint.y, drawingStart.value.y)
    const width = Math.abs(imgPoint.x - drawingStart.value.x)
    const height = Math.abs(imgPoint.y - drawingStart.value.y)
    tempBBox.value = { x, y, width, height }
    return
  }

  if (isDrawing.value && drawingShape.value === 'circle' && drawingStart.value) {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return
    const dx = imgPoint.x - drawingStart.value.x
    const dy = imgPoint.y - drawingStart.value.y
    const r = Math.sqrt(dx * dx + dy * dy)
    tempCircle.value = { cx: drawingStart.value.x, cy: drawingStart.value.y, r }
    return
  }

  if (
    isDrawing.value &&
    (drawingShape.value === 'polygon' || drawingShape.value === 'polyline') &&
    polyPoints.value.length >= 1
  ) {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return
    tempPolyPoint.value = { x: imgPoint.x, y: imgPoint.y }
    return
  }
}

const finishDrawing = (): void => {
  if (isDrawing.value) {
    if (drawingShape.value === 'bbox' && drawingStart.value && tempBBox.value) {
      const { x, y, width, height } = tempBBox.value
      if (width > 5 && height > 5) {
        const ann: BBox = {
          id: Date.now(),
          type: 'bbox',
          label: props.activeLabel,
          x,
          y,
          width,
          height
        }
        emit('create-annotation', ann)
      }
    } else if (drawingShape.value === 'circle' && drawingStart.value && tempCircle.value) {
      const { cx, cy, r } = tempCircle.value
      if (r > 3) {
        const ann: CircleAnn = {
          id: Date.now(),
          type: 'circle',
          label: props.activeLabel,
          cx,
          cy,
          r
        }
        emit('create-annotation', ann)
      }
    } else if (
      (drawingShape.value === 'polygon' || drawingShape.value === 'polyline') &&
      polyPoints.value.length >= (drawingShape.value === 'polygon' ? 3 : 2)
    ) {
      const base = {
        id: Date.now(),
        label: props.activeLabel,
        points: polyPoints.value.map((p) => ({ x: p.x, y: p.y }))
      }
      if (drawingShape.value === 'polygon') {
        const ann: PolygonAnn = {
          ...base,
          type: 'polygon'
        }
        emit('create-annotation', ann)
      } else {
        const ann: PolylineAnn = {
          ...base,
          type: 'polyline'
        }
        emit('create-annotation', ann)
      }
    }
  }

  isDrawing.value = false
  drawingShape.value = null
  drawingStart.value = null
  tempBBox.value = null
  polyPoints.value = []
  tempPolyPoint.value = null
  tempCircle.value = null
}

const handleMouseUp = (e: KonvaEventObject<MouseEvent>): void => {
  const evt: MouseEvent | undefined = e.evt

  // SAM Drawing Finish
  if (props.activeTool === 'sam' && isSamDrawing.value) {
    isSamDrawing.value = false
    const path = samPath.value
    samPath.value = [] // Clear immediately for visual, process path below

    if (path.length > 0) {
      const first = path[0]
      const last = path[path.length - 1]

      let totalDist = 0
      for (let i = 1; i < path.length; i++) {
        totalDist += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
      }

      const CLICK_THRESHOLD = 5
      const LOOP_THRESHOLD = 30

      if (totalDist < CLICK_THRESHOLD) {
        emit('sam-click', { imgX: first.x, imgY: first.y })
      } else {
        // Check if Closed Loop (Encircle) -> Box
        const distStartEnd = Math.hypot(first.x - last.x, first.y - last.y)

        if (distStartEnd < LOOP_THRESHOLD && totalDist > 50) {
          // Encircle -> Box Prompt
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
          for (const p of path) {
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
          }
          const points = [
            { x: minX, y: minY },
            { x: maxX, y: maxY }
          ]
          const labels = [2, 3]
          emit('sam-draw', { points, labels })
        } else {
          // Open Line -> Scribble -> Points Prompt
          const newPoints: { x: number; y: number }[] = [first]
          let lastAdded = first

          for (let i = 1; i < path.length; i++) {
            const p = path[i]
            const d = Math.hypot(p.x - lastAdded.x, p.y - lastAdded.y)
            if (d > 20) {
              newPoints.push(p)
              lastAdded = p
            }
          }
          if (lastAdded !== last) newPoints.push(last)

          const labels = newPoints.map(() => 1) // Foreground
          emit('sam-draw', { points: newPoints, labels })
        }
      }
    }
  }

  // BBox için sadece sol mouse'u bıraktığımızda çizimi bitiriyoruz.
  if (isDrawing.value && drawingShape.value === 'bbox' && evt?.button === 0) {
    finishDrawing()
  }

  // Circle için de sadece sol mouse'u bıraktığımızda çizimi bitiriyoruz.
  if (isDrawing.value && drawingShape.value === 'circle' && evt?.button === 0) {
    finishDrawing()
  }
  isPanning.value = false
  panStart.value = null

  // Eğer bir vertex düzenliyorsak, işlem bittiğinde state'i haber ver
  if (activeEditVertex.value) {
    emit('annotation-transform-end')
  }
  if (activeEditRadius.value) {
    emit('annotation-transform-end')
  }
  activeEditVertex.value = null
  activeEditRadius.value = null
  if (containerRef.value) {
    containerRef.value.style.cursor = ''
  }
  hoverCursor.value = null
}

const handleMouseLeave = (): void => {
  if (containerRef.value) {
    containerRef.value.style.cursor = ''
  }
  isPanning.value = false
  panStart.value = null
  activeEditVertex.value = null
  if (longPressTimer != null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
    longPressTargetId = null
  }
  emit('pointer-leave')
}

const clearLongPress = (): void => {
  if (longPressTimer != null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
    longPressTargetId = null
  }
}

const getDistToSegment = (
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): { dist: number; proj: { x: number; y: number } } => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2
  if (l2 === 0) return { dist: Math.hypot(p.x - v.x, p.y - v.y), proj: v }
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }
  return { dist: Math.hypot(p.x - proj.x, p.y - proj.y), proj }
}

const handleVertexShapeMouseDown = (
  id: number,
  points: { x: number; y: number }[],
  e: KonvaEventObject<MouseEvent>
): void => {
  const evt = e.evt
  if (evt.button !== 0) return

  // SAM veya Shapes modundayken edit moduna geçişi destekle
  if (props.activeTool === 'sam' || props.activeTool === 'shapes') {
    didTriggerLongPress.value = false
    e.cancelBubble = true

    // EĞER bu polygon zaten düzenleniyorsa (editingId === id), tıklanan yere nokta ekle
    if (props.editingId === id) {
      const stage = e.target?.getStage?.()
      if (!stage) return
      const imgPoint = getClampedImagePoint(stage)
      if (!imgPoint) return

      // En uygun ekleme noktasını bul (en yakın segment)
      let minDist = Infinity
      let insertIndex = -1
      // Varsayılan olarak tıklanan noktayı alacağız, ama proje edilmiş noktayı (çizgi üstü) kullanmak daha şık olur.
      let newPoint = { x: imgPoint.x, y: imgPoint.y }

      for (let i = 0; i < points.length; i++) {
        const p1 = points[i]
        const p2 = points[(i + 1) % points.length] // Döngüsel

        const { dist, proj } = getDistToSegment(imgPoint, p1, p2)
        if (dist < minDist) {
          minDist = dist
          insertIndex = i + 1
          newPoint = proj
        }
      }

      if (insertIndex !== -1) {
        const newPoints = [...points.slice(0, insertIndex), newPoint, ...points.slice(insertIndex)]

        emit('update-annotation-state', { id, patch: { points: newPoints } })

        // Eklediğimiz noktayı hemen düzenlemeye (drag) başla
        activeEditVertex.value = { annId: id, idx: insertIndex }
      }
      return
    }

    // EĞER düzenlenmiyorsa, uzun basma ile düzenleme modu isteği gönder
    clearLongPress()
    longPressTargetId = id
    longPressTimer = window.setTimeout(() => {
      if (longPressTargetId === id) {
        didTriggerLongPress.value = true
        emit('edit-request', id)
      }
      clearLongPress()
    }, LONG_PRESS_MS)
  }
}

const handleGenericShapeMouseDown = (id: number, e: KonvaEventObject<MouseEvent>): void => {
  const evt = e.evt
  if (evt.button !== 0) return

  if (props.activeTool === 'sam' || props.activeTool === 'shapes') {
    didTriggerLongPress.value = false

    // Edit modundaysak işlem yapma (Konva halleder)
    if (props.editingId === id) {
      return
    }

    clearLongPress()
    longPressTargetId = id
    longPressTimer = window.setTimeout(() => {
      if (longPressTargetId === id) {
        didTriggerLongPress.value = true
        emit('edit-request', id)
      }
      clearLongPress()
    }, LONG_PRESS_MS)
  }
}

const handleTransformEnd = (id: number, e: KonvaEventObject<Event>): void => {
  const node = e.target
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()

  // Reset scale, apply to diff props
  node.scaleX(1)
  node.scaleY(1)

  // BBox (Rect)
  if (node.getClassName() === 'Rect') {
    const width = node.width() * scaleX
    const height = node.height() * scaleY
    emit('update-annotation-state', {
      id,
      patch: {
        x: node.x(),
        y: node.y(),
        width: Math.abs(width), // Negatif scale koruması
        height: Math.abs(height)
      }
    })
  }
  // Circle (radius)
  else if (node.getClassName() === 'Circle') {
    // Radius scale
    const oldR = node.attrs.radius || 0
    // ortalama scale
    const s = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
    emit('update-annotation-state', {
      id,
      patch: {
        x: node.x(), // Keypoint ise circle render ediyoruz, x/y merkez
        y: node.y(),
        cx: node.x(), // Circle ise cx/cy
        cy: node.y(),
        r: oldR * s
      }
    })
  }
}

const handleDragEnd = (id: number, e: KonvaEventObject<DragEvent>): void => {
  dragTargetId.value = null
  const node = e.target
  emit('update-annotation-state', {
    id,
    patch: {
      x: node.x(),
      y: node.y(),
      cx: node.x(),
      cy: node.y()
    }
  })
}

const handlePolygonMouseUp = (): void => {
  clearLongPress()
}

const handleAnnClick = (id: number, e: KonvaEventObject<MouseEvent>): void => {
  // Her modda (select / shapes / sam) eski etiketleri seçilebilir yap.
  e.cancelBubble = true
  emit('select-annotation', id)
}

const handlePolygonClick = (id: number, e: KonvaEventObject<MouseEvent>): void => {
  // SAM modunda polygon'a normal tıklama hiçbir şey yapmamalı (yeni SAM, seçim, mod değişimi yok).
  if (props.activeTool === 'sam') {
    e.cancelBubble = true
    return
  }

  // Diğer araçlarda (select / shapes) polygon'a tıklama seçimi günceller.
  // Bu click'in stage @click'ine gitmesini engellemek için bubble'ı kesiyoruz.
  e.cancelBubble = true
  emit('select-annotation', id)
}

const handleStageClick = (): void => {
  // Select/pan modundayken sahnenin boş bir yerine tıklanınca seçimi temizle.
  if (props.activeTool !== 'select') return
  emit('select-annotation', null)
}

// Dışarıdan kontrol için basit bir API expose edelim
const fitToContainer = (): void => {
  hasUserTransform.value = false
  handleResize(true)
}

const zoomBy = (delta: number): void => {
  const stageScaleCurrent = stageScale.value || 1
  const container = containerRef.value
  if (!container) return

  const cw = container.clientWidth
  const ch = container.clientHeight
  const center = { x: cw / 2, y: ch / 2 }

  const oldScale = stageScaleCurrent
  const rawScale = oldScale * (1 + delta)
  const limit = minScale.value || MIN_SCALE
  const newScale = Math.max(limit, Math.min(rawScale, 10))

  const mousePointTo = {
    x: (center.x - stageX.value) / oldScale,
    y: (center.y - stageY.value) / oldScale
  }

  stageScale.value = newScale
  stageX.value = center.x - mousePointTo.x * newScale
  stageY.value = center.y - mousePointTo.y * newScale
  hasUserTransform.value = true
  clampStagePosition()
}

const handleVertexMouseDown = (
  annId: number,
  idx: number,
  e: KonvaEventObject<MouseEvent>
): void => {
  const evt = e.evt
  if (evt.button !== 0) return
  // Sadece bu vertex'i düzenlemek için işaretle; asıl güncelleme stage mousemove içinde yapılır.
  e.cancelBubble = true
  activeEditVertex.value = { annId, idx }
}

const handleRadiusMouseDown = (annId: number, e: KonvaEventObject<MouseEvent>): void => {
  const evt = e.evt
  if (evt.button !== 0) return
  e.cancelBubble = true
  activeEditRadius.value = { annId }
}

const handleGenericShapeDragMove = (annId: number, e: KonvaEventObject<DragEvent>): void => {
  const node = e.target
  const stage = node.getStage()
  if (!stage) return

  // Keypoint handle logic removed (visuals deleted)

  // Update Circle Radius Handle
  const circleHandle = stage.findOne(`.circle-radius-handle-${annId}`)
  if (circleHandle) {
    const ann = props.annotations.find((a) => a.id === annId) as CircleAnn
    if (ann) {
      circleHandle.position({
        x: node.x() + ann.r,
        y: node.y()
      })
    }
  }
}

const handleGenericShapeDragStart = (annId: number): void => {
  dragTargetId.value = annId
}

defineExpose({
  fitToContainer,
  zoomBy,
  hasActiveDrawing: () => {
    if (!isDrawing.value) return false

    if (drawingShape.value === 'polygon' || drawingShape.value === 'polyline') {
      return polyPoints.value.length > 0
    }

    if (drawingShape.value === 'bbox') {
      return !!tempBBox.value
    }

    if (drawingShape.value === 'circle') {
      return !!tempCircle.value
    }

    return false
  },
  finishCurrentShape: finishDrawing,
  cancelCurrentShape: () => {
    isDrawing.value = false
    drawingShape.value = null
    drawingStart.value = null
    tempBBox.value = null
    polyPoints.value = []
    tempPolyPoint.value = null
    tempCircle.value = null
    isPanning.value = false
    panStart.value = null
  }
})

// Transformer Attachment Logic
const transformerRef = ref<any>(null)

watch(
  () => props.editingId,
  (newId) => {
    const tr = transformerRef.value?.getNode()
    if (!tr) return

    if (!newId) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }

    setTimeout(() => {
      const stage = tr.getStage()
      const node = stage?.findOne(`.ann-${newId}`)

      if (node) {
        if (node.getClassName() === 'Rect') {
          // BBox
          tr.keepRatio(false)
          tr.enabledAnchors([
            'top-left',
            'top-center',
            'top-right',
            'middle-right',
            'middle-left',
            'bottom-left',
            'bottom-center',
            'bottom-right'
          ])
          tr.nodes([node])
          tr.getLayer()?.batchDraw()
        } else {
          // Keypoint ve Circle için artık Transformer kullanmıyoruz, custom handle var.
          tr.nodes([])
        }
      } else {
        tr.nodes([])
      }
    }, 50)
  },
  { immediate: true }
)
</script>

<template>
  <div ref="containerRef" class="w-full h-full" :style="stageStyle" @contextmenu.prevent>
    <v-stage
      v-if="stageWidth && stageHeight && imageConfig"
      :config="{
        width: stageWidth,
        height: stageHeight,
        x: stageX,
        y: stageY,
        scaleX: stageScale,
        scaleY: stageScale
      }"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseLeave"
      @click="handleStageClick"
    >
      <v-layer>
        <v-image v-bind="imageConfig" />

        <v-rect
          v-for="ann in bboxAnnotations"
          :key="ann.id"
          :name="`ann-${ann.id}`"
          :x="ann.x"
          :y="ann.y"
          :width="ann.width"
          :height="ann.height"
          :stroke="ann.id === selectedId ? '#1d4ed8' : '#2563eb'"
          :stroke-width="computedStrokeWidth"
          :config="{
            strokeScaleEnabled: false
          }"
          :shadow-color="ann.id === selectedId ? '#1d4ed8' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :fill="
            ann.id === editingId
              ? 'rgba(236,72,153,0.15)'
              : ann.id === selectedId
                ? 'rgba(37,99,235,0.18)'
                : 'rgba(37,99,235,0.1)'
          "
          :draggable="ann.id === editingId"
          @click="(e) => handleAnnClick(ann.id, e)"
          @mousedown="(e) => handleGenericShapeMouseDown(ann.id, e)"
          @mouseup="handlePolygonMouseUp"
          @transformend="(e) => handleTransformEnd(ann.id, e)"
          @dragend="(e) => handleDragEnd(ann.id, e)"
        />

        <v-rect
          v-if="tempBBox"
          :x="tempBBox.x"
          :y="tempBBox.y"
          :width="tempBBox.width"
          :height="tempBBox.height"
          :config="{
            stroke: '#60a5fa',
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false,
            dash: [6, 4],
            fill: 'rgba(37,99,235,0.08)'
          }"
        />

        <!-- Circle geçici çizim -->
        <v-circle
          v-if="isDrawing && drawingShape === 'circle' && tempCircle"
          :x="tempCircle.cx"
          :y="tempCircle.cy"
          :radius="tempCircle.r"
          :config="{
            stroke: '#60a5fa',
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false,
            dash: [6, 4],
            fill: 'rgba(37,99,235,0.08)'
          }"
        />

        <!-- SAM Drawing Path -->
        <v-line
          v-if="isSamDrawing && samPath.length > 0"
          :points="samPath.flatMap((p) => [p.x, p.y])"
          :config="{
            stroke: '#ef4444',
            strokeWidth: 2,
            strokeScaleEnabled: false,
            listening: false
          }"
        />

        <!-- Polygon / Polyline geçici çizim -->
        <v-line
          v-if="
            isDrawing &&
            (drawingShape === 'polygon' || drawingShape === 'polyline') &&
            polyPoints.length >= 1
          "
          :points="
            [...polyPoints, ...(tempPolyPoint ? [tempPolyPoint] : [])].flatMap((p) => [p.x, p.y])
          "
          :closed="drawingShape === 'polygon'"
          :config="{
            stroke: '#60a5fa',
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false,
            dash: [6, 4],
            fill: drawingShape === 'polygon' ? 'rgba(96,165,250,0.15)' : 'transparent'
          }"
        />

        <v-line
          v-for="ann in polygonAnnotations"
          :key="ann.id"
          :points="ann.points.flatMap((p) => [p.x, p.y])"
          :closed="true"
          :stroke="ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : '#f97316'"
          :config="{
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false,
            hitStrokeWidth: 40
          }"
          :shadow-color="
            ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : undefined
          "
          :shadow-blur="ann.id === editingId || ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === editingId || ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :fill="
            ann.id === editingId
              ? 'rgba(236,72,153,0.25)'
              : ann.id === selectedId
                ? 'rgba(249,115,22,0.2)'
                : 'rgba(249,115,22,0.15)'
          "
          @click="(e) => handlePolygonClick(ann.id, e)"
          @mousedown="(e) => handleVertexShapeMouseDown(ann.id, ann.points, e)"
          @mouseup="handlePolygonMouseUp"
        />

        <!-- Polygon düzenleme modu: vertex handle'ları (her zaman polygonların ÜSTÜNDE) -->
        <template v-if="activeEditingAnnotation?.type === 'polygon'">
          <v-circle
            v-for="(p, idx) in activeEditingAnnotation.points"
            :key="`edit-handle-${activeEditingAnnotation.id}-${idx}`"
            :x="p.x"
            :y="p.y"
            fill="#ffffff"
            stroke="#ec4899"
            :stroke-width="1.5"
            :strokeScaleEnabled="false"
            :radius="5 / (stageScale || 1)"
            @mousedown="(e) => handleVertexMouseDown(activeEditingAnnotation.id, idx, e)"
          />
        </template>

        <v-line
          v-for="ann in polylineAnnotations"
          :key="ann.id"
          :points="ann.points.flatMap((p) => [p.x, p.y])"
          :closed="false"
          :stroke="ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : '#7c3aed'"
          :config="{
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false,
            hitStrokeWidth: 40
          }"
          :shadow-color="
            ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : undefined
          "
          :shadow-blur="ann.id === editingId || ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === editingId || ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          @click="(e) => handlePolygonClick(ann.id, e)"
          @mousedown="(e) => handleVertexShapeMouseDown(ann.id, ann.points, e)"
          @mouseup="handlePolygonMouseUp"
        />

        <!-- Polyline edit handles -->
        <template v-if="activeEditingAnnotation?.type === 'polyline'">
          <v-circle
            v-for="(p, idx) in activeEditingAnnotation.points"
            :key="`edit-handle-line-${activeEditingAnnotation.id}-${idx}`"
            :x="p.x"
            :y="p.y"
            fill="#ffffff"
            stroke="#ec4899"
            :stroke-width="1.5"
            :strokeScaleEnabled="false"
            :radius="5 / (stageScale || 1)"
            @mousedown="(e) => handleVertexMouseDown(activeEditingAnnotation.id, idx, e)"
          />
        </template>

        <v-circle
          v-for="ann in keypointAnnotations"
          :key="ann.id"
          :name="`ann-${ann.id}`"
          :x="ann.x"
          :y="ann.y"
          :radius="
            ann.id === selectedId ? computedStyles.keypointRadius : computedStyles.keypointRadius
          "
          :fill="ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#facc15' : '#eab308'"
          :shadow-color="
            ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#facc15' : undefined
          "
          :shadow-blur="ann.id === editingId || ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === editingId || ann.id === selectedId ? 0.6 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :opacity="dragTargetId === ann.id ? 0.5 : 1"
          :draggable="ann.id === editingId"
          @click="(e) => handleAnnClick(ann.id, e)"
          @mousedown="(e) => handleGenericShapeMouseDown(ann.id, e)"
          @mouseup="handlePolygonMouseUp"
          @transformend="(e) => handleTransformEnd(ann.id, e)"
          @dragend="(e) => handleDragEnd(ann.id, e)"
          @dragstart="() => handleGenericShapeDragStart(ann.id)"
          @dragmove="(e) => handleGenericShapeDragMove(ann.id, e)"
        />

        <v-circle
          v-for="ann in circleAnnotations"
          :key="ann.id"
          :name="`ann-${ann.id}`"
          :x="ann.cx"
          :y="ann.cy"
          :radius="ann.r"
          :stroke="ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : '#eab308'"
          :config="{
            strokeWidth: computedStrokeWidth,
            strokeScaleEnabled: false
          }"
          :shadow-color="ann.id === selectedId ? '#db2777' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :fill="ann.id === editingId ? 'rgba(236,72,153,0.22)' : 'rgba(236,72,153,0.15)'"
          :draggable="ann.id === editingId"
          @click="(e) => handleAnnClick(ann.id, e)"
          @mousedown="(e) => handleGenericShapeMouseDown(ann.id, e)"
          @mouseup="handlePolygonMouseUp"
          @transformend="(e) => handleTransformEnd(ann.id, e)"
          @dragend="(e) => handleDragEnd(ann.id, e)"
          @dragmove="(e) => handleGenericShapeDragMove(ann.id, e)"
        />

        <!-- Circle Radius Visual + Handle (Edit Mode) (Circle kendi radiusuyla render olduğu için extra circle gerek yok, sadece handle) -->
        <template v-if="activeEditingAnnotation?.type === 'circle'">
          <v-circle
            :key="`circle-radius-handle-${activeEditingAnnotation.id}`"
            :name="`circle-radius-handle-${activeEditingAnnotation.id}`"
            :x="activeEditingAnnotation.cx + activeEditingAnnotation.r"
            :y="activeEditingAnnotation.cy"
            :radius="6 / (stageScale || 1)"
            fill="#ffffff"
            stroke="#ec4899"
            :stroke-width="1.5"
            :strokeScaleEnabled="false"
            @mousedown="(e) => handleRadiusMouseDown(activeEditingAnnotation.id, e)"
            @mouseenter="
              () => {
                hoverCursor = 'ew-resize'
              }
            "
            @mouseleave="
              () => {
                hoverCursor = null
              }
            "
          />
        </template>

        <!-- Generic Transformer (Sadece BBox için) -->
        <v-transformer
          ref="transformerRef"
          :config="{
            rotateEnabled: false,
            keepRatio: false,
            anchorSize: 10,
            borderStroke: '#ec4899',
            anchorStroke: '#ec4899',
            anchorFill: '#ffffff',
            ignoreStroke: true
          }"
        />
      </v-layer>
    </v-stage>
  </div>
</template>
