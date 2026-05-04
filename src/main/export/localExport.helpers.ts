import { existsSync } from 'fs'
import { basename, extname } from 'path'
import type {
  AnnShape,
  BBoxAnn,
  CircleAnn,
  DerivedBbox,
  KeypointAnn,
  Point,
  PolygonAnn,
  PolylineAnn
} from './localExport.types'

// ─── Filename utilities ───────────────────────────────────────────────────────

/**
 * Make a filename safe: replace spaces with underscores, strip slashes and
 * other shell-unsafe characters.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
}

/**
 * Build a collision-safe basename for a media item.
 * Uses the image file's basename; if two images share the same basename,
 * the media id suffix makes it unique.
 */
export function uniqueBasename(localPath: string, mediaId: string): string {
  const ext = extname(localPath)
  const base = basename(localPath, ext)
  const safe = sanitizeFilename(base)
  const shortId = mediaId.replace(/-/g, '').slice(0, 8)
  return `${safe}_${shortId}`
}

// ─── File existence guard ─────────────────────────────────────────────────────

export function assertImageExists(localPath: string, mediaId: string): void {
  if (!existsSync(localPath)) {
    throw new Error(
      `Image file not found for media "${mediaId}": ${localPath}. ` +
        `Please ensure all images are present before exporting.`
    )
  }
}

// ─── Geometry: Shoelace polygon area ─────────────────────────────────────────

export function shoelaceArea(points: Point[]): number {
  const n = points.length
  if (n < 3) return 0
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

// ─── Clamp helpers ────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Clamp a derived bbox to image bounds. Returns null if the result has
 * zero or negative width/height (annotation is entirely outside the image).
 */
export function clampBbox(
  x: number,
  y: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number
): DerivedBbox | null {
  const x1 = clamp(x, 0, imgW)
  const y1 = clamp(y, 0, imgH)
  const x2 = clamp(x + w, 0, imgW)
  const y2 = clamp(y + h, 0, imgH)
  const cw = x2 - x1
  const ch = y2 - y1
  if (cw <= 0 || ch <= 0) return null
  return { x: x1, y: y1, w: cw, h: ch }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function assertFinite(v: number, name: string): void {
  if (!Number.isFinite(v)) throw new Error(`${name} is not a finite number (got ${v})`)
}

export function validateBbox(ann: BBoxAnn): void {
  assertFinite(ann.x, 'bbox.x')
  assertFinite(ann.y, 'bbox.y')
  assertFinite(ann.width, 'bbox.width')
  assertFinite(ann.height, 'bbox.height')
  if (ann.width <= 0) throw new Error(`bbox.width must be > 0 (got ${ann.width})`)
  if (ann.height <= 0) throw new Error(`bbox.height must be > 0 (got ${ann.height})`)
}

export function validatePolygon(ann: PolygonAnn): void {
  if (!Array.isArray(ann.points)) throw new Error('polygon.points must be an array')
  if (ann.points.length < 3)
    throw new Error(`polygon must have at least 3 points (got ${ann.points.length})`)
  for (const p of ann.points) {
    assertFinite(p.x, 'polygon point.x')
    assertFinite(p.y, 'polygon point.y')
  }
}

export function validatePolyline(ann: PolylineAnn): void {
  if (!Array.isArray(ann.points)) throw new Error('polyline.points must be an array')
  if (ann.points.length < 2)
    throw new Error(`polyline must have at least 2 points (got ${ann.points.length})`)
  for (const p of ann.points) {
    assertFinite(p.x, 'polyline point.x')
    assertFinite(p.y, 'polyline point.y')
  }
}

export function validateKeypoint(ann: KeypointAnn, imgW: number, imgH: number): void {
  assertFinite(ann.x, 'keypoint.x')
  assertFinite(ann.y, 'keypoint.y')
  if (ann.x < 0 || ann.y < 0 || ann.x > imgW || ann.y > imgH) {
    throw new Error(
      `keypoint center (${ann.x}, ${ann.y}) is outside image bounds (${imgW}×${imgH})`
    )
  }
}

export function validateCircle(ann: CircleAnn): void {
  assertFinite(ann.cx, 'circle.cx')
  assertFinite(ann.cy, 'circle.cy')
  assertFinite(ann.r, 'circle.r')
  if (ann.r <= 0) throw new Error(`circle.r must be > 0 (got ${ann.r})`)
}

// ─── derivedBbox — shape → clamped bounding box ───────────────────────────────

/**
 * Compute a derived bbox for any annotation shape, clamped to image bounds.
 * Returns null if the bbox is entirely outside the image after clamping.
 *
 * NOTE: original polygon/polyline/keypoint/circle coordinates are NOT clamped
 * here — they are preserved in the export for COCO/VOC/YOLO metadata fields.
 */
export function derivedBbox(ann: AnnShape, imgW: number, imgH: number): DerivedBbox {
  switch (ann.type) {
    case 'bbox': {
      const r = clampBbox(ann.x, ann.y, ann.width, ann.height, imgW, imgH)
      if (!r)
        throw new Error(
          `bbox annotation (id=${ann.id}) is entirely outside image bounds after clamping`
        )
      return r
    }

    case 'polygon': {
      const xs = ann.points.map((p) => p.x)
      const ys = ann.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      const r = clampBbox(
        minX,
        minY,
        Math.max(maxX - minX, 1),
        Math.max(maxY - minY, 1),
        imgW,
        imgH
      )
      if (!r)
        throw new Error(
          `polygon annotation (id=${ann.id}) is entirely outside image bounds after clamping`
        )
      return r
    }

    case 'polyline': {
      const xs = ann.points.map((p) => p.x)
      const ys = ann.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      const r = clampBbox(
        minX,
        minY,
        Math.max(maxX - minX, 1),
        Math.max(maxY - minY, 1),
        imgW,
        imgH
      )
      if (!r)
        throw new Error(
          `polyline annotation (id=${ann.id}) is entirely outside image bounds after clamping`
        )
      return r
    }

    case 'keypoint': {
      // 4×4 derived bbox, clamped to image
      const x = clamp(ann.x - 2, 0, imgW)
      const y = clamp(ann.y - 2, 0, imgH)
      const x2 = clamp(ann.x + 2, 0, imgW)
      const y2 = clamp(ann.y + 2, 0, imgH)
      const w = x2 - x
      const h = y2 - y
      if (w <= 0 || h <= 0)
        throw new Error(
          `keypoint annotation (id=${ann.id}) produced zero-area derived bbox after clamping`
        )
      return { x, y, w, h }
    }

    case 'circle': {
      const r = clampBbox(ann.cx - ann.r, ann.cy - ann.r, ann.r * 2, ann.r * 2, imgW, imgH)
      if (!r)
        throw new Error(
          `circle annotation (id=${ann.id}) is entirely outside image bounds after clamping`
        )
      return r
    }

    default: {
      const _exhaustive: never = ann
      throw new Error(`Unknown annotation type: ${(_exhaustive as AnnShape).type}`)
    }
  }
}

// ─── Label validation ─────────────────────────────────────────────────────────

/**
 * Validate that every annotation in a list references a known label.
 * Returns the category index (0-based) for each annotation.
 */
export function resolveCategoryIndex(
  labelName: string | null | undefined,
  labelIndex: Map<string, number>,
  annId: number
): number {
  if (labelName === null || labelName === undefined || labelName.trim() === '') {
    throw new Error(`Annotation id=${annId} has a null/empty label. Export aborted (fail-fast).`)
  }
  const idx = labelIndex.get(labelName)
  if (idx === undefined) {
    throw new Error(
      `Annotation id=${annId} references unknown label "${labelName}". Export aborted (fail-fast).`
    )
  }
  return idx
}

// ─── Annotation list parser ───────────────────────────────────────────────────

export function parseAnnotationDataJson(dataJson: string | null, mediaId: string): AnnShape[] {
  if (!dataJson) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(dataJson)
  } catch {
    throw new Error(`data_json for media "${mediaId}" is not valid JSON`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`data_json for media "${mediaId}" must be an array (got ${typeof parsed})`)
  }
  return parsed as AnnShape[]
}
