import { reactive } from 'vue'
import type { Annotation, Point } from '@renderer/types/annotation'

export function useLabelerState() {
  const state = reactive({
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
