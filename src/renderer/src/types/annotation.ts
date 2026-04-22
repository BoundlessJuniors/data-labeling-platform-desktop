// Tipler
export type Point = { x: number; y: number }

export type BBox = {
  id: number
  type: 'bbox'
  label: string | null
  x: number
  y: number
  width: number
  height: number
}

export type PolygonAnn = {
  id: number
  type: 'polygon'
  label: string | null
  points: Point[]
}

export type PolylineAnn = {
  id: number
  type: 'polyline'
  label: string | null
  points: Point[]
}

export type KeypointAnn = {
  id: number
  type: 'keypoint'
  label: string | null
  x: number
  y: number
  r?: number
}

export type CircleAnn = {
  id: number
  type: 'circle'
  label: string | null
  cx: number
  cy: number
  r: number
}

export type Annotation = BBox | PolygonAnn | PolylineAnn | KeypointAnn | CircleAnn

export type TaskStatus = 'in_progress' | 'completed' | 'queued'
export type Task = {
  id: number
  title: string
  mediaId?: string
  image: string
  status: TaskStatus
  originalWidth?: number
  originalHeight?: number
  timeSeconds?: number
  // Cloud fields (cloud-originated tasks only)
  cloudTaskId?: string
  contractId?: string
  syncStatus?: string
}

export type LabelDefinition = {
  id: string
  name: string
  color?: string | null
  attributesSchemaJson?: unknown | null
  source?: 'cloud' | 'local'
}

export type DatasetLabelSource = 'local' | 'cloud' | null

export type DatasetLabelingContext = {
  datasetId: string
  labelSource: DatasetLabelSource
  annotationFormat?: string | null
  labelingSpecJson?: unknown | null
  qcMode?: string | null
  labelSetName?: string | null
  labelSetVersion?: number | null
  labels: LabelDefinition[]
}
