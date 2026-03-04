import { ipcMain } from 'electron'
import { getDb } from '../db/sqlite'

export function registerDbIpc(): void {
  ipcMain.handle('db:ping', () => ({ ok: true }))

  ipcMain.handle(
    'db:datasets:create',
    (
      _evt,
      payload: { id: string; name: string; folder_path?: string | null; cloud_contract_id?: string }
    ) => {
      const db = getDb()
      const now = Date.now()
      db.prepare(
        'INSERT OR IGNORE INTO datasets (id, name, folder_path, cloud_contract_id, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        payload.id,
        payload.name,
        payload.folder_path ?? null,
        payload.cloud_contract_id ?? null,
        now
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
      // annotations -> media_items -> datasets
      db.prepare(
        `DELETE FROM annotations 
         WHERE media_id IN (SELECT id FROM media_items WHERE dataset_id = ?)`
      ).run(datasetId)
      db.prepare(`DELETE FROM media_items WHERE dataset_id = ?`).run(datasetId)
      db.prepare(`DELETE FROM datasets WHERE id = ?`).run(datasetId)
    })
    tx()
    return { ok: true }
  })

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
        'SELECT id, dataset_id, local_path, width, height, status, annotation_seconds, cloud_task_id, contract_id FROM media_items WHERE dataset_id=? ORDER BY created_at ASC'
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

  // Save / Load exported annotation JSON as a single blob per media
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
      db.prepare(
        `
        INSERT INTO annotations (id, media_id, type, category, data_json, updated_at,
          cloud_task_id, contract_id, payload_json, payload_hash, sync_status)
        VALUES (?, ?, 'export', NULL, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data_json=excluded.data_json,
          updated_at=excluded.updated_at,
          cloud_task_id=excluded.cloud_task_id,
          contract_id=excluded.contract_id,
          payload_json=excluded.payload_json,
          payload_hash=excluded.payload_hash,
          sync_status=CASE
            WHEN excluded.payload_hash != annotations.last_synced_hash
                 OR annotations.last_synced_hash IS NULL
            THEN 'pending_insert'
            ELSE annotations.sync_status
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
