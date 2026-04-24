import { getDb } from '../db/sqlite'
import { apiClient } from '../api/apiClient'

// -----------------------------------------------------------------------
// Yapılandırma
// -----------------------------------------------------------------------
const SYNC_INTERVAL_MS = 30_000 // 30 saniye

// -----------------------------------------------------------------------
// Tip tanımı — sync sorgusu satır şekli
// -----------------------------------------------------------------------
interface PendingAnnotation {
  annotation_id: string
  payload_json: string | null
  cloud_task_id: string
  payload_hash: string | null
  last_synced_hash: string | null
}

// -----------------------------------------------------------------------
// Error classification helper
// -----------------------------------------------------------------------
function classifyHttpError(status: number, body: string): { retryable: boolean; errorKey: string } {
  if (status === 409) {
    return { retryable: false, errorKey: 'already_submitted' }
  }
  if (status === 400 && body.includes('Cannot submit task with status: submitted')) {
    return { retryable: false, errorKey: 'already_submitted' }
  }
  // 401/403: auth/session problem — NOT a permanent data failure.
  // Callers should check for 'auth_invalid' and skip without modifying DB state.
  if (status === 401) {
    return { retryable: false, errorKey: 'auth_invalid' }
  }
  if (status === 403) {
    const lower = body.toLowerCase()
    if (lower.includes('expired') || lower.includes('lease')) {
      // lease_expired is a distinct non-retryable error — kept separate from generic 'forbidden'
      // so UI/recovery logic can identify and handle it differently in the future.
      return { retryable: false, errorKey: 'lease_expired' }
    }
    // Generic 403 that is NOT a lease error: treat as auth_invalid so it is
    // not written to the DB as failed_permanent.
    return { retryable: false, errorKey: 'auth_invalid' }
  }
  if (status === 400) {
    return { retryable: false, errorKey: body.substring(0, 200) || 'validation_error' }
  }
  if (status >= 500) {
    return { retryable: true, errorKey: `server_error_${status}` }
  }
  // Unknown client errors are non-retryable
  if (status >= 400 && status < 500) {
    return { retryable: false, errorKey: `client_error_${status}` }
  }
  return { retryable: true, errorKey: 'unknown_error' }
}

// -----------------------------------------------------------------------
// Session probe — returns false when the server says the session is invalid.
// Network failures (no status / 5xx) are treated as "unknown" and return true
// so we don't skip sync on transient connectivity issues.
// -----------------------------------------------------------------------
async function isSessionValid(): Promise<boolean> {
  try {
    await apiClient.get('/api/v1/auth/profile')
    return true
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.response?.status ?? 0
    if (status === 401 || status === 403) {
      console.warn('[syncManager] Session probe: 401/403 — session invalid, skipping sync cycle')
      return false
    }
    // Network error or 5xx: we cannot confirm the session is invalid.
    // Be conservative and let the cycle proceed; each submit call will
    // handle its own errors.
    console.warn(
      `[syncManager] Session probe: status=${status || 'network_error'} — assuming session OK, proceeding`
    )
    return true
  }
}

// -----------------------------------------------------------------------
// Tek seferlik senkronizasyon döngüsü
// CRITICAL: Bu döngü backend'e sadece FULL FINAL SNAPSHOT payloads (export) gönderir,
// asıl beklenen de budur. Parçalı gönderim desteklenmez ve yapılmamalıdır.
// -----------------------------------------------------------------------
export async function runSyncCycle(): Promise<void> {
  let db
  try {
    db = getDb()
  } catch {
    return
  }

  // Lazy import to avoid circular dependency at module load time
  const { getLease } = await import('../api/cloudTasksIpc')

  // Query pending annotations with cloud_task_id — NO media_items join
  const pending = db
    .prepare(
      `SELECT
         a.id              AS annotation_id,
         a.payload_json,
         a.cloud_task_id,
         a.payload_hash,
         a.last_synced_hash
       FROM annotations a
       WHERE a.sync_status = 'pending_insert'
         AND a.cloud_task_id IS NOT NULL`
    )
    .all() as PendingAnnotation[]

  if (pending.length === 0) return

  // --- Session probe ---
  // Only run the expensive probe when there is actual work to do.
  // If session is invalid we skip the whole cycle without touching any
  // annotation state. This prevents spurious failed_permanent writes.
  const sessionOk = await isSessionValid()
  if (!sessionOk) {
    console.warn(
      `[syncManager] Session invalid — skipping sync cycle. ${pending.length} pending annotation(s) preserved as-is.`
    )
    return
  }

  console.log(`[syncManager] ${pending.length} adet bekleyen anotasyon bulundu.`)

  for (const row of pending) {
    // Step a: Duplicate submission check
    if (row.payload_hash && row.payload_hash === row.last_synced_hash) {
      db.prepare(
        `UPDATE annotations SET sync_status = 'synced', last_error = NULL WHERE id = ?`
      ).run(row.annotation_id)
      console.log(
        `[syncManager] ${row.annotation_id}: already submitted (hash match), marking synced`
      )
      continue
    }

    // Step b: Parse payload_json
    let annotationData: { type: string; data: unknown }
    if (!row.payload_json || row.payload_json.trim() === '') {
      db.prepare(
        `UPDATE annotations SET sync_status = 'failed_permanent', last_error = 'invalid_payload_json' WHERE id = ?`
      ).run(row.annotation_id)
      console.error(
        `[syncManager] ${row.annotation_id}: empty payload_json, marking failed_permanent`
      )
      continue
    }

    try {
      annotationData = JSON.parse(row.payload_json)
      if (
        !annotationData ||
        typeof annotationData.type !== 'string' ||
        annotationData.data === undefined
      ) {
        throw new Error('Missing type or data fields')
      }
    } catch (parseErr) {
      db.prepare(
        `UPDATE annotations SET sync_status = 'failed_permanent', last_error = 'invalid_payload_json' WHERE id = ?`
      ).run(row.annotation_id)
      console.error(
        `[syncManager] ${row.annotation_id}: invalid payload_json: ${(parseErr as Error).message}`
      )
      continue
    }

    // Step c: Load lease
    const lease = getLease(row.cloud_task_id)
    if (!lease) {
      db.prepare(
        `UPDATE annotations SET sync_status = 'lease_expired', last_error = 'missing_lease_token' WHERE id = ?`
      ).run(row.annotation_id)
      console.error(
        `[syncManager] ${row.annotation_id}: no lease for task ${row.cloud_task_id}, marking lease_expired`
      )
      continue
    }

    // Step c.1: Local lease expiry guard
    if (lease.leased_until) {
      const leasedUntilMs = new Date(lease.leased_until).getTime()
      if (Date.now() > leasedUntilMs) {
        db.prepare(
          `UPDATE annotations SET sync_status = 'lease_expired', last_error = 'lease_expired_local' WHERE id = ?`
        ).run(row.annotation_id)
        console.warn(
          `[syncManager] ${row.annotation_id}: local lease expired for task ${row.cloud_task_id}, marking lease_expired_local`
        )
        continue
      }
    }

    // Step d: POST /api/v1/tasks/:id/submit
    try {
      await apiClient.post(`/api/v1/tasks/${row.cloud_task_id}/submit`, {
        leaseToken: lease.lease_token,
        annotationData: {
          type: annotationData.type,
          data: annotationData.data
        }
      })

      // Step e: Success
      db.prepare(
        `UPDATE annotations SET sync_status = 'synced', last_synced_hash = payload_hash, last_error = NULL WHERE id = ?`
      ).run(row.annotation_id)

      console.log(
        `[syncManager] ${row.annotation_id}: submitted successfully for task ${row.cloud_task_id}`
      )
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = err as any
      const status = error?.response?.status ?? 0
      const bodyStr =
        typeof error?.response?.data === 'object'
          ? JSON.stringify(error.response.data)
          : String(error?.response?.data ?? error.message ?? '')

      const classification = classifyHttpError(status, bodyStr)

      // Step f: idempotent success or conflict check
      if (classification.errorKey === 'already_submitted') {
        if (row.last_synced_hash && row.payload_hash !== row.last_synced_hash) {
          // Task already submitted on backend, but local user has made newer changes (hashes don't match).
          // We mark it as conflict rather than failed_permanent so data is not blindly lost.
          db.prepare(
            `UPDATE annotations SET sync_status = 'task_already_submitted_conflict', last_error = 'task_already_submitted_conflict' WHERE id = ?`
          ).run(row.annotation_id)
          console.warn(
            `[syncManager] ${row.annotation_id}: payload changed locally but backend already submitted (conflict)`
          )
        } else {
          // Either same hash (idempotent) or first sync but backend says submitted.
          db.prepare(
            `UPDATE annotations SET sync_status = 'synced', last_synced_hash = payload_hash, last_error = NULL WHERE id = ?`
          ).run(row.annotation_id)
          console.log(`[syncManager] ${row.annotation_id}: already submitted, marking synced`)
        }
        continue
      }

      if (classification.retryable) {
        // Step g: Retryable
        db.prepare(
          `UPDATE annotations SET attempt_count = attempt_count + 1, last_error = ? WHERE id = ?`
        ).run(classification.errorKey, row.annotation_id)
        console.log(
          `[syncManager] ${row.annotation_id}: retryable error (${classification.errorKey}), will retry`
        )
      } else if (classification.errorKey === 'auth_invalid') {
        // Step g-auth: 401/403 during per-item submit — session became invalid mid-cycle.
        // Do NOT write failed_permanent. Leave pending_insert intact so the next
        // cycle (after re-login) can retry.
        console.warn(
          `[syncManager] ${row.annotation_id}: auth_invalid during submit — leaving pending_insert intact, will retry after session restored`
        )
      } else if (classification.errorKey === 'lease_expired') {
        // Step h-lease: lease_expired — kept as a distinct, recoverable-in-future status.
        // Do NOT mark as failed_permanent: annotation data is preserved, and the task
        // may be re-leased manually in a future recovery flow.
        db.prepare(
          `UPDATE annotations SET sync_status = 'lease_expired', last_error = 'lease_expired' WHERE id = ?`
        ).run(row.annotation_id)
        console.warn(
          `[syncManager] ${row.annotation_id}: lease expired for task ${row.cloud_task_id} — marking sync_status='lease_expired' (recoverable)`
        )
      } else {
        // Step h: Non-retryable (permanent)
        db.prepare(
          `UPDATE annotations SET sync_status = 'failed_permanent', last_error = ? WHERE id = ?`
        ).run(classification.errorKey, row.annotation_id)
        console.error(
          `[syncManager] ${row.annotation_id}: non-retryable error (${classification.errorKey}), marking failed_permanent`
        )
      }
    }
  }
}

// -----------------------------------------------------------------------
// Zamanlayıcı yönetimi
// -----------------------------------------------------------------------
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Arka plan senkronizasyon döngüsünü başlatır.
 */
export function startSync(): void {
  if (timer !== null) return

  runSyncCycle().catch((err) => console.error('[syncManager] İlk sync hatası:', err))

  timer = setInterval(() => {
    runSyncCycle().catch((err) =>
      console.error('[syncManager] Döngü sırasında beklenmeyen hata:', err)
    )
  }, SYNC_INTERVAL_MS)

  console.log(`[syncManager] Başlatıldı — her ${SYNC_INTERVAL_MS / 1000}s'de bir çalışacak.`)
}

/**
 * Arka plan senkronizasyon döngüsünü durdurur.
 */
export function stopSync(): void {
  if (timer === null) return
  clearInterval(timer)
  timer = null
  console.log('[syncManager] Durduruldu.')
}
