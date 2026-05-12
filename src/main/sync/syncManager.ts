import { getDb } from '../db/sqlite'
import { apiClient } from '../api/apiClient'

// -----------------------------------------------------------------------
// Yapılandırma
// -----------------------------------------------------------------------
const SYNC_INTERVAL_MS = 30_000 // 30 saniye

// -----------------------------------------------------------------------
// Tip tanımları
// -----------------------------------------------------------------------
interface PendingAnnotation {
  annotation_id: string
  payload_json: string | null
  cloud_task_id: string
  contract_id: string | null
  payload_hash: string | null
  last_synced_hash: string | null
}

/** Local task_leases satır şekli */
type LocalLease = {
  lease_token: string
  contract_id: string
  leased_until: number | null
}

/** Backend /tasks/:id/lease response şekli */
interface LeaseTaskResponse {
  success: boolean
  data?: {
    leaseToken?: string | null
    leasedUntil?: string | number | null
    taskLease?: {
      leaseToken?: string | null
      leasedUntil?: string | number | null
    } | null
  }
}

type EnsureLeaseResult =
  | { status: 'ok'; lease: LocalLease }
  | { status: 'auth_invalid' }
  | { status: 'retryable'; errorKey: string }
  | { status: 'lease_unavailable'; errorKey: string }

// -----------------------------------------------------------------------
// HTTP error helpers — any kullanımını önlemek için
// -----------------------------------------------------------------------
interface HttpErrorLike {
  response?: {
    status?: number
    data?: unknown
  }
  message?: string
}

interface ErrorWithKey extends Error {
  errorKey?: string
}

function toHttpError(err: unknown): HttpErrorLike {
  return err instanceof Error ? (err as Error & HttpErrorLike) : (err as HttpErrorLike)
}

function getHttpStatus(err: unknown): number {
  return toHttpError(err).response?.status ?? 0
}

function getHttpBody(err: unknown): string {
  const httpError = toHttpError(err)
  const data = httpError.response?.data
  if (typeof data === 'object' && data !== null) {
    return JSON.stringify(data)
  }
  return String(data ?? httpError.message ?? '')
}

function hasErrorKey(err: unknown, key: string): boolean {
  return err instanceof Error && (err as ErrorWithKey).errorKey === key
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
    const status = getHttpStatus(err)
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
// Local DB helpers — intentionally NOT imported from cloudTasksIpc to
// avoid circular import (cloudTasksIpc imports runSyncCycle from here).
// -----------------------------------------------------------------------

/** task_leases tablosundan mevcut lease'i oku */
function getLeaseLocal(taskId: string): LocalLease | null {
  const db = getDb()
  const row = db
    .prepare('SELECT lease_token, contract_id, leased_until FROM task_leases WHERE task_id = ?')
    .get(taskId) as LocalLease | undefined
  return row ?? null
}

/** task_leases tablosuna yeni lease yaz veya mevcut kaydı güncelle */
function upsertLeaseLocal(
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
       lease_token  = @lease_token,
       leased_until = @leased_until,
       updated_at   = @now`
  ).run({
    task_id: taskId,
    contract_id: contractId,
    lease_token: leaseToken,
    leased_until: leasedUntil,
    now
  })
}

// -----------------------------------------------------------------------
// parseLeasedUntil — ISO string veya epoch number → epoch ms or null
// -----------------------------------------------------------------------
function parseLeasedUntil(val: string | number | null | undefined): number | null {
  if (val == null) return null
  if (typeof val === 'number') return val
  const ms = new Date(val).getTime()
  return isNaN(ms) ? null : ms
}

// -----------------------------------------------------------------------
// requestTaskLease — backend'den yeni lease al
// Returns new { leaseToken, leasedUntil } or null on failure.
// Throws an ErrorWithKey('auth_invalid') if 401 or non-lease 403.
// -----------------------------------------------------------------------
async function requestTaskLease(
  taskId: string
): Promise<{ leaseToken: string; leasedUntil: number | null } | null> {
  let resp: { data: LeaseTaskResponse }
  try {
    resp = await apiClient.post<LeaseTaskResponse>(`/api/v1/tasks/${taskId}/lease`, {
      leaseDurationMinutes: 120
    })
  } catch (err: unknown) {
    const status = getHttpStatus(err)
    const bodyStr = getHttpBody(err)
    const cls = classifyHttpError(status, bodyStr)
    if (cls.errorKey === 'auth_invalid') {
      // Re-throw a typed sentinel so callers can detect auth failures
      const authErr = new Error('auth_invalid') as ErrorWithKey
      authErr.errorKey = 'auth_invalid'
      throw authErr
    }
    if (cls.retryable) {
      // Re-throw a typed sentinel so callers can treat this as retryable
      // instead of permanently marking the annotation lease_expired.
      const retryErr = new Error(cls.errorKey) as ErrorWithKey
      retryErr.errorKey = cls.errorKey
      throw retryErr
    }
    // Non-retryable, non-auth error (409, 400, unknown 4xx…) → lease unavailable
    console.warn(
      `[syncManager] requestTaskLease taskId=${taskId}: status=${status} — ${bodyStr.substring(0, 200)}`
    )
    return null
  }

  const d = resp.data?.data
  // Support both top-level and nested taskLease fields (same as cloudTasksIpc resolveLeaseFields)
  const leaseToken = (d?.leaseToken ?? d?.taskLease?.leaseToken) || null
  const rawLeasedUntil = d?.leasedUntil !== undefined ? d?.leasedUntil : d?.taskLease?.leasedUntil
  const leasedUntil = parseLeasedUntil(rawLeasedUntil)

  if (!leaseToken) {
    console.warn(`[syncManager] requestTaskLease taskId=${taskId}: response missing leaseToken`)
    return null
  }

  return { leaseToken, leasedUntil }
}

// -----------------------------------------------------------------------
// ensureActiveLease — mevcut leaseı doğrula veya yenisini al
// contractId: annotation row'dan gelen veya mevcut lease kaydındaki değer
// -----------------------------------------------------------------------
async function ensureActiveLease(
  taskId: string,
  contractId: string | null,
  existingLease: LocalLease | null
): Promise<EnsureLeaseResult> {
  const now = Date.now()

  // Mevcut lease aktif mi?
  if (existingLease && existingLease.leased_until !== null && now <= existingLease.leased_until) {
    return { status: 'ok', lease: existingLease }
  }

  // Lease yok ya da expired — backend'den yeni lease iste.
  // contract_id boş string olarak yazılmasını önle.
  const effectiveContractId = contractId ?? existingLease?.contract_id

  if (!effectiveContractId) {
    return { status: 'lease_unavailable', errorKey: 'missing_contract_id' }
  }

  let newLeaseData: { leaseToken: string; leasedUntil: number | null } | null
  try {
    newLeaseData = await requestTaskLease(taskId)
  } catch (err: unknown) {
    if (hasErrorKey(err, 'auth_invalid')) {
      return { status: 'auth_invalid' }
    }
    // Propagate retryable sentinels (server_error / network) so the caller
    // can increment attempt_count instead of writing lease_expired.
    const errKey = err instanceof Error ? (err as ErrorWithKey).errorKey : undefined
    if (errKey) {
      return { status: 'retryable', errorKey: errKey }
    }
    return { status: 'lease_unavailable', errorKey: 'auto_release_failed' }
  }

  if (!newLeaseData) {
    return { status: 'lease_unavailable', errorKey: 'auto_release_failed' }
  }

  // Lease'i SQLite'a yaz
  upsertLeaseLocal(taskId, effectiveContractId, newLeaseData.leaseToken, newLeaseData.leasedUntil)
  console.log(
    `[syncManager] ensureActiveLease taskId=${taskId}: new lease obtained, expires=${newLeaseData.leasedUntil}`
  )

  const newLease: LocalLease = {
    lease_token: newLeaseData.leaseToken,
    contract_id: effectiveContractId,
    leased_until: newLeaseData.leasedUntil
  }
  return { status: 'ok', lease: newLease }
}

// -----------------------------------------------------------------------
// Tek seferlik senkronizasyon döngüsü
// CRITICAL: Bu döngü backend'e sadece FULL FINAL SNAPSHOT payloads (export) gönderir,
// asıl beklenen de budur. Parçalı gönderim desteklenmez ve yapılmamalıdır.
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// Internal sync implementation — do not call directly.
// Use runSyncCycle() which is concurrency-safe.
// -----------------------------------------------------------------------
async function runSyncCycleInternal(): Promise<void> {
  let db
  try {
    db = getDb()
  } catch {
    return
  }

  // Query pending annotations with cloud_task_id — NO media_items join.
  // contract_id is selected so we can write task_leases even when no lease row exists yet.
  const pending = db
    .prepare(
      `SELECT
         a.id              AS annotation_id,
         a.payload_json,
         a.cloud_task_id,
         a.contract_id,
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

    // Step c: Ensure active lease (auto re-lease if missing or expired)
    const existingLease = getLeaseLocal(row.cloud_task_id)
    const leaseResult = await ensureActiveLease(row.cloud_task_id, row.contract_id, existingLease)

    if (leaseResult.status === 'auth_invalid') {
      // Auth/session hatası — annotation pending_insert olarak kalsın
      console.warn(
        `[syncManager] ${row.annotation_id}: auth_invalid during lease — leaving pending_insert intact`
      )
      continue
    }

    if (leaseResult.status === 'retryable') {
      // Geçici network/server hatası — lease_expired yapma, attempt_count artır.
      db.prepare(
        `UPDATE annotations SET attempt_count = attempt_count + 1, last_error = ? WHERE id = ?`
      ).run(leaseResult.errorKey, row.annotation_id)
      console.log(
        `[syncManager] ${row.annotation_id}: retryable lease error (${leaseResult.errorKey}), will retry`
      )
      continue
    }

    if (leaseResult.status === 'lease_unavailable') {
      // Backend yeni lease vermedi — local annotation korunuyor
      db.prepare(
        `UPDATE annotations SET sync_status = 'lease_expired', last_error = ? WHERE id = ?`
      ).run(leaseResult.errorKey, row.annotation_id)
      console.warn(
        `[syncManager] ${row.annotation_id}: cannot obtain lease for task ${row.cloud_task_id} — marking lease_expired (${leaseResult.errorKey})`
      )
      continue
    }

    // leaseResult.status === 'ok'
    const activeLease = leaseResult.lease

    // Step d: POST /api/v1/tasks/:id/submit
    const submitPayload = {
      leaseToken: activeLease.lease_token,
      annotationData: {
        type: annotationData.type,
        data: annotationData.data
      }
    }

    let submitSucceeded = false
    try {
      await apiClient.post(`/api/v1/tasks/${row.cloud_task_id}/submit`, submitPayload)
      submitSucceeded = true
    } catch (err: unknown) {
      const status = getHttpStatus(err)
      const bodyStr = getHttpBody(err)
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

      if (classification.errorKey === 'lease_expired') {
        // Step h-lease-retry: backend'in döndürdüğü lease_expired hatası.
        // Bir kez force re-lease dene ve aynı payload'u tekrar gönder.
        console.warn(
          `[syncManager] ${row.annotation_id}: backend rejected lease for task ${row.cloud_task_id} — attempting forced re-lease`
        )

        let retrySucceeded = false
        try {
          const forceLeaseData = await requestTaskLease(row.cloud_task_id)
          if (forceLeaseData) {
            // contract_id boş string olarak yazılmasını önle
            const effectiveContractId = row.contract_id ?? activeLease.contract_id
            if (!effectiveContractId) {
              db.prepare(
                `UPDATE annotations SET sync_status = 'lease_expired', last_error = 'missing_contract_id' WHERE id = ?`
              ).run(row.annotation_id)
              console.warn(
                `[syncManager] ${row.annotation_id}: cannot persist refreshed lease because contract_id is missing`
              )
              continue
            }

            upsertLeaseLocal(
              row.cloud_task_id,
              effectiveContractId,
              forceLeaseData.leaseToken,
              forceLeaseData.leasedUntil
            )
            // Retry submit with new token — ONE attempt only, no further recursion.
            const retryPayload = {
              leaseToken: forceLeaseData.leaseToken,
              annotationData: {
                type: annotationData.type,
                data: annotationData.data
              }
            }
            await apiClient.post(`/api/v1/tasks/${row.cloud_task_id}/submit`, retryPayload)
            retrySucceeded = true
            console.log(
              `[syncManager] ${row.annotation_id}: forced re-lease + retry submit succeeded`
            )
          }
        } catch (retryErr: unknown) {
          // Check for auth_invalid sentinel FIRST — requestTaskLease throws this
          // as an ErrorWithKey, so getHttpStatus() would return 0 (misleading).
          if (hasErrorKey(retryErr, 'auth_invalid')) {
            console.warn(
              `[syncManager] ${row.annotation_id}: auth_invalid during re-lease retry — leaving pending_insert intact`
            )
            continue
          }
          const retryStatus = getHttpStatus(retryErr)
          const retryBody = getHttpBody(retryErr)
          const retryCls = classifyHttpError(retryStatus, retryBody)
          if (retryCls.retryable) {
            // Geçici hata — attempt_count artır, pending_insert kalsın.
            db.prepare(
              `UPDATE annotations SET attempt_count = attempt_count + 1, last_error = ? WHERE id = ?`
            ).run(retryCls.errorKey, row.annotation_id)
            console.log(
              `[syncManager] ${row.annotation_id}: retryable error during re-lease retry (${retryCls.errorKey}), will retry`
            )
            continue
          }
          console.warn(
            `[syncManager] ${row.annotation_id}: forced re-lease retry failed: ${retryBody.substring(0, 200)}`
          )
        }

        // FIX: retry başarılıysa annotation'ı synced yap; değilse lease_expired olarak işaretle.
        if (retrySucceeded) {
          db.prepare(
            `UPDATE annotations SET sync_status = 'synced', last_synced_hash = payload_hash, last_error = NULL WHERE id = ?`
          ).run(row.annotation_id)
          console.log(
            `[syncManager] ${row.annotation_id}: submitted successfully after forced re-lease for task ${row.cloud_task_id}`
          )
        } else {
          db.prepare(
            `UPDATE annotations SET sync_status = 'lease_expired', last_error = 'lease_expired_after_retry' WHERE id = ?`
          ).run(row.annotation_id)
          console.warn(
            `[syncManager] ${row.annotation_id}: lease expired after retry — marking lease_expired`
          )
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
      } else {
        // Step h: Non-retryable (permanent)
        db.prepare(
          `UPDATE annotations SET sync_status = 'failed_permanent', last_error = ? WHERE id = ?`
        ).run(classification.errorKey, row.annotation_id)
        console.error(
          `[syncManager] ${row.annotation_id}: non-retryable error (${classification.errorKey}), marking failed_permanent`
        )
      }
      continue
    }

    // Step e: Success (normal submit path — no re-lease was needed)
    if (submitSucceeded) {
      db.prepare(
        `UPDATE annotations SET sync_status = 'synced', last_synced_hash = payload_hash, last_error = NULL WHERE id = ?`
      ).run(row.annotation_id)
      console.log(
        `[syncManager] ${row.annotation_id}: submitted successfully for task ${row.cloud_task_id}`
      )
    }
  }
}

// -----------------------------------------------------------------------
// In-flight guard — prevents overlapping sync cycles.
// All callers (startSync interval, cloud:syncNow, cloud:submitContract)
// share a single in-flight Promise instead of spawning a second loop.
// -----------------------------------------------------------------------
let syncInFlight: Promise<void> | null = null

export function runSyncCycle(): Promise<void> {
  if (syncInFlight) {
    console.log('[syncManager] Sync already in progress — reusing in-flight promise.')
    return syncInFlight
  }
  syncInFlight = runSyncCycleInternal().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
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
