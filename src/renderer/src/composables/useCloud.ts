import { ref } from 'vue'

// -----------------------------------------------------------------------
// Tip tanımları
// -----------------------------------------------------------------------
export interface CloudContract {
  id: string
  title: string
  status: string
  listing?: { title: string }
  [key: string]: unknown
}

export interface DownloadResult {
  leased: number
  downloaded: number
  skipped: number
  failed: number
}

export interface SubmitResult {
  ok: boolean
  unsyncedCount?: number
  failedCount?: number
  error?: string
}

// -----------------------------------------------------------------------
// Module-scope singleton state
// -----------------------------------------------------------------------
const contracts = ref<CloudContract[]>([])
const isFetching = ref(false)
const downloadResult = ref<DownloadResult | null>(null)
const syncError = ref<string | null>(null)

// -----------------------------------------------------------------------
// Composable
// -----------------------------------------------------------------------
export function useCloud(): {
  contracts: ReturnType<typeof ref<CloudContract[]>>
  isFetching: ReturnType<typeof ref<boolean>>
  downloadResult: ReturnType<typeof ref<DownloadResult | null>>
  syncError: ReturnType<typeof ref<string | null>>
  fetchContracts: () => Promise<void>
  downloadContractWork: (
    contractId: string,
    datasetName: string,
    amount?: number
  ) => Promise<DownloadResult>
  syncNow: () => Promise<void>
  submitContract: (contractId: string) => Promise<SubmitResult>
} {
  /**
   * Kullanıcıya atanmış sözleşmeleri Web API'den çeker.
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
   * Atomic lease-batch + download flow.
   * 1. Check if dataset already exists for this contract (dedup).
   * 2. Call cloud:downloadContractWork IPC.
   */
  const downloadContractWork = async (
    contractId: string,
    datasetName: string,
    amount: number = 20
  ): Promise<DownloadResult> => {
    isFetching.value = true
    syncError.value = null
    downloadResult.value = null

    try {
      // Dedup: check if dataset already exists for this contract
      let datasetId: string
      const existing = await window.api.db.datasets.getByContractId(contractId)

      if (existing) {
        datasetId = existing.id
      } else {
        datasetId = crypto.randomUUID()
        await window.api.db.datasets.create({
          id: datasetId,
          name: datasetName,
          cloud_contract_id: contractId
        })
      }

      // Lease + download
      const result = await window.api.cloud.downloadContractWork(contractId, datasetId, amount)
      downloadResult.value = result
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Görevler indirilemedi.'
      syncError.value = msg
      throw err
    } finally {
      isFetching.value = false
    }
  }

  /**
   * Manual sync trigger.
   */
  const syncNow = async (): Promise<void> => {
    try {
      await window.api.cloud.syncNow()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Senkronizasyon başarısız.'
      syncError.value = msg
      throw err
    }
  }

  /**
   * Submit contract: sync first, then validate, then submit.
   */
  const submitContract = async (contractId: string): Promise<SubmitResult> => {
    try {
      const result = await window.api.cloud.submitContract(contractId)
      return result as SubmitResult
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sözleşme teslim edilemedi.'
      syncError.value = msg
      throw err
    }
  }

  return {
    contracts,
    isFetching,
    downloadResult,
    syncError,
    fetchContracts,
    downloadContractWork,
    syncNow,
    submitContract
  }
}
