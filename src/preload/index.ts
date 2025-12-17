// Electron tip deklarasyonları CommonJS tarzında olduğu için TS burada modül uyarısı verebiliyor.
// Bunu bilerek bastırıyoruz; runtime tarafı electron-vite tarafından doğru bundle ediliyor.
// @ts-expect-error Electron is declared as a CommonJS export in electron.d.ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    ping: () => ipcRenderer.invoke('db:ping'),
    datasets: {
      create: (payload: { id: string; name: string; folder_path?: string | null }) =>
        ipcRenderer.invoke('db:datasets:create', payload),
      list: () => ipcRenderer.invoke('db:datasets:list'),
      getByFolder: (folderPath: string) =>
        ipcRenderer.invoke('db:datasets:getByFolder', folderPath),
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
      saveExport: (payload: { media_id: string; data_json: string }) =>
        ipcRenderer.invoke('db:annotations:saveExport', payload),
      getExport: (mediaId: string) => ipcRenderer.invoke('db:annotations:getExport', mediaId)
    }
  },
  dataset: {
    pickFolder: () => ipcRenderer.invoke('dataset:pickFolder')
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
