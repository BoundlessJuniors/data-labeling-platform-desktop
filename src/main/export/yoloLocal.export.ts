import { createWriteStream } from 'fs'
import { extname } from 'path'
import archiver from 'archiver'
import type { ImageExportData, LabelRow } from './localExport.types'
import {
  derivedBbox,
  resolveCategoryIndex,
  validateBbox,
  validateCircle,
  validateKeypoint,
  validatePolygon,
  validatePolyline
} from './localExport.helpers'

interface ShapeMetaEntry {
  mediaId: string
  filename: string
  annotations: unknown[]
}

/**
 * Generate a YOLO ZIP archive to the given filePath.
 * Returns a Promise that resolves when the ZIP is fully written.
 */
export function writeYolo(
  filePath: string,
  images: ImageExportData[],
  labels: LabelRow[]
): Promise<void> {
  // Build label → index map (0-based for YOLO)
  const labelIndex = new Map<string, number>()
  labels.forEach((l, i) => labelIndex.set(l.name, i))

  // shape-metadata sidecar
  const shapeMeta: ShapeMetaEntry[] = []

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

      // Add image file
      archive.file(media.local_path, { name: `images/${imgFilename}` })

      // Build YOLO label lines + shape-metadata annotations
      const labelLines: string[] = []
      const metaAnns: unknown[] = []

      for (const ann of annotations) {
        const catIdx = resolveCategoryIndex(ann.label, labelIndex, ann.id)

        switch (ann.type) {
          case 'bbox': {
            validateBbox(ann)
            const db = derivedBbox(ann, imgW, imgH)
            const xc = (db.x + db.w / 2) / imgW
            const yc = (db.y + db.h / 2) / imgH
            const wn = db.w / imgW
            const hn = db.h / imgH
            labelLines.push(
              `${catIdx} ${xc.toFixed(6)} ${yc.toFixed(6)} ${wn.toFixed(6)} ${hn.toFixed(6)}`
            )
            break
          }
          case 'polygon': {
            validatePolygon(ann)
            const db = derivedBbox(ann, imgW, imgH)
            const xc = (db.x + db.w / 2) / imgW
            const yc = (db.y + db.h / 2) / imgH
            const wn = db.w / imgW
            const hn = db.h / imgH
            labelLines.push(
              `${catIdx} ${xc.toFixed(6)} ${yc.toFixed(6)} ${wn.toFixed(6)} ${hn.toFixed(6)}`
            )
            metaAnns.push({ type: 'polygon', label: ann.label, points: ann.points })
            break
          }
          case 'polyline': {
            validatePolyline(ann)
            const db = derivedBbox(ann, imgW, imgH)
            const xc = (db.x + db.w / 2) / imgW
            const yc = (db.y + db.h / 2) / imgH
            const wn = db.w / imgW
            const hn = db.h / imgH
            labelLines.push(
              `${catIdx} ${xc.toFixed(6)} ${yc.toFixed(6)} ${wn.toFixed(6)} ${hn.toFixed(6)}`
            )
            metaAnns.push({ type: 'polyline', label: ann.label, points: ann.points })
            break
          }
          case 'keypoint': {
            validateKeypoint(ann, imgW, imgH)
            const db = derivedBbox(ann, imgW, imgH)
            const xc = (db.x + db.w / 2) / imgW
            const yc = (db.y + db.h / 2) / imgH
            const wn = db.w / imgW
            const hn = db.h / imgH
            labelLines.push(
              `${catIdx} ${xc.toFixed(6)} ${yc.toFixed(6)} ${wn.toFixed(6)} ${hn.toFixed(6)}`
            )
            metaAnns.push({ type: 'keypoint', label: ann.label, x: ann.x, y: ann.y })
            break
          }
          case 'circle': {
            validateCircle(ann)
            const db = derivedBbox(ann, imgW, imgH)
            const xc = (db.x + db.w / 2) / imgW
            const yc = (db.y + db.h / 2) / imgH
            const wn = db.w / imgW
            const hn = db.h / imgH
            labelLines.push(
              `${catIdx} ${xc.toFixed(6)} ${yc.toFixed(6)} ${wn.toFixed(6)} ${hn.toFixed(6)}`
            )
            metaAnns.push({ type: 'circle', label: ann.label, cx: ann.cx, cy: ann.cy, r: ann.r })
            break
          }
          default: {
            const _exhaustive: never = ann
            throw new Error(`Unknown annotation type: ${(_exhaustive as { type: string }).type}`)
          }
        }
      }

      // labels/<basename>.txt (empty is valid for unannotated images)
      archive.append(labelLines.join('\n'), { name: `labels/${base}.txt` })

      if (metaAnns.length > 0) {
        shapeMeta.push({
          mediaId: media.id,
          filename: imgFilename,
          annotations: metaAnns
        })
      }
    }

    // classes.txt
    const classesContent = labels.map((l) => l.name).join('\n')
    archive.append(classesContent, { name: 'classes.txt' })

    // data.yaml
    const yamlLines = [
      `nc: ${labels.length}`,
      `names: [${labels.map((l) => JSON.stringify(l.name)).join(', ')}]`
    ]
    archive.append(yamlLines.join('\n'), { name: 'data.yaml' })

    // shape-metadata.json
    archive.append(JSON.stringify(shapeMeta, null, 2), { name: 'shape-metadata.json' })

    archive.finalize()
  })
}
