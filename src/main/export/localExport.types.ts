// ─── Export format selection ──────────────────────────────────────────────────
export type ExportFormat = 'COCO' | 'YOLO' | 'VOC'

// ─── IPC result ──────────────────────────────────────────────────────────────
export type LocalExportResult = { ok: true; filePath: string } | { ok: false; cancelled: true }

// ─── DB row shapes (main-process internal) ────────────────────────────────────

export interface DatasetRow {
  id: string
  name: string
  label_source: string | null
  cloud_contract_id: string | null
}

export interface LabelRow {
  id: string
  name: string
}

export interface MediaRow {
  id: string
  dataset_id: string
  local_path: string
  width: number | null
  height: number | null
  status: string
  cloud_task_id: string | null
}

export interface AnnotationDbRow {
  data_json: string | null
}

// ─── Annotation shapes (mirrored from renderer types, no Vue dependency) ──────

export interface Point {
  x: number
  y: number
}

export interface BBoxAnn {
  id: number
  type: 'bbox'
  label: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface PolygonAnn {
  id: number
  type: 'polygon'
  label: string | null
  points: Point[]
}

export interface PolylineAnn {
  id: number
  type: 'polyline'
  label: string | null
  points: Point[]
}

export interface KeypointAnn {
  id: number
  type: 'keypoint'
  label: string | null
  x: number
  y: number
  r?: number
}

export interface CircleAnn {
  id: number
  type: 'circle'
  label: string | null
  cx: number
  cy: number
  r: number
}

export type AnnShape = BBoxAnn | PolygonAnn | PolylineAnn | KeypointAnn | CircleAnn

// ─── Derived bounding box (clamped to image bounds) ──────────────────────────

export interface DerivedBbox {
  x: number
  y: number
  w: number
  h: number
}

// ─── Per-image export data ────────────────────────────────────────────────────

export interface ImageExportData {
  media: MediaRow
  annotations: AnnShape[]
  basename: string // unique, collision-safe
}
