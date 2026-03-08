import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        ping: () => Promise<{ ok: boolean }>
        datasets: {
          create: (payload: {
            id: string
            name: string
            folder_path?: string | null
            cloud_contract_id?: string
          }) => Promise<{ ok: true }>
          list: () => Promise<
            Array<{ id: string; name: string; created_at: number; folder_path?: string | null }>
          >
          getByFolder: (folderPath: string) => Promise<{
            id: string
            name: string
            created_at: number
            folder_path: string | null
          } | null>
          getByContractId: (contractId: string) => Promise<{
            id: string
            name: string
            created_at: number
            folder_path: string | null
            cloud_contract_id: string
          } | null>
          delete: (datasetId: string) => Promise<{ ok: true }>
        }
        media: {
          upsert: (payload: {
            id: string
            dataset_id: string
            local_path: string
            sha256?: string | null
            width?: number | null
            height?: number | null
          }) => Promise<{ ok: true }>
          listByDataset: (datasetId: string) => Promise<
            Array<{
              id: string
              dataset_id: string
              local_path: string
              width: number | null
              height: number | null
              status: 'in_progress' | 'completed' | string | null
              annotation_seconds?: number | null
              cloud_task_id?: string
              contract_id?: string
            }>
          >
          setStatus: (payload: {
            media_id: string
            status: 'in_progress' | 'completed'
          }) => Promise<{ ok: true }>
          setTime: (payload: { media_id: string; seconds: number }) => Promise<{ ok: true }>
        }
        annotations: {
          saveExport: (payload: {
            media_id: string
            data_json: string
            cloud_task_id?: string
            contract_id?: string
            payload_json?: string
            payload_hash?: string
          }) => Promise<{ ok: true }>
          getExport: (mediaId: string) => Promise<{ data_json: string; updated_at: number } | null>
        }
      }
      sam: {
        status: () => Promise<{
          status: 'idle' | 'downloading' | 'ready' | 'error'
          currentModelId: string
          modelsStatus: Record<string, 'available' | 'not_downloaded'>
          error: string | null
        }>
        isInstalled: (modelId?: string) => Promise<{
          downloaded: boolean
          state: {
            status: 'idle' | 'downloading' | 'ready' | 'error'
            currentModelId: string
            modelsStatus: Record<string, 'available' | 'not_downloaded'>
            error: string | null
          }
        }>
        download: (modelId: string) => Promise<{
          ok: boolean
          state: {
            status: 'idle' | 'downloading' | 'ready' | 'error'
            currentModelId: string
            modelsStatus: Record<string, 'available' | 'not_downloaded'>
            error: string | null
          }
        }>
        pauseDownload: (modelId: string) => Promise<{ ok: boolean }>
        cancelDownload: (modelId: string) => Promise<{ ok: boolean }>
        setModel: (modelId: string) => Promise<{
          ok: boolean
          state: {
            status: 'idle' | 'downloading' | 'ready' | 'error'
            currentModelId: string
            modelsStatus: Record<string, 'available' | 'not_downloaded'>
            error: string | null
          }
        }>
        getModels: () => Promise<
          Record<
            string,
            {
              id: string
              name: string
              description: string
              quantized: boolean
            }
          >
        >
        ensureReady: () => Promise<{
          ok: boolean
          state: {
            status: 'idle' | 'downloading' | 'ready' | 'error'
            currentModelId: string
            modelsStatus: Record<string, 'available' | 'not_downloaded'>
            error: string | null
          }
        }>
        run: (payload: { imagePath: string; points: { x: number; y: number }[] }) => Promise<{
          ok: boolean
          mask: { points: { x: number; y: number }[] }
        }>
        onDownloadProgress: (
          handler: (payload: {
            modelId?: string
            stage: 'encoder' | 'decoder'
            loaded: number
            total: number | null
          }) => void
        ) => () => void
      }
      dataset: {
        pickFolder: () => Promise<{
          folder: string
          images: string[]
        } | null>
      }
      auth: {
        login: (credentials: { email: string; password: string }) => Promise<{
          id: string
          email: string
          role: string
          [key: string]: unknown
        }>
        logout: () => Promise<void>
      }
      cloud: {
        fetchContracts: () => Promise<
          Array<{
            id: string
            status: string
            listing: { id?: string; title: string }
            [key: string]: unknown
          }>
        >
        downloadContractWork: (
          contractId: string,
          datasetId: string,
          amount: number
        ) => Promise<{ leased: number; downloaded: number; skipped: number; failed: number }>
        syncNow: () => Promise<{ ok: boolean }>
        submitContract: (contractId: string) => Promise<{
          ok: boolean
          data?: unknown
          unsyncedCount?: number
          failedCount?: number
          error?: string
        }>
      }
      window: {
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<void>
      }
    }
  }
}
