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

const props = defineProps<{
  imageSrc: string | null
  annotations: Annotation[]
  activeTool: 'select' | 'sam' | 'shapes'
  activeShape: 'bbox' | 'polygon' | 'polyline' | 'keypoint' | 'circle'
  activeLabel: string | null
  selectedId: number | null
  // Düzenleme modu için, şu an düzenlenen polygon id'si (yoksa null)
  editingId?: number | null
}>()

const emit = defineEmits<{
  (e: 'create-annotation', ann: Annotation): void
  (e: 'select-annotation', id: number | null): void
  (
    e: 'pointer-move',
    payload: {
      screenX: number
      screenY: number
      imgX: number | null
      imgY: number | null
    }
  ): void
  (e: 'pointer-leave'): void
  (
    e: 'sam-click',
    payload: {
      imgX: number
      imgY: number
    }
  ): void
  (e: 'sam-edit-request', id: number): void
  (
    e: 'update-annotation-geometry',
    payload: { id: number; points: { x: number; y: number }[] }
  ): void
}>()

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

const imageObj = ref<HTMLImageElement | null>(null)

const LONG_PRESS_MS = 400
let longPressTimer: number | null = null
let longPressTargetId: number | null = null

// SAM düzenleme modunda, hangi vertex'in sürüklendiğini takip etmek için
const activeEditVertex = ref<{ annId: number; idx: number } | null>(null)

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

  // SAM aracı aktifken: tek tıklamada imaj koordinatını dışarı bildir,
  // pan veya shapes çizimine geçme.
  if (props.activeTool === 'sam') {
    // Düzenleme modundayken (editingId doluyken) sahneye tıklayınca yeni SAM etiketi üretme.
    // Bu durumda sadece vertex handle'ları (drag) aktif kalmalı.
    if (props.editingId != null) return

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
      emit('sam-click', { imgX: imgPoint.x, imgY: imgPoint.y })
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

  // SAM polygon düzenleme modunda: aktif bir vertex sürükleniyorsa, sadece
  // bu vertex'in konumunu güncelle.
  if (activeEditVertex.value && props.editingId != null && props.activeTool === 'sam') {
    const imgPoint = getClampedImagePoint(stage)
    if (!imgPoint) return

    const annId = activeEditVertex.value.annId
    const idx = activeEditVertex.value.idx
    const ann = polygonAnnotations.value.find((a) => a.id === annId)
    if (!ann) return

    const nextPoints = ann.points.map((p, i) =>
      i === idx
        ? {
            x: imgPoint.x,
            y: imgPoint.y
          }
        : p
    )

    emit('update-annotation-geometry', { id: annId, points: nextPoints })
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
  activeEditVertex.value = null
}

const handleMouseLeave = (): void => {
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

const handlePolygonMouseDown = (id: number, e: KonvaEventObject<MouseEvent>): void => {
  const evt = e.evt
  if (evt.button !== 0) return

  // SAM modundayken: uzun basma ile düzenleme isteği gönder
  if (props.activeTool === 'sam') {
    // Bu tıklamanın stage @mousedown handler'ına gitmesini engelle ki
    // aynı noktada yeni SAM etiketi üretilmesin.
    e.cancelBubble = true
    // Bu tıklamanın stage @mousedown handler'ına gitmesini engelle ki
    // SAM yeni bir maske üretmesin.
    clearLongPress()
    longPressTargetId = id
    longPressTimer = window.setTimeout(() => {
      if (longPressTargetId === id) {
        emit('sam-edit-request', id)
      }
      clearLongPress()
    }, LONG_PRESS_MS)
  }
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
</script>

<template>
  <div ref="containerRef" class="w-full h-full" @contextmenu.prevent>
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
          :x="ann.x"
          :y="ann.y"
          :width="ann.width"
          :height="ann.height"
          :stroke="ann.id === selectedId ? '#1d4ed8' : '#2563eb'"
          :stroke-width="ann.id === selectedId ? 2 : 0.75"
          :shadow-color="ann.id === selectedId ? '#1d4ed8' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :fill="ann.id === selectedId ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.1)'"
          @click="(e) => handleAnnClick(ann.id, e)"
        />

        <v-rect
          v-if="tempBBox"
          :x="tempBBox.x"
          :y="tempBBox.y"
          :width="tempBBox.width"
          :height="tempBBox.height"
          stroke="#60a5fa"
          :stroke-width="0.75"
          :dash="[6, 4]"
          fill="rgba(37,99,235,0.08)"
        />

        <!-- Circle geçici çizim -->
        <v-circle
          v-if="isDrawing && drawingShape === 'circle' && tempCircle"
          :x="tempCircle.cx"
          :y="tempCircle.cy"
          :radius="tempCircle.r"
          stroke="#60a5fa"
          :stroke-width="0.75"
          :dash="[6, 4]"
          fill="rgba(37,99,235,0.08)"
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
          stroke="#60a5fa"
          :stroke-width="0.75"
          :dash="[6, 4]"
          :fill="drawingShape === 'polygon' ? 'rgba(96,165,250,0.15)' : 'transparent'"
        />

        <v-line
          v-for="ann in polygonAnnotations"
          :key="ann.id"
          :points="ann.points.flatMap((p) => [p.x, p.y])"
          :closed="true"
          :stroke="ann.id === editingId ? '#db2777' : ann.id === selectedId ? '#ea580c' : '#f97316'"
          :stroke-width="ann.id === editingId ? 2.5 : ann.id === selectedId ? 2 : 0.75"
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
          @mousedown="(e) => handlePolygonMouseDown(ann.id, e)"
          @mouseup="handlePolygonMouseUp"
        />

        <!-- Polygon düzenleme modu: vertex handle'ları (her zaman polygonların ÜSTÜNDE) -->
        <template v-for="ann in polygonAnnotations" :key="`edit-${ann.id}`">
          <v-circle
            v-if="editingId === ann.id"
            v-for="(p, idx) in ann.points"
            :key="`edit-handle-${ann.id}-${idx}`"
            :x="p.x"
            :y="p.y"
            :radius="5"
            fill="#ffffff"
            stroke="#ec4899"
            :stroke-width="1.5"
            @mousedown="(e) => handleVertexMouseDown(ann.id, idx, e)"
          />
        </template>

        <v-line
          v-for="ann in polylineAnnotations"
          :key="ann.id"
          :points="ann.points.flatMap((p) => [p.x, p.y])"
          :closed="false"
          :stroke="ann.id === selectedId ? '#16a34a' : '#22c55e'"
          :stroke-width="ann.id === selectedId ? 2 : 0.75"
          :shadow-color="ann.id === selectedId ? '#16a34a' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          @click="(e) => handleAnnClick(ann.id, e)"
        />

        <v-circle
          v-for="ann in keypointAnnotations"
          :key="ann.id"
          :x="ann.x"
          :y="ann.y"
          :radius="ann.id === selectedId ? 4.5 : 3.5"
          :fill="ann.id === selectedId ? '#facc15' : '#eab308'"
          :shadow-color="ann.id === selectedId ? '#facc15' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.8 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          @click="(e) => handleAnnClick(ann.id, e)"
        />

        <v-circle
          v-for="ann in circleAnnotations"
          :key="ann.id"
          :x="ann.cx"
          :y="ann.cy"
          :radius="ann.r"
          :stroke="ann.id === selectedId ? '#db2777' : '#ec4899'"
          :stroke-width="ann.id === selectedId ? 2 : 0.75"
          :shadow-color="ann.id === selectedId ? '#db2777' : undefined"
          :shadow-blur="ann.id === selectedId ? 8 : 0"
          :shadow-opacity="ann.id === selectedId ? 0.7 : 0"
          :shadow-offset-x="0"
          :shadow-offset-y="0"
          :fill="ann.id === selectedId ? 'rgba(236,72,153,0.22)' : 'rgba(236,72,153,0.15)'"
          @click="(e) => handleAnnClick(ann.id, e)"
        />
      </v-layer>
    </v-stage>
  </div>
</template>
