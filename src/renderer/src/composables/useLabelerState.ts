import { reactive } from 'vue'
import type { Annotation, Point } from '@renderer/types/annotation'
interface LabelerState {
  annotations: Annotation[]
  selectedAnnotationId: number | null
  history: Annotation[][]
  historyIndex: number

  scale: number
  translateX: number
  translateY: number
  startPanX: number
  startPanY: number

  isPanning: boolean
  isDrawing: boolean
  drawingStartX: number
  drawingStartY: number

  lastUsedTool: 'select' | 'sam' | 'shapes'
  lastUsedShape: 'bbox' | 'polygon' | 'polyline' | 'keypoint' | 'circle'
  activeLabel: string | null

  drawingShape: 'bbox' | 'polygon' | 'polyline' | 'circle' | null
  polyPoints: Point[]

  img: HTMLImageElement
}

export function useLabelerState(): { state: LabelerState } {
  const state = reactive<LabelerState>({
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

    drawingShape: null as 'bbox' | 'polygon' | 'polyline' | 'circle' | null,
    polyPoints: [] as Point[],

    img: new Image()
  })

  return { state }
}
