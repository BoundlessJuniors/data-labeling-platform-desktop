/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
declare module '*.svg?component' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

// -----------------------------------------------------------------------
// SAM type declarations (used by Window.api.sam)
// -----------------------------------------------------------------------
interface SamStatusInfo {
  status: string
  currentModelId: string
  modelsStatus: Record<string, string>
  error: string | null
  [key: string]: unknown
}

interface SamModelInfo {
  name: string
  description: string
  size: string
  status?: string
}

// -----------------------------------------------------------------------
// Window API type declarations (preload bridge)
// -----------------------------------------------------------------------
interface Window {
  api: {
    db: {
      ping: () => Promise<{ ok: boolean }>
      datasets: {
        create: (payload: {
          id: string
          name: string
          folder_path?: string | null
          cloud_contract_id?: string
        }) => Promise<{ ok: boolean }>
        list: () => Promise<
          {
            id: string
            name: string
            created_at: number
            folder_path?: string | null
          }[]
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
        delete: (datasetId: string) => Promise<{ ok: boolean }>
      }
      media: {
        upsert: (payload: {
          id: string
          dataset_id: string
          local_path: string
          sha256?: string | null
          width?: number | null
          height?: number | null
        }) => Promise<{ ok: boolean }>
        listByDataset: (datasetId: string) => Promise<
          {
            id: string
            dataset_id: string
            local_path: string
            width: number | null
            height: number | null
            status: string
            annotation_seconds: number
            cloud_task_id?: string | null
            contract_id?: string | null
          }[]
        >
        setStatus: (payload: {
          media_id: string
          status: 'in_progress' | 'completed'
        }) => Promise<{ ok: boolean }>
        setTime: (payload: { media_id: string; seconds: number }) => Promise<{ ok: boolean }>
      }
      annotations: {
        saveExport: (payload: {
          media_id: string
          data_json: string
          cloud_task_id?: string
          contract_id?: string
          payload_json?: string
          payload_hash?: string
        }) => Promise<{ ok: boolean }>
        getExport: (mediaId: string) => Promise<{ data_json: string; updated_at: number } | null>
      }
    }
    sam: {
      status: () => Promise<SamStatusInfo>
      isInstalled: (modelId?: string) => Promise<{ downloaded: boolean; state: SamStatusInfo }>
      download: (modelId: string) => Promise<{ ok: boolean; state: SamStatusInfo }>
      pauseDownload: (modelId: string) => Promise<{ ok: boolean; state: SamStatusInfo }>
      cancelDownload: (modelId: string) => Promise<{ ok: boolean; state: SamStatusInfo }>
      setModel: (modelId: string) => Promise<{ ok: boolean; state: SamStatusInfo }>
      getModels: () => Promise<Record<string, SamModelInfo>>
      ensureReady: () => Promise<{ ok: boolean; state: SamStatusInfo }>
      run: (payload: {
        imagePath: string
        points: { x: number; y: number }[]
        labels?: number[]
      }) => Promise<{ ok: boolean; mask: { points: { x: number; y: number }[] } | null }>
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
      pickFolder: () => Promise<{ folder: string; images: string[] } | null>
    }
    auth: {
      login: (credentials: {
        email: string
        password: string
      }) => Promise<{ id: string; email: string; role: string }>
      logout: () => Promise<void>
    }
    cloud: {
      fetchContracts: () => Promise<
        {
          id: string
          title: string
          status: string
          listing?: { title: string }
          [key: string]: unknown
        }[]
      >
      downloadContractWork: (
        contractId: string,
        datasetId: string,
        amount: number
      ) => Promise<{
        leased: number
        downloaded: number
        skipped: number
        failed: number
      }>
      syncNow: () => Promise<{ ok: boolean }>
      submitContract: (contractId: string) => Promise<{
        ok: boolean
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
