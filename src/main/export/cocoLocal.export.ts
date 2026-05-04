import { writeFileSync } from 'fs'
import { extname } from 'path'
import type { ImageExportData, LabelRow } from './localExport.types'
import {
  derivedBbox,
  resolveCategoryIndex,
  shoelaceArea,
  validateBbox,
  validateCircle,
  validateKeypoint,
  validatePolygon,
  validatePolyline
} from './localExport.helpers'

interface CocoInfo {
  description: string
  version: string
  year: number
  date_created: string
}

interface CocoImage {
  id: number
  file_name: string
  width: number
  height: number
}

interface CocoAnnotation {
  id: number
  image_id: number
  category_id: number
  bbox: [number, number, number, number]
  segmentation: number[][]
  area: number
  iscrowd: 0
  attributes: Record<string, unknown>
}

interface CocoCategory {
  id: number
  name: string
  supercategory: string
}

interface CocoOutput {
  info: CocoInfo
  images: CocoImage[]
  annotations: CocoAnnotation[]
  categories: CocoCategory[]
}

/**
 * Generate a COCO JSON string from validated image export data.
 * Writes nothing — just returns the JSON string for the caller to save.
 */
export function generateCoco(images: ImageExportData[], labels: LabelRow[]): string {
  // Build label → category index map (1-based COCO ids)
  const labelIndex = new Map<string, number>()
  labels.forEach((l, i) => labelIndex.set(l.name, i + 1))

  const output: CocoOutput = {
    info: {
      description: 'Label Gun local export',
      version: '1.0',
      year: new Date().getFullYear(),
      date_created: new Date().toISOString()
    },
    images: [],
    annotations: [],
    categories: labels.map((l, i) => ({
      id: i + 1,
      name: l.name,
      supercategory: 'none'
    }))
  }

  let annIdCounter = 1

  for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
    const { media, annotations, basename: base } = images[imgIdx]
    const imgW = media.width!
    const imgH = media.height!
    const imageId = imgIdx + 1
    const imgExt = extname(media.local_path)
    const imgFilename = `${base}${imgExt}`

    output.images.push({
      id: imageId,
      file_name: imgFilename,
      width: imgW,
      height: imgH
    })

    for (const ann of annotations) {
      // Validate label (fail-fast)
      // resolveCategoryIndex uses 1-based id from the label map built above
      const catId = resolveCategoryIndex(ann.label, labelIndex, ann.id)

      const imgWn = imgW
      const imgHn = imgH

      switch (ann.type) {
        case 'bbox': {
          validateBbox(ann)
          const db = derivedBbox(ann, imgWn, imgHn)
          output.annotations.push({
            id: annIdCounter++,
            image_id: imageId,
            category_id: catId,
            bbox: [db.x, db.y, db.w, db.h],
            segmentation: [],
            area: db.w * db.h,
            iscrowd: 0,
            attributes: { shape_type: 'bbox' }
          })
          break
        }

        case 'polygon': {
          validatePolygon(ann)
          const db = derivedBbox(ann, imgWn, imgHn)
          const flatPts = ann.points.flatMap((p) => [p.x, p.y])
          output.annotations.push({
            id: annIdCounter++,
            image_id: imageId,
            category_id: catId,
            bbox: [db.x, db.y, db.w, db.h],
            segmentation: [flatPts],
            area: shoelaceArea(ann.points),
            iscrowd: 0,
            attributes: { shape_type: 'polygon' }
          })
          break
        }

        case 'polyline': {
          validatePolyline(ann)
          const db = derivedBbox(ann, imgWn, imgHn)
          output.annotations.push({
            id: annIdCounter++,
            image_id: imageId,
            category_id: catId,
            bbox: [db.x, db.y, db.w, db.h],
            segmentation: [],
            area: db.w * db.h,
            iscrowd: 0,
            attributes: {
              shape_type: 'polyline',
              points: ann.points
            }
          })
          break
        }

        case 'keypoint': {
          validateKeypoint(ann, imgWn, imgHn)
          const db = derivedBbox(ann, imgWn, imgHn)
          output.annotations.push({
            id: annIdCounter++,
            image_id: imageId,
            category_id: catId,
            bbox: [db.x, db.y, db.w, db.h],
            segmentation: [],
            area: db.w * db.h,
            iscrowd: 0,
            attributes: {
              shape_type: 'keypoint',
              x: ann.x,
              y: ann.y
            }
          })
          break
        }

        case 'circle': {
          validateCircle(ann)
          const db = derivedBbox(ann, imgWn, imgHn)
          output.annotations.push({
            id: annIdCounter++,
            image_id: imageId,
            category_id: catId,
            bbox: [db.x, db.y, db.w, db.h],
            segmentation: [],
            area: db.w * db.h,
            iscrowd: 0,
            attributes: {
              shape_type: 'circle',
              cx: ann.cx,
              cy: ann.cy,
              r: ann.r
            }
          })
          break
        }

        default: {
          const _exhaustive: never = ann
          throw new Error(`Unknown annotation type: ${(_exhaustive as { type: string }).type}`)
        }
      }
    }
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Write the COCO JSON to disk.
 */
export function writeCoco(filePath: string, images: ImageExportData[], labels: LabelRow[]): void {
  const json = generateCoco(images, labels)
  writeFileSync(filePath, json, 'utf-8')
}
