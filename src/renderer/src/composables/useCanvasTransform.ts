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
  const updateTransform = (): void => {
    if (!canvasEl.value || !annotationsSvg.value) return
    const t = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`
    canvasEl.value.style.transform = t
    annotationsSvg.value.style.transform = t
  }

  const fitToScreen = (): void => {
    if (!canvasEl.value || !annotationsSvg.value) return
    const cw = canvasEl.value.parentElement?.clientWidth ?? 0
    const ch = canvasEl.value.parentElement?.clientHeight ?? 0
    const iw = state.img.naturalWidth || canvasEl.value.width
    const ih = state.img.naturalHeight || canvasEl.value.height
    if (!cw || !ch || !iw || !ih) return

    canvasEl.value.width = iw
    canvasEl.value.height = ih
    annotationsSvg.value.setAttribute('viewBox', `0 0 ${iw} ${ih}`)
    const s = Math.min(cw / iw, ch / ih) * 0.98
    state.scale = Number.isFinite(s) && s > 0 ? s : 1
    state.translateX = (cw - iw * state.scale) / 2
    state.translateY = (ch - ih * state.scale) / 2

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
    const newScale = Math.max(0.05, Math.min(state.scale * (1 + delta), 10))

    state.translateX = mouseX - worldX * newScale
    state.translateY = mouseY - worldY * newScale
    state.scale = newScale
    updateTransform()
  }

  return { updateTransform, fitToScreen, zoom }
}
