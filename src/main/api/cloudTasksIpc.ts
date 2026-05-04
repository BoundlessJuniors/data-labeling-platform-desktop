import { ipcMain, app } from 'electron'
import { createWriteStream, mkdirSync, renameSync, statSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { apiClient } from './apiClient'
import { getDb } from '../db/sqlite'
import { randomUUID } from 'crypto'
import axios from 'axios'
import { runSyncCycle } from '../sync/syncManager'

// -----------------------------------------------------------------------
// Cloud cache dizini — userData/cloud_cache
// -----------------------------------------------------------------------
const cacheDir = join(app.getPath('userData'), 'cloud_cache')
mkdirSync(cacheDir, { recursive: true })

// -----------------------------------------------------------------------
// Tip tanımları
// -----------------------------------------------------------------------
interface ContractItem {
  id: string
  status: string
  listing: { id?: string; title: string }
  client?: unknown
  labeler?: unknown
  tasks?: unknown[]
  _count?: { tasks: number }
  [key: string]: unknown
}

interface LeasedTask {
  id: string
  asset: {
    id: string
    objectKey?: string
    mimeType?: string
    width?: number
    height?: number
    signedUrl?: string
    [key: string]: unknown
  }
  // Top-level lease fields (new contract, preferred)
  leaseToken?: string | null
  leasedUntil?: string | number | null
  // Nested lease (legacy / backward-compat fallback)
  taskLease?: {
    leaseToken?: string | null
    leasedUntil?: string | number | null
  } | null
  [key: string]: unknown
}

// -----------------------------------------------------------------------
// Normalize lease fields: prefer top-level, fall back to nested taskLease.
// -----------------------------------------------------------------------
function resolveLeaseFields(task: LeasedTask): {
  leaseToken: string | null
  leasedUntil: string | number | null | undefined
} {
  const leaseToken = (task.leaseToken ?? task.taskLease?.leaseToken) || null
  const leasedUntil =
    task.leasedUntil !== undefined ? task.leasedUntil : task.taskLease?.leasedUntil
  return { leaseToken, leasedUntil }
}

// -----------------------------------------------------------------------
// Lease persistence helpers
// -----------------------------------------------------------------------
function upsertTaskLease(
  taskId: string,
  contractId: string,
  leaseToken: string,
  leasedUntil: number | null
): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO task_leases (task_id, contract_id, lease_token, leased_until, created_at, updated_at)
     VALUES (@task_id, @contract_id, @lease_token, @leased_until, @now, @now)
     ON CONFLICT(task_id) DO UPDATE SET
       lease_token = @lease_token,
       leased_until = @leased_until,
       updated_at = @now`
  ).run({
    task_id: taskId,
    contract_id: contractId,
    lease_token: leaseToken,
    leased_until: leasedUntil,
    now
  })
}

function getLease(
  taskId: string
): { lease_token: string; contract_id: string; leased_until: number | null } | null {
  const db = getDb()
  const row = db
    .prepare('SELECT lease_token, contract_id, leased_until FROM task_leases WHERE task_id = ?')
    .get(taskId) as
    | { lease_token: string; contract_id: string; leased_until: number | null }
    | undefined
  return row ?? null
}

function deleteLease(taskId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM task_leases WHERE task_id = ?').run(taskId)
}

// -----------------------------------------------------------------------
// Yardımcı: Stream'i promise'e dönüştür
// -----------------------------------------------------------------------
function streamToFile(stream: NodeJS.ReadableStream, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const writer = createWriteStream(destPath)
    stream.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
    stream.on('error', reject)
  })
}

// -----------------------------------------------------------------------
// Resolve asset signed URL
// -----------------------------------------------------------------------
async function resolveAssetUrl(assetId: string): Promise<string | null> {
  try {
    const resp = await apiClient.get<{
      success: boolean
      data: { url?: string; signedUrl?: string }
    }>(`/api/v1/assets/${assetId}`)
    const resolvedUrl = resp.data.data?.signedUrl || resp.data.data?.url
    if (resolvedUrl && (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://'))) {
      return resolvedUrl
    }
    return null
  } catch (err: unknown) {
    const error = err as { message: string; response?: { status?: number } }
    console.error(`[cloud] Failed to resolve asset URL for assetId=${assetId}: ${error.message}`)
    return null
  }
}

// -----------------------------------------------------------------------
// Parse leased_until to epoch ms (or null)
// -----------------------------------------------------------------------
function parseLeasedUntil(val: string | number | null | undefined): number | null {
  if (val == null) return null
  if (typeof val === 'number') return val
  const ms = new Date(val).getTime()
  return isNaN(ms) ? null : ms
}

// -----------------------------------------------------------------------
// Helper: Compute Contract Health
// -----------------------------------------------------------------------
async function computeContractHealth(
  contractId: string,
  expectedTaskCount?: number
): Promise<{
  expectedTaskCount: number
  localDownloadedCount: number
  notDownloadedCount: number
  inProgressCount: number
  missingLocalExportCount: number
  pendingInsertCount: number
  failedPermanentCount: number
  leaseExpiredCount: number
  conflictCount: number
  totalUnsyncedCount: number
  canSubmit: boolean
  primaryBlockReason: string | null
}> {
  const db = getDb()

  // media stats
  const mediaStats = db
    .prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress FROM media_items WHERE contract_id = ? AND status != 'archived'`
    )
    .get(contractId) as { total: number; in_progress: number }

  const localDownloadedCount = mediaStats.total ?? 0
  const inProgressCount = mediaStats.in_progress ?? 0

  let notDownloadedCount = 0
  if (typeof expectedTaskCount === 'number' && expectedTaskCount > 0) {
    if (expectedTaskCount > localDownloadedCount) {
      notDownloadedCount = expectedTaskCount - localDownloadedCount
    }
  }

  // unsynced annotations
  const unsyncedRow = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN sync_status = 'pending_insert' THEN 1 ELSE 0 END) as pending_count,
         SUM(CASE WHEN sync_status = 'failed_permanent' THEN 1 ELSE 0 END) as failed_count,
         SUM(CASE WHEN sync_status = 'lease_expired' THEN 1 ELSE 0 END) as lease_expired_count,
         SUM(CASE WHEN sync_status = 'task_already_submitted_conflict' THEN 1 ELSE 0 END) as conflict_count
       FROM annotations
       WHERE contract_id = ? AND sync_status NOT IN ('synced', 'archived') AND id LIKE 'export:%'`
    )
    .get(contractId) as {
    total: number
    pending_count: number
    failed_count: number
    lease_expired_count: number
    conflict_count: number
  }

  const totalUnsyncedCount = unsyncedRow.total ?? 0
  const pendingInsertCount = unsyncedRow.pending_count ?? 0
  const leaseExpiredCount = unsyncedRow.lease_expired_count ?? 0
  const failedPermanentCount = unsyncedRow.failed_count ?? 0
  const conflictCount = unsyncedRow.conflict_count ?? 0

  // missingLocalExportCount: completed media items with no corresponding export annotation
  const missingExportRow = db
    .prepare(
      `SELECT COUNT(*) as missing_count
       FROM media_items m
       LEFT JOIN annotations a ON a.id = 'export:' || m.id
       WHERE m.contract_id = ? AND m.status = 'completed' AND a.id IS NULL`
    )
    .get(contractId) as { missing_count: number }

  const missingLocalExportCount = missingExportRow.missing_count ?? 0

  const canSubmit =
    notDownloadedCount === 0 &&
    inProgressCount === 0 &&
    totalUnsyncedCount === 0 &&
    missingLocalExportCount === 0 &&
    conflictCount === 0

  let primaryBlockReason: string | null = null
  if (!canSubmit) {
    if (conflictCount > 0) {
      primaryBlockReason = `Bazı görevler backend’de zaten submitted durumda ancak lokal veriniz farklı. Çakışma çözülmeden teslim edilemez.`
    } else if (notDownloadedCount > 0) {
      primaryBlockReason = `Eksik Görevler: ${notDownloadedCount} adet görev henüz cihazınıza indirilmemiş.`
    } else if (inProgressCount > 0) {
      primaryBlockReason = `Eksik Çalışma: ${inProgressCount} adet görevin çalışması henüz tamamlanmadı (Save Draft -> Mark as Complete).`
    } else if (missingLocalExportCount > 0) {
      primaryBlockReason = `Veri Bütünlüğü: ${missingLocalExportCount} adet görev tamamlandı olarak işaretlenmiş ancak kayıtlı etiket verisi bulunmuyor.`
    } else if (totalUnsyncedCount > 0) {
      primaryBlockReason = `${totalUnsyncedCount} görev buluta henüz tam olarak senkronize edilmedi.`
      if (leaseExpiredCount > 0) {
        primaryBlockReason += ` (${leaseExpiredCount} görevin süresi doldu — kurtarılması gerekiyor.)`
      }
    } else {
      primaryBlockReason = 'Kontrat teslim edilemedi.'
    }
  }

  return {
    expectedTaskCount: expectedTaskCount ?? 0,
    localDownloadedCount,
    notDownloadedCount,
    inProgressCount,
    missingLocalExportCount,
    pendingInsertCount,
    failedPermanentCount,
    leaseExpiredCount,
    conflictCount,
    totalUnsyncedCount,
    canSubmit,
    primaryBlockReason
  }
}

// -----------------------------------------------------------------------
// Tüm cloud IPC handler'larını kayıt eder.
// -----------------------------------------------------------------------
export function registerCloudTasksIpc(): void {
  // ----------------------------------------------------------------------
  // cloud:fetchContracts
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:fetchContracts', async (): Promise<ContractItem[]> => {
    const PAGE_LIMIT = 100
    const allContracts: ContractItem[] = []
    let page = 1
    let totalPages = 1

    do {
      const response = await apiClient.get<{
        success: boolean
        data: ContractItem[]
        pagination?: { page: number; totalPages: number }
      }>('/api/v1/contracts', { params: { page, limit: PAGE_LIMIT } })

      const pageData = response.data.data ?? []
      allContracts.push(...pageData)

      const pagination = response.data.pagination
      if (pagination) {
        totalPages = pagination.totalPages ?? 1
      } else {
        // No pagination envelope returned — single-page response, stop.
        break
      }

      page++
    } while (page <= totalPages)

    return allContracts
  })

  // ----------------------------------------------------------------------
  // cloud:downloadContractWork
  // Atomic lease-batch + download flow.
  // ----------------------------------------------------------------------
  ipcMain.handle(
    'cloud:downloadContractWork',
    async (
      _event,
      contractId: string,
      datasetId: string,
      amount: number,
      expectedTaskCount?: number
    ): Promise<{
      leased: number
      downloaded: number
      skipped: number
      failed: number
      status: string
    }> => {
      console.log(
        `[cloud:downloadContractWork] contractId=${contractId} datasetId=${datasetId} amount=${amount} expectedTaskCount=${expectedTaskCount}`
      )

      const db = getDb()

      // Pre-flight: detect revision_requested so we can requeue existing exports
      let contractStatus: string | null = null
      try {
        const contractResp = await apiClient.get<{ success: boolean; data: { status: string } }>(
          `/api/v1/contracts/${contractId}`
        )
        contractStatus = contractResp.data?.data?.status ?? null
      } catch (err: unknown) {
        console.warn(
          `[cloud:downloadContractWork] Could not fetch contract status: ${(err as Error).message}`
        )
      }
      const isRevision = contractStatus === 'revision_requested'

      // Pre-flight health check for stale local state
      const health = await computeContractHealth(contractId, expectedTaskCount)

      let hasStaleFailed = false
      if (health.failedPermanentCount > 0) {
        const staleFails = db
          .prepare(
            `SELECT COUNT(*) as c FROM annotations WHERE contract_id = ? AND sync_status = 'failed_permanent' AND last_error IN ('missing_lease_token', 'lease_expired', 'lease_expired_local')`
          )
          .get(contractId) as { c: number }
        if (staleFails.c > 0) hasStaleFailed = true
      }

      // For revision_requested contracts, allow lease-batch to run even when local state
      // has stale lease errors — the backend will issue fresh tokens for rejected tasks.
      if (!isRevision && (health.leaseExpiredCount > 0 || hasStaleFailed)) {
        return { leased: 0, downloaded: 0, skipped: 0, failed: 0, status: 'stale_local_state' }
      }

      // P0-4: For revision_requested, never skip — we need to re-lease and requeue
      if (!isRevision && expectedTaskCount && health.localDownloadedCount >= expectedTaskCount) {
        return {
          leased: 0,
          downloaded: 0,
          skipped: 0,
          failed: 0,
          status: 'already_fully_downloaded'
        }
      }

      // 0. Update labeling metadata before any tasks are leased
      try {
        const metaResp = await apiClient.get<{
          success: boolean
          data: {
            contract: unknown
            listing: { annotationFormat?: string; labelingSpecJson?: unknown; qcMode?: string }
            labelSet?: {
              name?: string
              version?: number
              labels: Array<{
                id?: string
                name: string
                color?: string
                attributesSchemaJson?: unknown
              }>
            }
          }
        }>(`/api/v1/contracts/${contractId}/labeling-context`)

        if (!metaResp.data?.data) {
          throw new Error('Labeling context response was empty from the server')
        }

        const meta = metaResp.data.data
        if (!meta.labelSet) {
          throw new Error(
            'The cloud contract does not have a configured label set. Downloading tasks without a label set is prohibited.'
          )
        }

        // Update dataset metadata
        db.prepare(
          `UPDATE datasets SET
            label_source = 'cloud',
            annotation_format = ?,
            labeling_spec_json = ?,
            qc_mode = ?,
            label_set_name = ?,
            label_set_version = ?
           WHERE id = ?`
        ).run(
          meta.listing.annotationFormat ?? null,
          meta.listing.labelingSpecJson ? JSON.stringify(meta.listing.labelingSpecJson) : null,
          meta.listing.qcMode ?? null,
          meta.labelSet?.name ?? null,
          meta.labelSet?.version ?? null,
          datasetId
        )

        // Replace dataset labels
        if (Array.isArray(meta.labelSet.labels)) {
          const tx = db.transaction(() => {
            db.prepare(`DELETE FROM dataset_labels WHERE dataset_id = ?`).run(datasetId)

            const stmt = db.prepare(
              `INSERT INTO dataset_labels (id, dataset_id, name, color, attributes_schema_json, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'cloud', ?, ?)`
            )
            const now = Date.now()
            for (const lbl of meta.labelSet!.labels) {
              stmt.run(
                lbl.id || randomUUID(),
                datasetId,
                lbl.name,
                lbl.color ?? null,
                lbl.attributesSchemaJson ? JSON.stringify(lbl.attributesSchemaJson) : null,
                now,
                now
              )
            }
          })
          tx()
        }
        console.log(`[cloud:downloadContractWork] Successfully refreshed labeling context locally.`)
      } catch (err: unknown) {
        console.error(
          `[cloud:downloadContractWork] Could not fetch labeling context: ${(err as Error).message}`
        )
        throw new Error(`Cloud etiket ayarları alınamadı: ${(err as Error).message}`)
      }

      // 1. Lease tasks in batch
      let leasedTasks: LeasedTask[] = []
      try {
        const leaseResp = await apiClient.post<{
          success: boolean
          data: LeasedTask[]
        }>('/api/v1/tasks/lease-batch', { contractId, amount })
        leasedTasks = leaseResp.data.data ?? []
        console.log(`[cloud:downloadContractWork] Leased ${leasedTasks.length} tasks`)
      } catch (err: unknown) {
        const error = err as { message: string; response?: { status?: number } }
        console.error(
          `[cloud:downloadContractWork] lease-batch failed: status=${error.response?.status ?? 'unknown'} message="${error.message}"`
        )
        throw new Error(`Görevler kiralanamadı: ${error.message}`)
      }

      if (leasedTasks.length === 0) {
        // Re-evaluate health to see if we reached the expected count or have stale state
        const reHealth = await computeContractHealth(contractId, expectedTaskCount)
        // In revision_requested mode all tasks may already be local but still need re-leasing.
        if (
          !isRevision &&
          expectedTaskCount &&
          reHealth.localDownloadedCount >= expectedTaskCount
        ) {
          return {
            leased: 0,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            status: 'already_fully_downloaded'
          }
        }

        let hasStaleFailed2 = false
        if (reHealth.failedPermanentCount > 0) {
          const staleFails = db
            .prepare(
              `SELECT COUNT(*) as c FROM annotations WHERE contract_id = ? AND sync_status = 'failed_permanent' AND last_error IN ('missing_lease_token', 'lease_expired', 'lease_expired_local')`
            )
            .get(contractId) as { c: number }
          if (staleFails.c > 0) hasStaleFailed2 = true
        }

        // Same revision bypass: don't block on stale lease state after zero-leased result.
        if (!isRevision && (reHealth.leaseExpiredCount > 0 || hasStaleFailed2)) {
          return { leased: 0, downloaded: 0, skipped: 0, failed: 0, status: 'stale_local_state' }
        }
        return { leased: 0, downloaded: 0, skipped: 0, failed: 0, status: 'zero_leased' }
      }

      let downloaded = 0
      let skipped = 0
      let failed = 0

      // 2. Persist leases + download assets
      for (const task of leasedTasks) {
        const taskId = task.id
        const assetId = task.asset?.id
        const { leaseToken, leasedUntil: rawLeasedUntil } = resolveLeaseFields(task)
        const leasedUntil = parseLeasedUntil(rawLeasedUntil)

        if (!leaseToken) {
          console.error(
            `[cloud:downloadContractWork] No lease token for taskId=${taskId}, skipping`
          )
          failed++
          continue
        }

        // 2a. Persist lease (before download — lease is rolled back on download failure)
        upsertTaskLease(taskId, contractId, leaseToken, leasedUntil)

        // 2b. Check if already downloaded (unique cloud_task_id)
        const existing = db
          .prepare('SELECT id, status FROM media_items WHERE cloud_task_id = ?')
          .get(taskId) as { id: string; status: string } | undefined

        if (existing) {
          console.log(`[cloud:downloadContractWork] skip (already_downloaded) taskId=${taskId}`)
          if (existing.status === 'archived') {
            console.log(`[cloud:downloadContractWork] restoring archived task taskId=${taskId}`)
            db.prepare(`UPDATE media_items SET status = 'completed' WHERE id = ?`).run(existing.id)
            db.prepare(
              `UPDATE annotations SET sync_status = 'pending_insert', last_error = NULL, attempt_count = 0 WHERE media_id = ? AND id = ?`
            ).run(existing.id, `export:${existing.id}`)
          } else if (isRevision) {
            // P0-4: Revision flow — requeue existing export so syncManager re-submits with new lease token.
            // Do NOT overwrite payload_json / payload_hash / data_json / last_synced_hash.
            console.log(
              `[cloud:downloadContractWork] revision requeue taskId=${taskId} mediaId=${existing.id}`
            )
            db.prepare(
              `UPDATE annotations
               SET sync_status = 'pending_insert', last_error = NULL, attempt_count = 0
               WHERE id = ? AND cloud_task_id IS NOT NULL`
            ).run(`export:${existing.id}`)
          }
          skipped++
          continue
        }

        // 2c. Resolve signed URL (ephemeral, not persisted)
        let downloadUrl: string | null = null
        if (
          task.asset?.signedUrl &&
          (task.asset.signedUrl.startsWith('http://') ||
            task.asset.signedUrl.startsWith('https://'))
        ) {
          downloadUrl = task.asset.signedUrl
        } else if (assetId) {
          downloadUrl = await resolveAssetUrl(assetId)
        }

        if (!downloadUrl) {
          console.error(
            `[cloud:downloadContractWork] No download URL for taskId=${taskId} assetId=${assetId}, rolling back lease`
          )
          // Rollback: lease persist edilmişti, URL yoksa local state temizle
          deleteLease(taskId)
          failed++
          continue
        }

        // 2d. Download asset to cloud_cache
        let tmpPath = ''
        let finalPath = ''

        try {
          const imageResp = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 30000
          })

          let ext = '.bin'
          const contentType = imageResp.headers['content-type'] as string | undefined
          if (contentType) {
            if (contentType.includes('image/png')) ext = '.png'
            else if (contentType.includes('image/webp')) ext = '.webp'
            else if (contentType.includes('image/jpeg')) ext = '.jpg'
            else if (contentType.includes('image/gif')) ext = '.gif'
          }
          if (ext === '.bin') {
            try {
              const parsedUrl = new URL(downloadUrl)
              const match = parsedUrl.pathname.match(/\.(png|jpe?g|webp|gif)$/i)
              if (match) ext = match[0].toLowerCase()
            } catch {
              /* ignore */
            }
          }

          const base = `${assetId}_${taskId}`
          finalPath = join(cacheDir, base + ext)
          tmpPath = finalPath + '.part'

          await streamToFile(imageResp.data, tmpPath)

          const stats = statSync(tmpPath)
          if (stats.size === 0) {
            throw new Error('Downloaded file is empty (0 bytes)')
          }

          renameSync(tmpPath, finalPath)

          // 2e. Insert media_items row (only on successful download)
          const mediaId = randomUUID()
          const now = Date.now()

          db.prepare(
            `INSERT INTO media_items
              (id, dataset_id, local_path, cloud_task_id, cloud_asset_id, contract_id,
               cloud_asset_url, sync_status, status, download_status, created_at, updated_at)
             VALUES
              (@id, @dataset_id, @local_path, @cloud_task_id, @cloud_asset_id, @contract_id,
               @cloud_asset_url, @sync_status, @status, @download_status, @created_at, @updated_at)`
          ).run({
            id: mediaId,
            dataset_id: datasetId,
            local_path: finalPath,
            cloud_task_id: taskId,
            cloud_asset_id: assetId,
            contract_id: contractId,
            cloud_asset_url: '', // signed URL not persisted
            sync_status: 'synced',
            status: 'in_progress',
            download_status: 'ok',
            created_at: now,
            updated_at: now
          })

          console.log(
            `[cloud:downloadContractWork] ok taskId=${taskId} assetId=${assetId} path=${finalPath}`
          )
          downloaded++
        } catch (err: unknown) {
          // Cleanup tmp file
          if (tmpPath && existsSync(tmpPath)) {
            try {
              unlinkSync(tmpPath)
            } catch {
              /* ignore */
            }
          }
          // Rollback lease: download başarısız olduğunda orphan lease bırakma.
          // Backend'de lease alınmış olsa da local state temiz kalır;
          // backend lease expire olunca task yeniden lease alınabilir.
          deleteLease(taskId)
          const error = err as { message: string; response?: { status?: number; data?: unknown } }
          console.error(
            `[cloud:downloadContractWork] fail taskId=${taskId} assetId=${assetId} message="${error.message}" — lease rolled back`
          )
          failed++
        }
      }

      return { leased: leasedTasks.length, downloaded, skipped, failed, status: 'downloaded' }
    }
  )

  // ----------------------------------------------------------------------
  // cloud:syncNow
  // Manual trigger for background sync cycle
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:syncNow', async () => {
    await runSyncCycle()
    return { ok: true }
  })

  // ----------------------------------------------------------------------
  // cloud:getContractHealth
  // Centralized health layer for a contract.
  // ----------------------------------------------------------------------
  ipcMain.handle(
    'cloud:getContractHealth',
    async (_event, contractId: string, expectedTaskCount?: number) => {
      return await computeContractHealth(contractId, expectedTaskCount)
    }
  )

  // ----------------------------------------------------------------------
  // cloud:recoverExpiredTasks
  // Archiving local lease_expired state + deleting media/lease to redownload.
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:recoverExpiredTasks', async (_event, contractId: string) => {
    const db = getDb()

    const expired = db
      .prepare(
        `SELECT media_id, cloud_task_id, id as annotation_id 
         FROM annotations 
         WHERE contract_id = ? AND sync_status = 'lease_expired' AND id LIKE 'export:%'`
      )
      .all(contractId) as { media_id: string; cloud_task_id: string; annotation_id: string }[]

    let recoveredCount = 0
    const tx = db.transaction(() => {
      for (const row of expired) {
        // Safe archival: mark annotation as archived instead of deleting
        db.prepare(
          `UPDATE annotations 
           SET sync_status = 'archived', last_error = 'archived_due_to_lease_expiration'
           WHERE id = ?`
        ).run(row.annotation_id)

        if (row.cloud_task_id) {
          db.prepare(`DELETE FROM task_leases WHERE task_id = ?`).run(row.cloud_task_id)
        }

        // Safe archival: mark media_item as archived instead of deleting to preserve dataset cascade and user data
        db.prepare(`UPDATE media_items SET status = 'archived' WHERE id = ?`).run(row.media_id)
        recoveredCount++
      }
    })
    tx()

    return { ok: true, recoveredCount }
  })

  // ----------------------------------------------------------------------
  // cloud:submitContract
  // Runs sync first, validates health, then submits.
  // ----------------------------------------------------------------------
  ipcMain.handle(
    'cloud:submitContract',
    async (
      _event,
      contractId: string,
      expectedTaskCount?: number
    ): Promise<{
      ok: boolean
      unsyncedCount?: number
      failedCount?: number
      leaseExpiredCount?: number
      pendingInsertCount?: number
      inProgressCount?: number
      notDownloadedCount?: number
      missingLocalExportCount?: number
      error?: string
      data?: unknown
    }> => {
      // 1. Run sync first
      try {
        await runSyncCycle()
      } catch (err: unknown) {
        console.error('[cloud:submitContract] Sync cycle failed:', (err as Error).message)
      }

      // 2. Compute centralized contract health
      const health = await computeContractHealth(contractId, expectedTaskCount)

      // Block criteria: missing downloads, in progress local work, missing exports, or unsynced work
      if (!health.canSubmit) {
        console.log(
          `[cloud:submitContract] Blocked: missingDls=${health.notDownloadedCount}, inProgress=${health.inProgressCount}, missingExp=${health.missingLocalExportCount}, pending=${health.pendingInsertCount}, failed=${health.failedPermanentCount}, lease_expired=${health.leaseExpiredCount}`
        )
        return {
          ok: false,
          unsyncedCount: health.totalUnsyncedCount,
          pendingInsertCount: health.pendingInsertCount,
          failedCount: health.failedPermanentCount,
          leaseExpiredCount: health.leaseExpiredCount,
          inProgressCount: health.inProgressCount,
          notDownloadedCount: health.notDownloadedCount,
          missingLocalExportCount: health.missingLocalExportCount,
          error: health.primaryBlockReason ?? 'Kontrat teslim edilemedi.'
        }
      }

      // 3. Submit contract
      try {
        const response = await apiClient.patch<{
          success: boolean
          data?: unknown
        }>(`/api/v1/contracts/${contractId}/submit`)
        return { ok: true, data: response.data.data }
      } catch (err: unknown) {
        const error = err as { message: string }
        console.error(`[cloud:submitContract] contractId=${contractId} failed:`, error.message)
        throw error
      }
    }
  )
  // ----------------------------------------------------------------------
  // cloud:resetContractLocalState
  // Fully clears local state only for that contract safely
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:resetContractLocalState', async (_event, contractId: string) => {
    const db = getDb()

    // Find media items to clean up cached files
    const mediaItems = db
      .prepare(`SELECT id, local_path FROM media_items WHERE contract_id = ?`)
      .all(contractId) as { id: string; local_path: string }[]

    let deletedDatasets = 0
    let deletedMediaItems = 0
    let deletedAnnotations = 0
    let deletedLeases = 0

    const tx = db.transaction(() => {
      // 1. Delete annotations
      const annRes = db
        .prepare(
          `DELETE FROM annotations WHERE contract_id = ? OR media_id IN (SELECT id FROM media_items WHERE contract_id = ?)`
        )
        .run(contractId, contractId)
      deletedAnnotations = annRes.changes

      // 2. Delete task_leases
      const leaseRes = db
        .prepare(
          `DELETE FROM task_leases WHERE contract_id = ? OR task_id IN (SELECT cloud_task_id FROM media_items WHERE contract_id = ?)`
        )
        .run(contractId, contractId)
      deletedLeases = leaseRes.changes

      // 3. Delete media_items
      const mediaRes = db.prepare(`DELETE FROM media_items WHERE contract_id = ?`).run(contractId)
      deletedMediaItems = mediaRes.changes

      // 4. Delete dataset_labels (for datasets of this contract)
      db.prepare(
        `DELETE FROM dataset_labels WHERE dataset_id IN (SELECT id FROM datasets WHERE cloud_contract_id = ?)`
      ).run(contractId)

      // 5. Delete datasets
      const dsRes = db.prepare(`DELETE FROM datasets WHERE cloud_contract_id = ?`).run(contractId)
      deletedDatasets = dsRes.changes
    })
    tx()

    // 6. Asynchronously delete cached files best-effort
    let deletedFiles = 0
    for (const m of mediaItems) {
      if (m.local_path && existsSync(m.local_path)) {
        try {
          unlinkSync(m.local_path)
          deletedFiles++
        } catch (e) {
          console.warn(`[cloud:resetContractLocalState] Failed to delete file ${m.local_path}`, e)
        }
      }
    }

    return {
      ok: true,
      deletedDatasets,
      deletedMediaItems,
      deletedAnnotations,
      deletedLeases,
      deletedFiles
    }
  })
}

// Export helpers for syncManager
export { getLease, deleteLease }
