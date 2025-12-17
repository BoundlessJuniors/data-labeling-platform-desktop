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
  title: string // UI’de görünen isim
  mediaId?: string // DB’deki media_items.id (opsiyonel)
  image: string
  status: TaskStatus
  originalWidth?: number
  originalHeight?: number
  // DB'den gelen, bu media için daha önce harcanmış toplam süre (saniye)
  timeSeconds?: number
}
