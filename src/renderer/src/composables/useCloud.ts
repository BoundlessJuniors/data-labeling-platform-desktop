import { ref } from 'vue'

// -----------------------------------------------------------------------
// Tip tanımları
// -----------------------------------------------------------------------
export interface CloudContract {
  id: string
  title: string
  status: string
  [key: string]: unknown
}

export interface SyncResult {
  synced: number
  skipped: number
  failed: number
}

// -----------------------------------------------------------------------
// Module-scope singleton state
// -----------------------------------------------------------------------
const contracts = ref<CloudContract[]>([])
const isFetching = ref(false)
const syncResult = ref<SyncResult | null>(null)
const syncError = ref<string | null>(null)

// -----------------------------------------------------------------------
// Composable
// -----------------------------------------------------------------------
export function useCloud(): {
  contracts: ReturnType<typeof ref<CloudContract[]>>
  isFetching: ReturnType<typeof ref<boolean>>
  syncResult: ReturnType<typeof ref<SyncResult | null>>
  syncError: ReturnType<typeof ref<string | null>>
  fetchContracts: () => Promise<void>
  downloadContractTasks: (contractId: string, datasetName: string) => Promise<SyncResult>
} {
  /**
   * Kullanıcıya atanmış sözleşmeleri Web API'den çeker.
   * Veri Main Process üzerinden SQLite'a yazılmaz — sadece UI listesi için.
   */
  const fetchContracts = async (): Promise<void> => {
    isFetching.value = true
    syncError.value = null
    try {
      const result = await window.api.cloud.fetchContracts()
      contracts.value = result as CloudContract[]
    } catch (err: unknown) {
      syncError.value = err instanceof Error ? err.message : 'Sözleşmeler alınamadı.'
    } finally {
      isFetching.value = false
    }
  }

  /**
   * Seçili sözleşmenin görevlerini cihaza indirir.
   *
   * 1. Yerel SQLite'ta sözleşme için bir dataset kaydı oluşturur.
   * 2. Oluşturulan dataset ID'si ile cloud:syncContractTasks IPC'ini tetikler.
   * 3. Sonucu syncResult state'ine yazar.
   *
   * @param contractId Web API sözleşme kimliği
   * @param datasetName Yerel dataset için gösterim adı
   */
  const downloadContractTasks = async (
    contractId: string,
    datasetName: string
  ): Promise<SyncResult> => {
    isFetching.value = true
    syncError.value = null
    syncResult.value = null

    try {
      // 1. Yerel dataset kaydı oluştur
      //    cloud_contract_id, DB şemasında ilişkilendirme için saklanır.
      //    id'yi burada üretiyoruz çünkü preload API payload olarak bekliyor.
      const datasetId = crypto.randomUUID()
      await window.api.db.datasets.create({
        id: datasetId,
        name: datasetName,
        cloud_contract_id: contractId
      })

      // 2. Görev görselleri indir ve media_items'a kaydet
      const result = await window.api.cloud.syncContractTasks(contractId, datasetId)

      syncResult.value = result
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Görevler indirilemedi.'
      syncError.value = msg
      throw err
    } finally {
      isFetching.value = false
    }
  }

  return {
    // State
    contracts,
    isFetching,
    syncResult,
    syncError,
    // Actions
    fetchContracts,
    downloadContractTasks
  }
}
