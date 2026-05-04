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
            label_source?: 'cloud' | 'local' | null
            annotation_format?: string | null
            labeling_spec_json?: string | null
            qc_mode?: string | null
            label_set_name?: string | null
            label_set_version?: number | null
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
          updateLabelingContext: (payload: {
            dataset_id: string
            label_source: 'cloud' | 'local'
            annotation_format?: string | null
            labeling_spec_json?: string | null
            qc_mode?: string | null
            label_set_name?: string | null
            label_set_version?: number | null
          }) => Promise<{ ok: true }>
          getLabelingContext: (datasetId: string) => Promise<{
            dataset: {
              datasetId: string
              labelSource: 'cloud' | 'local' | null
              annotationFormat: string | null
              labelingSpecJson: unknown | null
              qcMode: string | null
              labelSetName: string | null
              labelSetVersion: number | null
            }
            labels: Array<{
              id: string
              dataset_id: string
              name: string
              color: string | null
              attributesSchemaJson: unknown | null
              source: 'cloud' | 'local'
            }>
          } | null>
        }
        datasetLabels: {
          replaceAll: (payload: {
            dataset_id: string
            source: 'cloud' | 'local'
            labels: Array<{
              id?: string
              name: string
              color?: string | null
              attributes_schema_json?: string | null
            }>
          }) => Promise<{ ok: true }>
          listByDataset: (datasetId: string) => Promise<
            Array<{
              id: string
              dataset_id: string
              name: string
              color: string | null
              attributesSchemaJson: unknown | null
              source: 'cloud' | 'local'
            }>
          >
          add: (payload: {
            dataset_id: string
            name: string
            color?: string | null
            attributes_schema_json?: string | null
            source?: 'local' | 'cloud'
          }) => Promise<{ ok: true; id: string }>
          delete: (payload: { dataset_id: string; label_id: string }) => Promise<{ ok: true }>
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
              sync_status?: string | null
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
        bootstrapSession: () => Promise<{
          id: string
          email: string
          role: string
          [key: string]: unknown
        } | null>
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
          amount: number,
          expectedTaskCount?: number
        ) => Promise<{
          leased: number
          downloaded: number
          skipped: number
          failed: number
          status: string
        }>
        syncNow: () => Promise<{ ok: boolean }>
        getContractHealth: (
          contractId: string,
          expectedTaskCount?: number
        ) => Promise<{
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
        }>
        recoverExpiredTasks: (contractId: string) => Promise<{
          ok: boolean
          recoveredCount: number
        }>
        submitContract: (
          contractId: string,
          expectedTaskCount?: number
        ) => Promise<{
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
        }>
        resetContractLocalState: (contractId: string) => Promise<{
          ok: boolean
          deletedDatasets: number
          deletedMediaItems: number
          deletedAnnotations: number
          deletedLeases: number
          deletedFiles: number
        }>
      }
      window: {
        minimize: () => Promise<void>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<void>
      }
      export: {
        localDataset: (payload: {
          datasetId: string
          format: 'COCO' | 'YOLO' | 'VOC'
        }) => Promise<{ ok: true; filePath: string } | { ok: false; cancelled: true }>
      }
    }
  }
}
