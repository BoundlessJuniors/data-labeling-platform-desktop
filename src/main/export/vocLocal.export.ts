import { createWriteStream } from 'fs'
import { extname } from 'path'
import archiver from 'archiver'
import type {
  AnnShape,
  CircleAnn,
  ImageExportData,
  KeypointAnn,
  LabelRow,
  Point,
  PolygonAnn,
  PolylineAnn
} from './localExport.types'
import {
  derivedBbox,
  resolveCategoryIndex,
  validateBbox,
  validateCircle,
  validateKeypoint,
  validatePolygon,
  validatePolyline
} from './localExport.helpers'

// ─── XML escape ───────────────────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── Custom shape XML tags ────────────────────────────────────────────────────

function pointsToXml(points: Point[]): string {
  const inner = points.map((p) => `\t\t\t\t<point><x>${p.x}</x><y>${p.y}</y></point>`).join('\n')
  return `\t\t\t<points>\n${inner}\n\t\t\t</points>`
}

function shapeExtraXml(ann: AnnShape): string {
  switch (ann.type) {
    case 'polygon':
      return `\t\t\t<shape_type>polygon</shape_type>\n${pointsToXml((ann as PolygonAnn).points)}`
    case 'polyline':
      return `\t\t\t<shape_type>polyline</shape_type>\n${pointsToXml((ann as PolylineAnn).points)}`
    case 'keypoint': {
      const kp = ann as KeypointAnn
      return `\t\t\t<shape_type>keypoint</shape_type>\n\t\t\t<point><x>${kp.x}</x><y>${kp.y}</y></point>`
    }
    case 'circle': {
      const c = ann as CircleAnn
      return `\t\t\t<shape_type>circle</shape_type>\n\t\t\t<circle><cx>${c.cx}</cx><cy>${c.cy}</cy><r>${c.r}</r></circle>`
    }
    default:
      return `\t\t\t<shape_type>bbox</shape_type>`
  }
}

// ─── VOC XML builder ──────────────────────────────────────────────────────────

function buildVocXml(
  filename: string,
  imgW: number,
  imgH: number,
  annotations: AnnShape[],
  labelIndex: Map<string, number>
): string {
  const objectsXml: string[] = []

  for (const ann of annotations) {
    resolveCategoryIndex(ann.label, labelIndex, ann.id) // fail-fast label check

    switch (ann.type) {
      case 'bbox':
        validateBbox(ann)
        break
      case 'polygon':
        validatePolygon(ann)
        break
      case 'polyline':
        validatePolyline(ann)
        break
      case 'keypoint':
        validateKeypoint(ann, imgW, imgH)
        break
      case 'circle':
        validateCircle(ann)
        break
    }

    const db = derivedBbox(ann, imgW, imgH)
    const xmin = Math.round(db.x)
    const ymin = Math.round(db.y)
    const xmax = Math.round(db.x + db.w)
    const ymax = Math.round(db.y + db.h)

    const extra = shapeExtraXml(ann)

    objectsXml.push(`\t<object>
\t\t<name>${xmlEscape(ann.label ?? '')}</name>
\t\t<pose>Unspecified</pose>
\t\t<truncated>0</truncated>
\t\t<difficult>0</difficult>
\t\t<bndbox>
\t\t\t<xmin>${xmin}</xmin>
\t\t\t<ymin>${ymin}</ymin>
\t\t\t<xmax>${xmax}</xmax>
\t\t\t<ymax>${ymax}</ymax>
\t\t</bndbox>
${extra}
\t</object>`)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
\t<folder>images</folder>
\t<filename>${xmlEscape(filename)}</filename>
\t<size>
\t\t<width>${imgW}</width>
\t\t<height>${imgH}</height>
\t\t<depth>3</depth>
\t</size>
\t<segmented>0</segmented>
${objectsXml.join('\n')}
</annotation>`
}

// ─── Public writer ────────────────────────────────────────────────────────────

/**
 * Generate a Pascal VOC ZIP archive to the given filePath.
 * Returns a Promise that resolves when the ZIP is fully written.
 */
export function writeVoc(
  filePath: string,
  images: ImageExportData[],
  labels: LabelRow[]
): Promise<void> {
  // label name → 0-based index map (for resolveCategoryIndex which uses 1-based internally,
  // but for VOC we only need the existence check — we pass labels as a simple name→idx map)
  const labelIndex = new Map<string, number>()
  labels.forEach((l, i) => labelIndex.set(l.name, i + 1))

  return new Promise((resolve, reject) => {
    const output = createWriteStream(filePath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))
    archive.pipe(output)

    for (const { media, annotations, basename: base } of images) {
      const imgW = media.width!
      const imgH = media.height!
      const imgExt = extname(media.local_path)
      const imgFilename = `${base}${imgExt}`

      // Add image
      archive.file(media.local_path, { name: `images/${imgFilename}` })

      // Build XML (empty <object> list is valid for unannotated images)
      const xml = buildVocXml(imgFilename, imgW, imgH, annotations, labelIndex)
      archive.append(xml, { name: `annotations/${base}.xml` })
    }

    archive.finalize()
  })
}
