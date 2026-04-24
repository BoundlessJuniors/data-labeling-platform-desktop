import { ref } from 'vue'

// -----------------------------------------------------------------------
// Tip tanımları
// -----------------------------------------------------------------------
export interface CloudContract {
  id: string
  status: string
  listing: { id?: string; title: string }
  client?: unknown
  labeler?: unknown
  tasks?: unknown[]
  _count?: { tasks: number }
  [key: string]: unknown
}

export interface DownloadResult {
  leased: number
  downloaded: number
  skipped: number
  failed: number
  status: 'downloaded' | 'stale_local_state' | 'zero_leased' | 'already_fully_downloaded' | string
  contractId: string
}

export interface SubmitResult {
  ok: boolean
  data?: unknown
  unsyncedCount?: number
  pendingInsertCount?: number
  failedCount?: number
  leaseExpiredCount?: number
  inProgressCount?: number
  notDownloadedCount?: number
  missingLocalExportCount?: number
  error?: string
}

export interface ContractHealth {
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
  clearSession: () => void
  fetchContracts: () => Promise<void>
  downloadContractWork: (
    contractId: string,
    datasetName: string,
    amount?: number,
    expectedTaskCount?: number
  ) => Promise<DownloadResult>
  syncNow: () => Promise<void>
  getContractHealth: (contractId: string, expectedTaskCount?: number) => Promise<ContractHealth>
  recoverExpiredTasks: (contractId: string) => Promise<{ ok: boolean; recoveredCount: number }>
  submitContract: (contractId: string, expectedTaskCount?: number) => Promise<SubmitResult>
  resetContractLocalState: (contractId: string) => Promise<{
    ok: boolean
    deletedDatasets: number
    deletedMediaItems: number
    deletedAnnotations: number
    deletedLeases: number
    deletedFiles: number
  }>
} {
  /**
   * Clears all cloud UI state on logout so no stale data is shown.
   * Resets module-scope singleton refs; isFetching is left as-is
   * (it should already be false at logout time).
   */
  const clearSession = (): void => {
    contracts.value = []
    downloadResult.value = null
    syncError.value = null
  }

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
    amount: number = 20,
    expectedTaskCount?: number
  ): Promise<DownloadResult> => {
    isFetching.value = true
    syncError.value = null
    downloadResult.value = null

    let createdDatasetId: string | null = null

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
        createdDatasetId = datasetId
      }

      // Lease + download
      const rawResult = await window.api.cloud.downloadContractWork(
        contractId,
        datasetId,
        amount,
        expectedTaskCount
      )

      const result: DownloadResult = {
        ...rawResult,
        contractId
      }

      // Cleanup newly created dataset if download yielded no actual work
      if (createdDatasetId && result.status !== 'downloaded') {
        try {
          await window.api.db.datasets.delete(createdDatasetId)
        } catch (cleanupErr) {
          console.error('Failed to cleanup empty dataset', cleanupErr)
        }
      }

      downloadResult.value = result
      return result
    } catch (err: unknown) {
      // Best-effort cleanup on exception
      if (createdDatasetId) {
        try {
          await window.api.db.datasets.delete(createdDatasetId)
        } catch (cleanupErr) {
          console.error('Failed to cleanup empty dataset after exception', cleanupErr)
        }
      }

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
  const submitContract = async (
    contractId: string,
    expectedTaskCount?: number
  ): Promise<SubmitResult> => {
    try {
      const result = await window.api.cloud.submitContract(contractId, expectedTaskCount)
      return result as SubmitResult
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sözleşme teslim edilemedi.'
      syncError.value = msg
      throw err
    }
  }

  /**
   * Fetch contract health without submitting
   */
  const getContractHealth = async (
    contractId: string,
    expectedTaskCount?: number
  ): Promise<ContractHealth> => {
    return await window.api.cloud.getContractHealth(contractId, expectedTaskCount)
  }

  /**
   * Recover expired tasks
   */
  const recoverExpiredTasks = async (
    contractId: string
  ): Promise<{ ok: boolean; recoveredCount: number }> => {
    return await window.api.cloud.recoverExpiredTasks(contractId)
  }

  /**
   * Reset local contract state
   */
  const resetContractLocalState = async (
    contractId: string
  ): Promise<{
    ok: boolean
    deletedDatasets: number
    deletedMediaItems: number
    deletedAnnotations: number
    deletedLeases: number
    deletedFiles: number
  }> => {
    return await window.api.cloud.resetContractLocalState(contractId)
  }

  return {
    contracts,
    isFetching,
    downloadResult,
    syncError,
    clearSession,
    fetchContracts,
    downloadContractWork,
    syncNow,
    getContractHealth,
    recoverExpiredTasks,
    submitContract,
    resetContractLocalState
  }
}
