import { ipcMain, app } from 'electron'
import { createWriteStream, mkdirSync } from 'fs'
import { join } from 'path'
import { apiClient } from './apiClient'
import { getDb } from '../db/sqlite'
import { randomUUID } from 'crypto'

// -----------------------------------------------------------------------
// Cloud cache dizini — userData/cloud_cache
// -----------------------------------------------------------------------
const cacheDir = join(app.getPath('userData'), 'cloud_cache')
mkdirSync(cacheDir, { recursive: true })

// -----------------------------------------------------------------------
// Tip tanımları (Web API yanıt şekli)
// -----------------------------------------------------------------------
interface ContractItem {
  id: string
  title: string
  status: string
  listing?: { title: string }
  [key: string]: unknown
}

interface TaskItem {
  id: string
  assetId: string
  assetUrl?: string
  contractId: string
  [key: string]: unknown
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
// Tüm cloud IPC handler'larını kayıt eder.
// -----------------------------------------------------------------------
export function registerCloudTasksIpc(): void {
  // ----------------------------------------------------------------------
  // cloud:fetchContracts
  // Kullanıcıya atanmış sözleşmeleri Web API'den çeker ve Renderer'a iletir.
  // Veriyi SQLite'a yazmaz — sadece liste gösterimi amaçlı bir geçiş katmanı.
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:fetchContracts', async (): Promise<ContractItem[]> => {
    // API'nin gerçek yanıt formatına uygun tip tanımlıyoruz
    const response = await apiClient.get<{ success: boolean; data: ContractItem[] }>('/api/v1/contracts')
    // response.data (axios objesi) -> içindeki data (bizim API'nin listesi)
    return response.data.data ?? []
  })

  // ----------------------------------------------------------------------
  // cloud:syncContractTasks
  // Belirli bir sözleşmenin görevlerini çekip görselleri diske indirir,
  // ardından media_items tablosuna kaydeder.
  // ----------------------------------------------------------------------
  ipcMain.handle(
    'cloud:syncContractTasks',
    async (
      _event,
      contractId: string,
      datasetId: string
    ): Promise<{ synced: number; skipped: number; failed: number }> => {
      
      console.log(`[cloud:syncContractTasks] Sözleşme görevleri çekiliyor. ID: ${contractId}`)
      
      let tasks: TaskItem[] = []
      
      // 1. Görevleri API'den çek (Hata yakalamalı)
      try {
        const tasksResp = await apiClient.get<{ success: boolean; data: TaskItem[] }>(
          `/api/v1/tasks?contractId=${contractId}&limit=1000`
        )
        // API yanıt formatına göre data.data kullanıyoruz
        tasks = tasksResp.data.data ?? []
        console.log(`[cloud:syncContractTasks] Toplam ${tasks.length} görev bulundu.`)
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = err as any
        console.error(
          `[cloud:syncContractTasks] Görevler çekilirken hata:`,
          error?.response?.data || error.message
        )
        throw new Error(`Görevler alınamadı: ${error.message}`)
      }

      const db = getDb()
      let synced = 0
      let skipped = 0
      let failed = 0

      for (const task of tasks) {
        // 2. Aynı cloud_task_id zaten var mı?
        const existing = db
          .prepare('SELECT id FROM media_items WHERE cloud_task_id = ?')
          .get(task.id)

        if (existing) {
          skipped++
          continue
        }

        const localPath = join(cacheDir, `${task.assetId}.jpg`)

        try {
          // 3A. Asset detayını çek (Backend büyük ihtimalle JSON dönüp Signed URL veriyor)
          console.log(`[cloud:syncContractTasks] Asset çekiliyor: ${task.assetId}`)
          const assetDetailResp = await apiClient.get<{ success: boolean; data: any }>(`/api/v1/assets/${task.assetId}`)
          
          // Signed URL'i backend'den al
          const downloadUrl = assetDetailResp.data.data?.url || assetDetailResp.data.data?.signedUrl
          
          if (!downloadUrl) throw new Error("İndirme URL'i bulunamadı!")

          // 3B. Gerçek resmi internetten indir (Axios ile Stream olarak)
          import('axios').then(async (axiosModule) => {
             const imageResp = await axiosModule.default.get(downloadUrl, { responseType: 'stream' })
             await streamToFile(imageResp.data, localPath)
          })

          // 4. media_items tablosuna INSERT
          const mediaId = randomUUID()
          const now = Date.now()

          db.prepare(
            `INSERT INTO media_items
              (id, dataset_id, local_path, cloud_task_id, cloud_asset_url, sync_status, status, created_at, updated_at)
             VALUES
              (@id, @dataset_id, @local_path, @cloud_task_id, @cloud_asset_url, @sync_status, @status, @created_at, @updated_at)`
          ).run({
            id: mediaId,
            dataset_id: datasetId,
            local_path: localPath,
            cloud_task_id: task.id,
            cloud_asset_url: downloadUrl,
            sync_status: 'synced',
            status: 'in_progress',
            created_at: now,
            updated_at: now
          })

          synced++
        } catch (err: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const error = err as any
          // Eğer sunucu bir hata detayı (JSON veya XML) gönderdiyse onu da yazdır
          const errorDetail = error?.response?.data
            ? typeof error.response.data === 'object'
              ? JSON.stringify(error.response.data)
              : error.response.data
            : error.message

          console.error(
            `[cloud:syncContractTasks] Asset ${task.assetId} indirilemedi. Detay:`,
            errorDetail
          )
          failed++
        }
      }

      return { synced, skipped, failed }
    }
  )

  // ----------------------------------------------------------------------
  // cloud:submitContract
  // İşin tamamen bittiğini API'ye bildirir
  // ----------------------------------------------------------------------
  ipcMain.handle('cloud:submitContract', async (_event, contractId: string) => {
    try {
      const response = await apiClient.patch(`/api/v1/contracts/${contractId}/submit`)
      return response.data
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = err as any
      console.error(`[cloud:submitContract] Sözleşme ${contractId} teslim edilemedi:`, error)
      throw error
    }
  })
}
