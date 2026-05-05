import { ipcMain, dialog, BrowserWindow, nativeImage } from 'electron'
import { unlinkSync, existsSync } from 'fs'
import { getDb } from '../db/sqlite'
import {
  sanitizeFilename,
  uniqueBasename,
  assertImageExists,
  parseAnnotationDataJson
} from '../export/localExport.helpers'
import { writeCoco } from '../export/cocoLocal.export'
import { writeYolo } from '../export/yoloLocal.export'
import { writeVoc } from '../export/vocLocal.export'
import type {
  DatasetRow,
  ExportFormat,
  ImageExportData,
  LabelRow,
  LocalExportResult,
  MediaRow
} from '../export/localExport.types'

// ─── Cloud guard ──────────────────────────────────────────────────────────────

function assertLocalDataset(dataset: DatasetRow): void {
  if (dataset.label_source !== 'local') {
    throw new Error(
      `Export blocked: dataset "${dataset.id}" is not a local dataset ` +
        `(label_source = "${dataset.label_source}"). ` +
        `Cloud contract datasets cannot be exported from desktop. ` +
        `Submit the work; the client exports approved results from the web app.`
    )
  }
  if (dataset.cloud_contract_id) {
    throw new Error(
      `Export blocked: dataset "${dataset.id}" is linked to a cloud contract ` +
        `(cloud_contract_id = "${dataset.cloud_contract_id}"). ` +
        `Cloud contract datasets cannot be exported from desktop.`
    )
  }
}

// ─── Save dialog helpers ──────────────────────────────────────────────────────

interface SaveDialogSpec {
  defaultName: string
  format: ExportFormat
}

async function showSaveDialog(
  parentWindow: BrowserWindow | null,
  spec: SaveDialogSpec
): Promise<string | null> {
  const filters =
    spec.format === 'COCO'
      ? [{ name: 'COCO JSON', extensions: ['json'] }]
      : [{ name: 'ZIP Archive', extensions: ['zip'] }]

  const opts: Electron.SaveDialogOptions = {
    defaultPath: spec.defaultName,
    filters
  }

  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, opts)
    : await dialog.showSaveDialog(opts)

  if (result.canceled || !result.filePath) return null
  return result.filePath
}

function resolveImageDimensionsFromDisk(
  localPath: string
): { width: number; height: number } | null {
  const img = nativeImage.createFromPath(localPath)
  if (img.isEmpty()) return null

  const size = img.getSize()
  if (!size.width || !size.height || size.width <= 0 || size.height <= 0) {
    return null
  }

  return {
    width: size.width,
    height: size.height
  }
}

// ─── IPC registration ─────────────────────────────────────────────────────────

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:localDataset',
    async (
      event,
      payload: { datasetId: string; format: ExportFormat }
    ): Promise<LocalExportResult> => {
      const { datasetId, format } = payload

      if (format !== 'COCO' && format !== 'YOLO' && format !== 'VOC') {
        throw new Error(`Invalid export format requested: ${format}`)
      }

      const db = getDb()

      // 1. Load dataset and apply cloud guard
      const dataset = db
        .prepare(
          `SELECT id, name, label_source, cloud_contract_id FROM datasets WHERE id = ? LIMIT 1`
        )
        .get(datasetId) as DatasetRow | undefined

      if (!dataset) {
        throw new Error(`Dataset not found: ${datasetId}`)
      }

      assertLocalDataset(dataset) // IPC-level cloud guard (hard enforcement)

      // 2. Load labels (ordered by created_at ASC → deterministic class indices)
      const labels = db
        .prepare(`SELECT id, name FROM dataset_labels WHERE dataset_id = ? ORDER BY created_at ASC`)
        .all(datasetId) as LabelRow[]

      if (labels.length === 0) {
        throw new Error(
          `Dataset "${dataset.name}" has no labels defined. Please add at least one label before exporting.`
        )
      }

      // 3. Load media items (exclude archived)
      const mediaRows = db
        .prepare(
          `SELECT id, dataset_id, local_path, width, height, status, cloud_task_id
           FROM media_items
           WHERE dataset_id = ? AND status != 'archived'
           ORDER BY created_at ASC`
        )
        .all(datasetId) as MediaRow[]

      if (mediaRows.length === 0) {
        throw new Error(`Dataset "${dataset.name}" has no images. Nothing to export.`)
      }

      // 4. Build per-image export data (load annotations, validate images)
      const imageExportData: ImageExportData[] = []

      for (const media of mediaRows) {
        // Cloud task guard on media level (belt-and-suspenders)
        if (media.cloud_task_id) {
          throw new Error(
            `Media item "${media.id}" has a cloud_task_id — it is not a local item. ` +
              `Export of cloud-originated media is not allowed.`
          )
        }

        // Image file existence guard (no silent skip)
        assertImageExists(media.local_path, media.id)

        // Image dimension guard & recovery
        let resolvedWidth = media.width
        let resolvedHeight = media.height

        if (!resolvedWidth || !resolvedHeight || resolvedWidth <= 0 || resolvedHeight <= 0) {
          const resolved = resolveImageDimensionsFromDisk(media.local_path)

          if (!resolved) {
            throw new Error(
              `Image "${media.local_path}" (media id=${media.id}) is missing valid width/height, ` +
                `and dimensions could not be read from disk. Please re-import the image.`
            )
          }

          resolvedWidth = resolved.width
          resolvedHeight = resolved.height

          db.prepare(
            `UPDATE media_items SET width = ?, height = ?, updated_at = ? WHERE id = ?`
          ).run(resolvedWidth, resolvedHeight, Date.now(), media.id)
        }

        const finalWidth = resolvedWidth
        const finalHeight = resolvedHeight

        if (!finalWidth || !finalHeight || finalWidth <= 0 || finalHeight <= 0) {
          throw new Error(
            `Image "${media.local_path}" (media id=${media.id}) still has invalid dimensions after recovery.`
          )
        }

        // Load annotation export snapshot
        const annRow = db
          .prepare(`SELECT data_json FROM annotations WHERE id = ? LIMIT 1`)
          .get(`export:${media.id}`) as { data_json: string | null } | undefined

        const annotations = parseAnnotationDataJson(annRow?.data_json ?? null, media.id)

        imageExportData.push({
          media: {
            ...media,
            width: finalWidth,
            height: finalHeight
          },
          annotations,
          basename: uniqueBasename(media.local_path, media.id)
        })
      }

      // 5. Show save dialog
      const safeDatasetName = sanitizeFilename(dataset.name) || 'export'
      const ext = format === 'COCO' ? 'coco.json' : format === 'YOLO' ? 'yolo.zip' : 'voc.zip'
      const defaultName = `${safeDatasetName}.${ext}`

      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const filePath = await showSaveDialog(parentWindow, { defaultName, format })

      if (!filePath) {
        return { ok: false, cancelled: true }
      }

      // 6. Generate output — delete partial file on error
      try {
        switch (format) {
          case 'COCO':
            writeCoco(filePath, imageExportData, labels)
            break
          case 'YOLO':
            await writeYolo(filePath, imageExportData, labels)
            break
          case 'VOC':
            await writeVoc(filePath, imageExportData, labels)
            break
          default: {
            const _exhaustive: never = format
            throw new Error(`Unknown export format: ${_exhaustive}`)
          }
        }
      } catch (err) {
        // Clean up partial output file if it was created
        try {
          if (existsSync(filePath)) unlinkSync(filePath)
        } catch {
          // ignore cleanup errors
        }
        throw err
      }

      return { ok: true, filePath }
    }
  )
}
