import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    ping: () => ipcRenderer.invoke('db:ping'),
    datasets: {
      create: (payload: {
        id: string
        name: string
        folder_path?: string | null
        cloud_contract_id?: string
      }) => ipcRenderer.invoke('db:datasets:create', payload),
      list: () => ipcRenderer.invoke('db:datasets:list'),
      getByFolder: (folderPath: string) =>
        ipcRenderer.invoke('db:datasets:getByFolder', folderPath),
      getByContractId: (contractId: string) =>
        ipcRenderer.invoke('db:datasets:getByContractId', contractId),
      delete: (datasetId: string) => ipcRenderer.invoke('db:datasets:delete', datasetId)
    },
    media: {
      upsert: (payload: {
        id: string
        dataset_id: string
        local_path: string
        sha256?: string | null
        width?: number | null
        height?: number | null
      }) => ipcRenderer.invoke('db:media:upsert', payload),
      listByDataset: (datasetId: string) => ipcRenderer.invoke('db:media:listByDataset', datasetId),
      setStatus: (payload: { media_id: string; status: 'in_progress' | 'completed' }) =>
        ipcRenderer.invoke('db:media:setStatus', payload),
      setTime: (payload: { media_id: string; seconds: number }) =>
        ipcRenderer.invoke('db:media:setTime', payload)
    },
    annotations: {
      saveExport: (payload: {
        media_id: string
        data_json: string
        cloud_task_id?: string
        contract_id?: string
        payload_json?: string
        payload_hash?: string
      }) => ipcRenderer.invoke('db:annotations:saveExport', payload),
      getExport: (mediaId: string) => ipcRenderer.invoke('db:annotations:getExport', mediaId)
    }
  },
  sam: {
    status: () => ipcRenderer.invoke('sam:status'),
    isInstalled: (modelId?: string) => ipcRenderer.invoke('sam:isInstalled', modelId),
    download: (modelId: string) => ipcRenderer.invoke('sam:download', modelId),
    pauseDownload: (modelId: string) => ipcRenderer.invoke('sam:pauseDownload', modelId),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('sam:cancelDownload', modelId),
    setModel: (modelId: string) => ipcRenderer.invoke('sam:setModel', modelId),
    getModels: () => ipcRenderer.invoke('sam:getModels'),
    ensureReady: () => ipcRenderer.invoke('sam:ensureReady'),
    run: (payload: { imagePath: string; points: { x: number; y: number }[] }) =>
      ipcRenderer.invoke('sam:run', payload),
    onDownloadProgress: (
      handler: (payload: {
        modelId?: string
        stage: 'encoder' | 'decoder'
        loaded: number
        total: number | null
      }) => void
    ): (() => void) => {
      const listener = (_event: unknown, payload: unknown): void => {
        handler(
          payload as {
            modelId?: string
            stage: 'encoder' | 'decoder'
            loaded: number
            total: number | null
          }
        )
      }
      ipcRenderer.on('sam:download-progress', listener)
      return () => {
        ipcRenderer.removeListener('sam:download-progress', listener)
      }
    }
  },
  dataset: {
    pickFolder: () => ipcRenderer.invoke('dataset:pickFolder')
  },
  auth: {
    login: (credentials: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  cloud: {
    fetchContracts: () => ipcRenderer.invoke('cloud:fetchContracts'),
    downloadContractWork: (contractId: string, datasetId: string, amount: number) =>
      ipcRenderer.invoke('cloud:downloadContractWork', contractId, datasetId, amount),
    syncNow: () => ipcRenderer.invoke('cloud:syncNow'),
    submitContract: (contractId: string) => ipcRenderer.invoke('cloud:submitContract', contractId)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((process as any).contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
