// src/composables/useCanvasInteractions.ts
import type { Ref } from 'vue'
import type {
  BBox,
  CircleAnn,
  KeypointAnn,
  PolygonAnn,
  PolylineAnn
} from '@renderer/types/annotation'
import { SVG_NS } from '@renderer/utils/dom'

export type CanvasState = {
  isDrawing: boolean
  isPanning: boolean
  drawingShape: string | null
  drawingStartX: number
  drawingStartY: number
  polyPoints: { x: number; y: number }[]
  lastUsedTool: string | null
  lastUsedShape: string | null
  activeLabel: string | null
  translateX: number
  translateY: number
  startPanX: number
  startPanY: number
  annotations: Array<BBox | CircleAnn | KeypointAnn | PolygonAnn | PolylineAnn | unknown>
}

export type CanvasDeps = {
  state: CanvasState
  canvasContainer: Ref<HTMLDivElement | null>
  canvasEl: Ref<HTMLCanvasElement | null>
  annotationsSvg: Ref<SVGSVGElement | null>
  crosshairH: Ref<HTMLDivElement | null>
  crosshairV: Ref<HTMLDivElement | null>
  coords: Ref<HTMLDivElement | null>

  // utility fonksiyonlar
  getImageCoordsFromEvent: (e: MouseEvent) => { imgX: number; imgY: number } | null
  recordHistory: () => void
  renderAnnotations: () => void
  updateTransform: () => void
  updateCursor: () => void
  commitPoly: () => void
}

export function useCanvasInteractions(deps: CanvasDeps): {
  attachCanvasInteractions: () => void
  detachCanvasInteractions: () => void
} {
  const {
    state,
    canvasContainer,
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
  } = deps

  let handleMouseDown: ((e: MouseEvent) => void) | null = null
  let handleMouseMove: ((e: MouseEvent) => void) | null = null
  let handleMouseUp: ((e: MouseEvent) => void) | null = null
  let handleMouseLeave: ((e: MouseEvent) => void) | null = null
  let handleContextMenu: ((e: Event) => void) | null = null
  let handleDblClick: (() => void) | null = null

  const finishPointer = (): void => {
    if (state.isDrawing && !state.isPanning) {
      if (state.drawingShape === 'bbox') {
        const temp = annotationsSvg.value?.querySelector('#temp-shape') as SVGRectElement | null
        if (temp) {
          const x = parseFloat(temp.getAttribute('x') ?? '0')
          const y = parseFloat(temp.getAttribute('y') ?? '0')
          const w = parseFloat(temp.getAttribute('width') ?? '0')
          const h = parseFloat(temp.getAttribute('height') ?? '0')

          if (w > 5 && h > 5) {
            const newAnn: BBox = {
              id: Date.now(),
              type: 'bbox',
              label: state.activeLabel ?? null,
              x,
              y,
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
      } else if (state.drawingShape === 'circle') {
        const temp = annotationsSvg.value?.querySelector('#temp-shape') as SVGCircleElement | null
        if (temp) {
          const r = parseFloat(temp.getAttribute('r') ?? '0')
          if (r > 3) {
            const newAnn: CircleAnn = {
              id: Date.now(),
              type: 'circle',
              label: state.activeLabel ?? null,
              cx: parseFloat(temp.getAttribute('cx') ?? '0'),
              cy: parseFloat(temp.getAttribute('cy') ?? '0'),
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
      } else if (state.drawingShape === 'polygon' || state.drawingShape === 'polyline') {
        if (canvasContainer.value) {
          canvasContainer.value.style.cursor = 'crosshair'
        }
      }
    }

    state.isPanning = false
    if (canvasContainer.value) {
      canvasContainer.value.classList.remove('panning')
    }
    updateCursor()
  }

  const attachCanvasInteractions = (): void => {
    const container = canvasContainer.value
    if (!container) return

    handleMouseDown = (e: MouseEvent): void => {
      const el = canvasContainer.value
      if (!el) return

      const isToolActive = el.classList.contains('tool-active')

      // Sağ tık – pan
      if (e.button === 2) {
        e.preventDefault()
        state.isPanning = true
        state.startPanX = e.clientX - state.translateX
        state.startPanY = e.clientY - state.translateY
        el.classList.add('panning')
        el.style.cursor = 'grabbing'
        return
      }

      // Sol tık dışı – ignore
      if (e.button !== 0) return

      // SAM modunda çizim yok
      if (state.lastUsedTool === 'sam') return

      if (isToolActive && state.lastUsedTool === 'shapes') {
        const imgCoords = getImageCoordsFromEvent(e)
        if (!imgCoords) return
        const { imgX, imgY } = imgCoords
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
          annotationsSvg.value?.appendChild(temp)
        } else if (shape === 'circle') {
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
          annotationsSvg.value?.appendChild(temp)
        } else if (shape === 'keypoint') {
          const kp: KeypointAnn = {
            id: Date.now(),
            type: 'keypoint',
            label: state.activeLabel ?? null,
            x: imgX,
            y: imgY
          }
          state.annotations.push(kp)
          recordHistory()
          renderAnnotations()
        } else if (shape === 'polygon' || shape === 'polyline') {
          if (!state.isDrawing || state.drawingShape !== shape) {
            state.isDrawing = true
            state.drawingShape = shape
            state.polyPoints = [{ x: imgX, y: imgY }]
            const temp = document.createElementNS(SVG_NS, 'polyline')
            temp.setAttribute('id', 'temp-shape')
            temp.setAttribute('stroke', '#ffc107')
            temp.setAttribute('stroke-width', '2')
            temp.setAttribute('fill', shape === 'polygon' ? 'rgba(255,193,7,0.08)' : 'none')
            temp.setAttribute('points', `${imgX},${imgY}`)
            annotationsSvg.value?.appendChild(temp)
            el.style.cursor = 'crosshair'
          } else {
            state.polyPoints.push({ x: imgX, y: imgY })
            const temp = annotationsSvg.value?.querySelector(
              '#temp-shape'
            ) as SVGPolylineElement | null
            if (temp) {
              temp.setAttribute('points', state.polyPoints.map((p) => `${p.x},${p.y}`).join(' '))
            }
          }
        }
      } else {
        // Pan
        state.isPanning = true
        state.startPanX = e.clientX - state.translateX
        state.startPanY = e.clientY - state.translateY
        el.classList.add('panning')
      }
    }

    handleMouseMove = (e: MouseEvent): void => {
      const containerRect = canvasContainer.value?.getBoundingClientRect()
      if (!containerRect) return

      const mouseXContainer = e.clientX - containerRect.left
      const mouseYContainer = e.clientY - containerRect.top

      if (crosshairH.value) crosshairH.value.style.top = `${mouseYContainer}px`
      if (crosshairV.value) crosshairV.value.style.left = `${mouseXContainer}px`

      const imgCoords = getImageCoordsFromEvent(e)
      if (!imgCoords) {
        if (coords.value) coords.value.textContent = 'X: -, Y: -'
        return
      }
      const { imgX, imgY } = imgCoords
      if (coords.value) {
        coords.value.textContent = `X: ${Math.round(imgX)}, Y: ${Math.round(imgY)}`
      }

      if (state.isPanning) {
        state.translateX = e.clientX - state.startPanX
        state.translateY = e.clientY - state.startPanY
        updateTransform()
      } else if (state.isDrawing) {
        if (state.drawingShape === 'bbox') {
          const temp = annotationsSvg.value?.querySelector('#temp-shape') as SVGRectElement | null
          if (!temp) return
          const x = Math.min(imgX, state.drawingStartX)
          const y = Math.min(imgY, state.drawingStartY)
          const w = Math.abs(imgX - state.drawingStartX)
          const h = Math.abs(imgY - state.drawingStartY)
          temp.setAttribute('x', String(x))
          temp.setAttribute('y', String(y))
          temp.setAttribute('width', String(w))
          temp.setAttribute('height', String(h))
        } else if (state.drawingShape === 'circle') {
          const temp = annotationsSvg.value?.querySelector('#temp-shape') as SVGCircleElement | null
          if (!temp) return
          const dx = imgX - state.drawingStartX
          const dy = imgY - state.drawingStartY
          const r = Math.sqrt(dx * dx + dy * dy)
          temp.setAttribute('r', String(r))
        } else if (state.drawingShape === 'polygon' || state.drawingShape === 'polyline') {
          const temp = annotationsSvg.value?.querySelector(
            '#temp-shape'
          ) as SVGPolylineElement | null
          if (!temp) return
          const pts = [...state.polyPoints, { x: imgX, y: imgY }]
          temp.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '))
        }
      }

      updateCursor()
    }

    handleMouseUp = (): void => {
      finishPointer()
    }

    handleMouseLeave = (): void => {
      finishPointer()
    }

    handleContextMenu = (e: Event): void => {
      const el = canvasContainer.value
      if (!el) return
      const isToolActive = el.classList.contains('tool-active')
      if (isToolActive) {
        e.preventDefault()
      }
    }

    handleDblClick = (): void => {
      commitPoly()
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('contextmenu', handleContextMenu)
    container.addEventListener('dblclick', handleDblClick)
  }

  const detachCanvasInteractions = (): void => {
    const container = canvasContainer.value
    if (!container) return

    if (handleMouseDown) container.removeEventListener('mousedown', handleMouseDown)
    if (handleMouseMove) container.removeEventListener('mousemove', handleMouseMove)
    if (handleMouseUp) container.removeEventListener('mouseup', handleMouseUp)
    if (handleMouseLeave) container.removeEventListener('mouseleave', handleMouseLeave)
    if (handleContextMenu) container.removeEventListener('contextmenu', handleContextMenu)
    if (handleDblClick) container.removeEventListener('dblclick', handleDblClick)

    handleMouseDown = null
    handleMouseMove = null
    handleMouseUp = null
    handleMouseLeave = null
    handleContextMenu = null
    handleDblClick = null
  }

  return { attachCanvasInteractions, detachCanvasInteractions }
}
