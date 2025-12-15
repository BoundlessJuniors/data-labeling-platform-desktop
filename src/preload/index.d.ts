import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        ping: () => Promise<{ ok: boolean }>
        datasets: {
          create: (payload: { id: string; name: string }) => Promise<{ ok: true }>
          list: () => Promise<Array<{ id: string; name: string; created_at: number }>>
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
            }>
          >
          setStatus: (payload: {
            media_id: string
            status: 'in_progress' | 'completed'
          }) => Promise<{ ok: true }>
        }
        annotations: {
          saveExport: (payload: { media_id: string; data_json: string }) => Promise<{ ok: true }>
          getExport: (mediaId: string) => Promise<{ data_json: string; updated_at: number } | null>
        }
      }
    }
  }
}
