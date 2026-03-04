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
  title: string
  status: string
  listing?: { title: string }
  [key: string]: unknown
}

interface LeasedTask {
  id: string
  asset: {
    id: string
    objectKey?: string
    mimeType?: string
    signedUrl?: string
    [key: string]: unknown
  }
  taskLease: {
    leaseToken: string
    leasedUntil?: string | number | null
  }
  contractId: string
  [key: string]: unknown
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
// Tüm cloud IPC handler'larını kayıt eder.
// -----------------------------------------------------------------------
export function registerCloudTasksIpc(): void {
  // ----------------------------------------------------------------------
  // cloud:fetchContracts
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:fetchContracts', async (): Promise<ContractItem[]> => {
    const response = await apiClient.get<{ success: boolean; data: ContractItem[] }>(
      '/api/v1/contracts'
    )
    return response.data.data ?? []
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
      amount: number
    ): Promise<{ leased: number; downloaded: number; skipped: number; failed: number }> => {
      console.log(
        `[cloud:downloadContractWork] contractId=${contractId} datasetId=${datasetId} amount=${amount}`
      )

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

      const db = getDb()
      let downloaded = 0
      let skipped = 0
      let failed = 0

      // 2. Persist leases + download assets
      for (const task of leasedTasks) {
        const taskId = task.id
        const assetId = task.asset?.id
        const leaseToken = task.taskLease?.leaseToken
        const leasedUntil = parseLeasedUntil(task.taskLease?.leasedUntil)

        if (!leaseToken) {
          console.error(
            `[cloud:downloadContractWork] No lease token for taskId=${taskId}, skipping`
          )
          failed++
          continue
        }

        // 2a. Persist lease (preserves created_at on re-lease)
        upsertTaskLease(taskId, contractId, leaseToken, leasedUntil)

        // 2b. Check if already downloaded (unique cloud_task_id)
        const existing = db
          .prepare('SELECT id FROM media_items WHERE cloud_task_id = ?')
          .get(taskId)

        if (existing) {
          console.log(`[cloud:downloadContractWork] skip (already_downloaded) taskId=${taskId}`)
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
            `[cloud:downloadContractWork] No download URL for taskId=${taskId} assetId=${assetId}`
          )
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

          // 2e. Insert media_items row
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
          if (tmpPath && existsSync(tmpPath)) {
            try {
              unlinkSync(tmpPath)
            } catch {
              /* ignore */
            }
          }
          const error = err as { message: string; response?: { status?: number; data?: unknown } }
          console.error(
            `[cloud:downloadContractWork] fail taskId=${taskId} assetId=${assetId} message="${error.message}"`
          )
          failed++
        }
      }

      return { leased: leasedTasks.length, downloaded, skipped, failed }
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
  // cloud:submitContract
  // Runs sync first, validates no unsynced annotations, then submits.
  // ----------------------------------------------------------------------
  ipcMain.handle(
    'cloud:submitContract',
    async (
      _event,
      contractId: string
    ): Promise<{
      ok: boolean
      unsyncedCount?: number
      failedCount?: number
      error?: string
    }> => {
      // 1. Run sync first
      try {
        await runSyncCycle()
      } catch (err: unknown) {
        console.error('[cloud:submitContract] Sync cycle failed:', (err as Error).message)
      }

      // 2. Check for unsynced annotations
      const db = getDb()
      const unsyncedRow = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN sync_status = 'failed_permanent' THEN 1 ELSE 0 END) as failed_count
           FROM annotations
           WHERE contract_id = ? AND sync_status NOT IN ('synced')`
        )
        .get(contractId) as { total: number; failed_count: number }

      if (unsyncedRow.total > 0) {
        console.log(
          `[cloud:submitContract] Blocked: ${unsyncedRow.total} unsynced (${unsyncedRow.failed_count} failed_permanent)`
        )
        return {
          ok: false,
          unsyncedCount: unsyncedRow.total,
          failedCount: unsyncedRow.failed_count,
          error: `${unsyncedRow.total} görev henüz senkronize edilmedi.`
        }
      }

      // 3. Submit contract
      try {
        const response = await apiClient.patch(`/api/v1/contracts/${contractId}/submit`)
        return { ok: true, ...response.data }
      } catch (err: unknown) {
        const error = err as { message: string }
        console.error(`[cloud:submitContract] contractId=${contractId} failed:`, error.message)
        throw error
      }
    }
  )
}

// Export helpers for syncManager
export { getLease, deleteLease }
