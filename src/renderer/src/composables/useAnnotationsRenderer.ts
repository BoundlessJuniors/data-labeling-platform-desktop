import type { Ref } from 'vue'
import type {
  Annotation,
  BBox,
  PolygonAnn,
  PolylineAnn,
  KeypointAnn,
  CircleAnn
} from '@renderer/types/annotation'
import { getAnnotationSvgStyle } from '@renderer/theme/annotationPalette'

type LabelerState = {
  selectedAnnotationId: number | null
  annotations: Annotation[]
  img: HTMLImageElement | null
}

type RendererRefs = {
  annotationsSvg: Ref<SVGSVGElement | null>
  annotationList: Ref<HTMLDivElement | null>
  deleteBtn: Ref<HTMLButtonElement | null>
  canvasEl: Ref<HTMLCanvasElement | null>
}

type UseAnnotationsRendererReturn = {
  renderAnnotations: () => void
  exportAnnotationsToImageSpace: () => Annotation[]
  clearSelection: () => void
  deleteSelected: () => void
  getImageCoordsFromEvent: (e: MouseEvent) => { imgX: number; imgY: number } | null
  updateDeleteButton: () => void
}

export function useAnnotationsRenderer(
  state: LabelerState,
  refs: RendererRefs,
  recordHistory: () => void
): UseAnnotationsRendererReturn {
  const SVG_NS = 'http://www.w3.org/2000/svg'

  function updateDeleteButton(): void {
    const btn = refs.deleteBtn.value
    if (!btn) return
    const noSelection = state.selectedAnnotationId == null
    const noAnns = state.annotations.length === 0
    btn.disabled = noSelection || noAnns
  }

  function renderAnnotations(): void {
    const svgEl = refs.annotationsSvg.value
    const listEl = refs.annotationList.value
    if (!svgEl || !listEl) return

    svgEl.innerHTML = ''
    listEl.innerHTML = ''

    console.log('RENDER ANNS, count =', state.annotations.length)

    state.annotations.forEach((ann) => {
      const style = getAnnotationSvgStyle(ann.type)

      // === SVG Şekilleri ===
      if (ann.type === 'bbox') {
        console.log('ANN:', ann)
        const el = document.createElementNS(SVG_NS, 'rect')
        el.setAttribute('x', String(ann.x))
        el.setAttribute('y', String(ann.y))
        el.setAttribute('width', String(ann.width))
        el.setAttribute('height', String(ann.height))
        el.setAttribute('fill', style.fill)
        el.setAttribute('fill-opacity', String(style.fillOpacity))
        el.setAttribute('stroke', style.stroke)
        el.setAttribute('stroke-width', String(style.strokeWidth))
        el.dataset.id = String(ann.id)
        el.classList.add('annotation-shape')

        if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
        svgEl.appendChild(el)
      } else if (ann.type === 'polygon') {
        const el = document.createElementNS(SVG_NS, 'polygon')
        el.setAttribute('points', ann.points.map((p) => `${p.x},${p.y}`).join(' '))
        el.setAttribute('fill', style.fill)
        el.setAttribute('fill-opacity', String(style.fillOpacity))
        el.setAttribute('stroke', style.stroke)
        el.setAttribute('stroke-width', String(style.strokeWidth))
        el.dataset.id = String(ann.id)
        el.classList.add('annotation-shape')

        if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
        svgEl.appendChild(el)
      } else if (ann.type === 'polyline') {
        const el = document.createElementNS(SVG_NS, 'polyline')
        el.setAttribute('points', ann.points.map((p) => `${p.x},${p.y}`).join(' '))
        el.setAttribute('fill', 'none')
        el.setAttribute('stroke', style.stroke)
        el.setAttribute('stroke-width', String(style.strokeWidth))
        el.dataset.id = String(ann.id)
        el.classList.add('annotation-shape')
        if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
        svgEl.appendChild(el)
      } else if (ann.type === 'keypoint') {
        const el = document.createElementNS(SVG_NS, 'circle')
        el.setAttribute('cx', String(ann.x))
        el.setAttribute('cy', String(ann.y))
        el.setAttribute('r', '4')
        el.setAttribute('fill', style.fill)
        el.setAttribute('fill-opacity', String(style.fillOpacity))
        el.setAttribute('stroke', style.stroke)
        el.setAttribute('stroke-width', String(style.strokeWidth))
        el.dataset.id = String(ann.id)
        el.classList.add('annotation-shape')
        if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
        svgEl.appendChild(el)
      } else if (ann.type === 'circle') {
        const el = document.createElementNS(SVG_NS, 'circle')
        el.setAttribute('cx', String(ann.cx))
        el.setAttribute('cy', String(ann.cy))
        el.setAttribute('r', String(ann.r))
        el.setAttribute('fill', style.fill)
        el.setAttribute('fill-opacity', String(style.fillOpacity))
        el.setAttribute('stroke', style.stroke)
        el.setAttribute('stroke-width', String(style.strokeWidth))
        el.dataset.id = String(ann.id)
        el.classList.add('annotation-shape')
        if (ann.id === state.selectedAnnotationId) el.classList.add('selected')
        svgEl.appendChild(el)
      }

      // === Sağ taraftaki liste item’ı ===
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
      listEl.appendChild(item)
    })

    updateDeleteButton()
  }

  function exportAnnotationsToImageSpace(): Annotation[] {
    // Şu an koordinatlar zaten img.naturalWidth x img.naturalHeight
    return state.annotations.map((ann) => {
      if (ann.type === 'bbox') {
        return {
          ...ann,
          x: Math.round(ann.x),
          y: Math.round(ann.y),
          width: Math.round(ann.width),
          height: Math.round(ann.height)
        } as BBox
      }

      if (ann.type === 'keypoint') {
        return {
          ...ann,
          x: Math.round(ann.x),
          y: Math.round(ann.y)
        } as KeypointAnn
      }

      if (ann.type === 'circle') {
        return {
          ...ann,
          cx: Math.round(ann.cx),
          cy: Math.round(ann.cy),
          r: Math.round(ann.r)
        } as CircleAnn
      }

      if (ann.type === 'polygon' || ann.type === 'polyline') {
        return {
          ...ann,
          points: ann.points.map((p) => ({
            x: Math.round(p.x),
            y: Math.round(p.y)
          }))
        } as PolygonAnn | PolylineAnn
      }

      return ann
    })
  }

  function clearSelection(): void {
    state.selectedAnnotationId = null
    renderAnnotations()
  }

  function deleteSelected(): void {
    if (state.selectedAnnotationId == null) return
    const i = state.annotations.findIndex((a) => a.id === state.selectedAnnotationId)
    if (i !== -1) {
      state.annotations.splice(i, 1)
      recordHistory()
    }
    state.selectedAnnotationId = null
    renderAnnotations()
  }

  function getImageCoordsFromEvent(e: MouseEvent): { imgX: number; imgY: number } | null {
    const canvas = refs.canvasEl.value
    if (!canvas || !state.img) return null

    const rect = canvas.getBoundingClientRect()

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const internalW = canvas.width
    const internalH = canvas.height
    if (!internalW || !internalH) return null

    const scaleX = rect.width / internalW
    const scaleY = rect.height / internalH

    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return null
    }

    const imgX = mouseX / scaleX
    const imgY = mouseY / scaleY

    const imgW = state.img.naturalWidth || internalW
    const imgH = state.img.naturalHeight || internalH

    if (imgX < 0 || imgY < 0 || imgX > imgW || imgY > imgH) {
      return null
    }

    return { imgX, imgY }
  }

  return {
    renderAnnotations,
    exportAnnotationsToImageSpace,
    clearSelection,
    deleteSelected,
    getImageCoordsFromEvent,
    updateDeleteButton
  }
}
