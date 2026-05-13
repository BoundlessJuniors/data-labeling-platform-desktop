import { ipcMain } from 'electron'
import { getDb } from '../db/sqlite'
import { randomUUID } from 'crypto'

export function registerDbIpc(): void {
  ipcMain.handle('db:ping', () => ({ ok: true }))

  ipcMain.handle(
    'db:datasets:create',
    (
      _evt,
      payload: {
        id: string
        name: string
        folder_path?: string | null
        cloud_contract_id?: string
        label_source?: 'cloud' | 'local' | null
        annotation_format?: string | null
        labeling_spec_json?: string | null
        qc_mode?: string | null
        label_set_name?: string | null
        label_set_version?: number | null
      }
    ) => {
      const db = getDb()
      const now = Date.now()
      // Default to local if no cloud contract id is provided and no source is explicitly set
      const finalLabelSource = payload.label_source ?? (payload.cloud_contract_id ? null : 'local')

      db.prepare(
        `INSERT OR IGNORE INTO datasets (
          id, name, folder_path, cloud_contract_id, created_at,
          label_source, annotation_format, labeling_spec_json, qc_mode, label_set_name, label_set_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        payload.id,
        payload.name,
        payload.folder_path ?? null,
        payload.cloud_contract_id ?? null,
        now,
        finalLabelSource,
        payload.annotation_format ?? null,
        payload.labeling_spec_json ?? null,
        payload.qc_mode ?? null,
        payload.label_set_name ?? null,
        payload.label_set_version ?? null
      )
      return { ok: true }
    }
  )

  ipcMain.handle('db:datasets:getByFolder', (_evt, folderPath: string) => {
    const db = getDb()
    const row = db
      .prepare('SELECT id, name, created_at, folder_path FROM datasets WHERE folder_path=? LIMIT 1')
      .get(folderPath) as
      | { id: string; name: string; created_at: number; folder_path: string | null }
      | undefined
    return row ?? null
  })

  ipcMain.handle('db:datasets:getByContractId', (_evt, contractId: string) => {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT id, name, created_at, folder_path, cloud_contract_id FROM datasets WHERE cloud_contract_id=? LIMIT 1'
      )
      .get(contractId) as
      | {
          id: string
          name: string
          created_at: number
          folder_path: string | null
          cloud_contract_id: string
        }
      | undefined
    return row ?? null
  })

  ipcMain.handle('db:datasets:delete', (_evt, datasetId: string) => {
    const db = getDb()
    const tx = db.transaction(() => {
      // Get contract ID for task_leases cleanup
      const ds = db
        .prepare('SELECT cloud_contract_id FROM datasets WHERE id = ?')
        .get(datasetId) as { cloud_contract_id: string | null } | undefined
      const contractId = ds?.cloud_contract_id

      // Get task_ids before deleting media_items
      const tasks = db
        .prepare(
          `SELECT cloud_task_id FROM media_items WHERE dataset_id = ? AND cloud_task_id IS NOT NULL`
        )
        .all(datasetId) as { cloud_task_id: string }[]

      // annotations -> media_items -> dataset_labels -> datasets
      db.prepare(
        `DELETE FROM annotations 
         WHERE media_id IN (SELECT id FROM media_items WHERE dataset_id = ?)`
      ).run(datasetId)

      db.prepare(`DELETE FROM media_items WHERE dataset_id = ?`).run(datasetId)
      db.prepare(`DELETE FROM dataset_labels WHERE dataset_id = ?`).run(datasetId)
      db.prepare(`DELETE FROM datasets WHERE id = ?`).run(datasetId)

      // cleanup task_leases
      if (contractId) {
        db.prepare(`DELETE FROM task_leases WHERE contract_id = ?`).run(contractId)
      }
      for (const t of tasks) {
        db.prepare(`DELETE FROM task_leases WHERE task_id = ?`).run(t.cloud_task_id)
      }
    })
    tx()
    return { ok: true }
  })

  ipcMain.handle(
    'db:datasets:updateLabelingContext',
    (
      _evt,
      payload: {
        dataset_id: string
        label_source: 'cloud' | 'local'
        annotation_format?: string | null
        labeling_spec_json?: string | null
        qc_mode?: string | null
        label_set_name?: string | null
        label_set_version?: number | null
      }
    ) => {
      const db = getDb()
      db.prepare(
        `UPDATE datasets SET
          label_source = ?,
          annotation_format = ?,
          labeling_spec_json = ?,
          qc_mode = ?,
          label_set_name = ?,
          label_set_version = ?
         WHERE id = ?`
      ).run(
        payload.label_source,
        payload.annotation_format ?? null,
        payload.labeling_spec_json ?? null,
        payload.qc_mode ?? null,
        payload.label_set_name ?? null,
        payload.label_set_version ?? null,
        payload.dataset_id
      )
      return { ok: true }
    }
  )

  ipcMain.handle('db:datasets:getLabelingContext', (_evt, datasetId: string) => {
    const db = getDb()
    const dataset = db
      .prepare(
        `SELECT
          id as datasetId,
          label_source as labelSource,
          annotation_format as annotationFormat,
          labeling_spec_json as labelingSpecJson,
          qc_mode as qcMode,
          label_set_name as labelSetName,
          label_set_version as labelSetVersion
         FROM datasets WHERE id = ? LIMIT 1`
      )
      .get(datasetId)

    if (!dataset) return null

    const datasetObj = dataset as Record<string, unknown>
    if (datasetObj.labelingSpecJson && typeof datasetObj.labelingSpecJson === 'string') {
      try {
        datasetObj.labelingSpecJson = JSON.parse(datasetObj.labelingSpecJson)
      } catch (err) {
        console.error('Failed to parse labelingSpecJson from datasets:', err)
        datasetObj.labelingSpecJson = null
      }
    }

    const labels = db
      .prepare(
        `SELECT
          id, dataset_id, name, color, attributes_schema_json as attributesSchemaJson, source
         FROM dataset_labels WHERE dataset_id = ? ORDER BY created_at ASC`
      )
      .all(datasetId)

    const parsedLabels = labels.map((lbl: unknown) => {
      const labelObj = lbl as Record<string, unknown>
      if (labelObj.attributesSchemaJson && typeof labelObj.attributesSchemaJson === 'string') {
        try {
          labelObj.attributesSchemaJson = JSON.parse(labelObj.attributesSchemaJson)
        } catch (err) {
          console.error('Failed to parse attributesSchemaJson for label:', labelObj.id, err)
          labelObj.attributesSchemaJson = null
        }
      }
      return labelObj
    })

    return {
      dataset: datasetObj,
      labels: parsedLabels
    }
  })

  ipcMain.handle(
    'db:datasetLabels:replaceAll',
    (
      _evt,
      payload: {
        dataset_id: string
        source: 'cloud' | 'local'
        labels: Array<{
          id?: string
          name: string
          color?: string | null
          attributes_schema_json?: string | null
        }>
      }
    ) => {
      const db = getDb()
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM dataset_labels WHERE dataset_id = ?`).run(payload.dataset_id)

        const stmt = db.prepare(
          `INSERT INTO dataset_labels (id, dataset_id, name, color, attributes_schema_json, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        const now = Date.now()
        for (const lbl of payload.labels) {
          const localLabelId =
            payload.source === 'cloud' && lbl.id ? `${payload.dataset_id}:${lbl.id}` : lbl.id || randomUUID()
          stmt.run(
            localLabelId,
            payload.dataset_id,
            lbl.name,
            lbl.color ?? null,
            lbl.attributes_schema_json ?? null,
            payload.source,
            now,
            now
          )
        }
      })
      tx()
      return { ok: true }
    }
  )

  ipcMain.handle('db:datasetLabels:listByDataset', (_evt, datasetId: string) => {
    const labels = getDb()
      .prepare(
        `SELECT id, dataset_id, name, color, attributes_schema_json as attributesSchemaJson, source
         FROM dataset_labels WHERE dataset_id = ? ORDER BY created_at ASC`
      )
      .all(datasetId)

    return labels.map((lbl: unknown) => {
      const labelObj = lbl as Record<string, unknown>
      if (labelObj.attributesSchemaJson && typeof labelObj.attributesSchemaJson === 'string') {
        try {
          labelObj.attributesSchemaJson = JSON.parse(labelObj.attributesSchemaJson)
        } catch (err) {
          console.error('Failed to parse attributesSchemaJson for label:', labelObj.id, err)
          labelObj.attributesSchemaJson = null
        }
      }
      return labelObj
    })
  })

  ipcMain.handle(
    'db:datasetLabels:add',
    (
      _evt,
      payload: {
        dataset_id: string
        name: string
        color?: string | null
        attributes_schema_json?: string | null
        source?: 'local' | 'cloud'
      }
    ) => {
      const db = getDb()

      const ds = db
        .prepare(`SELECT label_source FROM datasets WHERE id = ?`)
        .get(payload.dataset_id) as { label_source: string | null } | undefined

      if (!ds) {
        throw new Error('Dataset not found')
      }
      if (ds.label_source !== 'local') {
        throw new Error('Cannot add labels to a non-local dataset')
      }

      // Explicitly check for duplicate label name to provide friendly error
      const existing = db
        .prepare(`SELECT id FROM dataset_labels WHERE dataset_id = ? AND name = ?`)
        .get(payload.dataset_id, payload.name)
      if (existing) {
        throw new Error(`Label with name "${payload.name}" already exists in this dataset`)
      }

      const id = randomUUID()
      const now = Date.now()
      db.prepare(
        `INSERT INTO dataset_labels (id, dataset_id, name, color, attributes_schema_json, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        payload.dataset_id,
        payload.name,
        payload.color ?? null,
        payload.attributes_schema_json ?? null,
        payload.source ?? 'local',
        now,
        now
      )
      return { ok: true, id }
    }
  )

  ipcMain.handle(
    'db:datasetLabels:delete',
    (_evt, payload: { dataset_id: string; label_id: string }) => {
      const db = getDb()
      const ds = db
        .prepare(`SELECT label_source FROM datasets WHERE id = ?`)
        .get(payload.dataset_id) as { label_source: string | null } | undefined

      if (!ds) {
        throw new Error('Dataset not found')
      }
      if (ds.label_source !== 'local') {
        throw new Error('Cannot delete labels from a non-local dataset')
      }

      const labelRow = db
        .prepare(`SELECT name FROM dataset_labels WHERE id = ?`)
        .get(payload.label_id) as { name: string } | undefined
      if (!labelRow) {
        throw new Error('Label not found')
      }

      // Check if the label is used by any persisted annotations in this dataset
      const usageCheck = db
        .prepare(
          `SELECT data_json FROM annotations
           WHERE media_id IN (SELECT id FROM media_items WHERE dataset_id = ?)`
        )
        .all(payload.dataset_id) as { data_json: string }[]

      let isUsed = false
      for (const row of usageCheck) {
        if (!row.data_json) continue
        try {
          const parsed = JSON.parse(row.data_json)
          if (Array.isArray(parsed)) {
            if (parsed.some((a: { label?: string }) => a.label === labelRow.name)) {
              isUsed = true
              break
            }
          }
        } catch (e) {
          console.error('Failed to parse annotation data_json for usage check:', e)
          // Conservative fallback
          if (
            row.data_json.includes(`"label":"${labelRow.name}"`) ||
            row.data_json.includes(`"label": "${labelRow.name}"`)
          ) {
            isUsed = true
            break
          }
        }
      }

      if (isUsed) {
        throw new Error(
          `Cannot delete label "${labelRow.name}" because it is currently used by annotations in this dataset.`
        )
      }

      db.prepare(`DELETE FROM dataset_labels WHERE id = ? AND dataset_id = ?`).run(
        payload.label_id,
        payload.dataset_id
      )
      return { ok: true }
    }
  )

  ipcMain.handle(
    'db:media:upsert',
    (
      _evt,
      payload: {
        id: string
        dataset_id: string
        local_path: string
        sha256?: string | null
        width?: number | null
        height?: number | null
      }
    ) => {
      const db = getDb()
      const now = Date.now()
      db.prepare(
        `
        INSERT INTO media_items (id, dataset_id, local_path, sha256, width, height, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          dataset_id=excluded.dataset_id,
          local_path=excluded.local_path,
          sha256=excluded.sha256,
          width=excluded.width,
          height=excluded.height,
          updated_at=excluded.updated_at
      `
      ).run(
        payload.id,
        payload.dataset_id,
        payload.local_path,
        payload.sha256 ?? null,
        payload.width ?? null,
        payload.height ?? null,
        now,
        now
      )
      return { ok: true }
    }
  )

  ipcMain.handle(
    'db:media:setStatus',
    (_evt, payload: { media_id: string; status: 'in_progress' | 'completed' }) => {
      const db = getDb()
      const now = Date.now()
      db.prepare(`UPDATE media_items SET status=?, updated_at=? WHERE id=?`).run(
        payload.status,
        now,
        payload.media_id
      )
      return { ok: true }
    }
  )

  ipcMain.handle('db:media:listByDataset', (_evt, datasetId: string) => {
    const db = getDb()
    return db
      .prepare(
        `SELECT m.id, m.dataset_id, m.local_path, m.width, m.height, m.status, m.annotation_seconds, m.cloud_task_id, m.contract_id, a.sync_status
         FROM media_items m
         LEFT JOIN annotations a ON a.id = 'export:' || m.id
         WHERE m.dataset_id=? AND m.status != 'archived'
         ORDER BY m.created_at ASC`
      )
      .all(datasetId)
  })

  ipcMain.handle('db:media:setTime', (_evt, payload: { media_id: string; seconds: number }) => {
    const db = getDb()
    const now = Date.now()
    db.prepare(`UPDATE media_items SET annotation_seconds=?, updated_at=? WHERE id=?`).run(
      payload.seconds,
      now,
      payload.media_id
    )
    return { ok: true }
  })

  ipcMain.handle('db:datasets:list', () => {
    const db = getDb()
    return db
      .prepare('SELECT id, name, created_at, folder_path FROM datasets ORDER BY created_at DESC')
      .all()
  })

  // Save / Load exported annotation JSON as a single blob per media.
  // CRITICAL ARCHITECTURAL RULE: The backend expects exactly ONE full final snapshot
  // per media/task. We implement this by upserting a single row with id = `export:<media_id>`.
  ipcMain.handle(
    'db:annotations:saveExport',
    (
      _evt,
      payload: {
        media_id: string
        data_json: string
        cloud_task_id?: string
        contract_id?: string
        payload_json?: string
        payload_hash?: string
      }
    ) => {
      const db = getDb()
      const now = Date.now()
      const id = `export:${payload.media_id}`
      // P0-3: Explicit cloud vs local branching with NULL-safe SQLite CASE
      db.prepare(
        `
        INSERT INTO annotations (id, media_id, type, category, data_json, updated_at,
          cloud_task_id, contract_id, payload_json, payload_hash, sync_status)
        VALUES (?, ?, 'export', NULL, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data_json=CASE
            -- Once a cloud task snapshot has been synced, the backend task is
            -- submitted and cannot accept a different payload unless revision
            -- flow explicitly requeues it. Ignore later autosaves for that row.
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.data_json
            ELSE excluded.data_json
          END,
          updated_at=excluded.updated_at,
          cloud_task_id=excluded.cloud_task_id,
          contract_id=excluded.contract_id,
          payload_json=CASE
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.payload_json
            ELSE excluded.payload_json
          END,
          payload_hash=CASE
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.payload_hash
            ELSE excluded.payload_hash
          END,
          last_error=CASE
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.last_error
            WHEN excluded.cloud_task_id IS NULL THEN NULL
            WHEN excluded.payload_hash IS NOT NULL
              AND (
                annotations.last_synced_hash IS NULL
                OR excluded.payload_hash != annotations.last_synced_hash
              ) THEN NULL
            ELSE annotations.last_error
          END,
          attempt_count=CASE
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.attempt_count
            WHEN excluded.cloud_task_id IS NULL THEN 0
            WHEN excluded.payload_hash IS NOT NULL
              AND (
                annotations.last_synced_hash IS NULL
                OR excluded.payload_hash != annotations.last_synced_hash
              ) THEN 0
            ELSE annotations.attempt_count
          END,
          sync_status=CASE
            -- Synced cloud snapshots are immutable until revision flow requeues them.
            WHEN annotations.cloud_task_id IS NOT NULL
              AND annotations.sync_status = 'synced'
              AND annotations.last_synced_hash IS NOT NULL THEN annotations.sync_status
            -- Local-only save: always synced, never queue to backend
            WHEN excluded.cloud_task_id IS NULL THEN 'synced'
            -- Cloud task: new hash or no hash yet → queue for upload, clear stale errors
            WHEN excluded.payload_hash IS NOT NULL
              AND (
                annotations.last_synced_hash IS NULL
                OR excluded.payload_hash != annotations.last_synced_hash
              ) THEN 'pending_insert'
            -- Cloud task: same hash already synced → preserve current status
            WHEN excluded.payload_hash IS NOT NULL
              AND excluded.payload_hash = annotations.last_synced_hash THEN annotations.sync_status
            -- Fallback for cloud tasks with no hash provided
            ELSE 'pending_insert'
          END
      `
      ).run(
        id,
        payload.media_id,
        payload.data_json,
        now,
        payload.cloud_task_id ?? null,
        payload.contract_id ?? null,
        payload.payload_json ?? null,
        payload.payload_hash ?? null,
        payload.cloud_task_id ? 'pending_insert' : 'synced'
      )
      return { ok: true }
    }
  )

  ipcMain.handle('db:annotations:getExport', (_evt, mediaId: string) => {
    const db = getDb()
    const row = db
      .prepare(`SELECT data_json, updated_at FROM annotations WHERE id = ? LIMIT 1`)
      .get(`export:${mediaId}`) as { data_json: string; updated_at: number } | undefined

    return row ?? null
  })
}
