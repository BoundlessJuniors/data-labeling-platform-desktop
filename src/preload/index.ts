import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    ping: () => ipcRenderer.invoke('db:ping'),
    datasets: {
      create: (payload: { id: string; name: string }) =>
        ipcRenderer.invoke('db:datasets:create', payload),
      list: () => ipcRenderer.invoke('db:datasets:list')
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
        ipcRenderer.invoke('db:media:setStatus', payload)
    },
    annotations: {
      saveExport: (payload: { media_id: string; data_json: string }) =>
        ipcRenderer.invoke('db:annotations:saveExport', payload),
      getExport: (mediaId: string) => ipcRenderer.invoke('db:annotations:getExport', mediaId)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
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
