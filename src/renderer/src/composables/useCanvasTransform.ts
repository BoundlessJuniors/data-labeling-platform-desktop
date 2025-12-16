import type { Ref } from 'vue'
interface CanvasTransformState {
  img: HTMLImageElement
  scale: number
  translateX: number
  translateY: number
}

export function useCanvasTransform(
  state: CanvasTransformState,
  canvasEl: Ref<HTMLCanvasElement | null>,
  annotationsSvg: Ref<SVGSVGElement | null>
): {
  updateTransform: () => void
  fitToScreen: () => void
  zoom: (delta: number, clientX: number, clientY: number) => void
} {
  const MIN_SCALE = 0.6

  const updateTransform = (): void => {
    if (!canvasEl.value || !annotationsSvg.value) return
    // Ortası canvasContainer'ın merkezi olacak şekilde ölçekle ve kaydır
    const t = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`
    canvasEl.value.style.transform = t
    annotationsSvg.value.style.transform = t
  }

  const fitToScreen = (): void => {
    if (!canvasEl.value || !annotationsSvg.value) return
    const container = canvasEl.value.parentElement
    if (!container) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = state.img.naturalWidth || canvasEl.value.width
    const ih = state.img.naturalHeight || canvasEl.value.height
    if (!cw || !ch || !iw || !ih) return

    canvasEl.value.width = iw
    canvasEl.value.height = ih
    annotationsSvg.value.setAttribute('viewBox', `0 0 ${iw} ${ih}`)

    const fitScale = Math.min(cw / iw, ch / ih) * 0.98
    state.scale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1

    const drawnW = iw * state.scale
    const drawnH = ih * state.scale

    // Container merkezine göre ortala (origin 0,0 iken)
    state.translateX = (cw - drawnW) / 2
    state.translateY = (ch - drawnH) / 2

    console.log('[fitToScreen]', {
      containerWidth: cw,
      containerHeight: ch,
      imageWidth: iw,
      imageHeight: ih,
      fitScale,
      appliedScale: state.scale,
      drawnWidth: drawnW,
      drawnHeight: drawnH,
      translateX: state.translateX,
      translateY: state.translateY
    })

    const ctx = canvasEl.value.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, iw, ih)
    ctx.drawImage(state.img, 0, 0)

    updateTransform()
  }

  const zoom = (delta: number, clientX: number, clientY: number): void => {
    const container = canvasEl.value?.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (!Number.isFinite(state.scale) || state.scale <= 0) fitToScreen()

    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    const worldX = (mouseX - state.translateX) / state.scale
    const worldY = (mouseY - state.translateY) / state.scale
    // Zoom-out sınırı: görüntünün aşırı küçülmemesi için minimum ölçek
    const newScale = Math.max(MIN_SCALE, Math.min(state.scale * (1 + delta), 10))

    state.translateX = mouseX - worldX * newScale
    state.translateY = mouseY - worldY * newScale
    state.scale = newScale
    updateTransform()
  }

  return { updateTransform, fitToScreen, zoom }
}
