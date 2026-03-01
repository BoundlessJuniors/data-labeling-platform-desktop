import { getDb } from '../db/sqlite'
import { apiClient } from '../api/apiClient'

// -----------------------------------------------------------------------
// Yapılandırma
// -----------------------------------------------------------------------
const SYNC_INTERVAL_MS = 30_000 // 30 saniye

// -----------------------------------------------------------------------
// Tip tanımı — SQLite JOIN sorgusunun döndürdüğü satır şekli
// -----------------------------------------------------------------------
interface PendingAnnotation {
  annotation_id: string
  data_json: string
  type: string
  cloud_task_id: string
}

// -----------------------------------------------------------------------
// Tek seferlik senkronizasyon döngüsü
// -----------------------------------------------------------------------
async function runSyncCycle(): Promise<void> {
  let db
  try {
    db = getDb()
  } catch {
    // DB henüz başlatılmamışsa sessizce atla
    return
  }

  // Sadece bulutan gelen görevlere ait (cloud_task_id dolu) ve henüz
  // senkronize edilmemiş anotasyonları getir
  const pending = db
    .prepare(
      `SELECT
         a.id          AS annotation_id,
         a.data_json,
         a.type,
         m.cloud_task_id
       FROM annotations a
       JOIN media_items m ON a.media_id = m.id
       WHERE a.sync_status = 'pending_insert'
         AND m.cloud_task_id IS NOT NULL`
    )
    .all() as PendingAnnotation[]

  if (pending.length === 0) return

  console.log(`[syncManager] ${pending.length} adet bekleyen anotasyon bulundu.`)

  for (const row of pending) {
    try {
      await apiClient.post('/api/v1/annotations/raw', {
        taskId: row.cloud_task_id,
        data: JSON.parse(row.data_json),
        type: row.type
      })

      // Başarılı → sync_status güncelle
      db.prepare(`UPDATE annotations SET sync_status = 'synced' WHERE id = ?`).run(
        row.annotation_id
      )
    } catch (err) {
      // Ağ hatası veya API hatası → bir sonraki döngüye bırak
      console.log(
        `[syncManager] Anotasyon ${row.annotation_id} gönderilemedi, bir sonraki döngüde tekrar denenecek:`,
        (err as Error).message ?? err
      )
    }
  }
}

// -----------------------------------------------------------------------
// Zamanlayıcı yönetimi
// -----------------------------------------------------------------------
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Arka plan senkronizasyon döngüsünü başlatır.
 * app.whenReady() içinde bir kez çağrılmalıdır.
 */
export function startSync(): void {
  if (timer !== null) return // Zaten çalışıyor

  // İlk çalışmayı hemen tetikle (uygulama açılışında da çalışsın)
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
