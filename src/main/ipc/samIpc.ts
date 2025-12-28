import { ipcMain } from 'electron'
import {
  downloadSamModel,
  ensureSamSessionLoaded,
  getSamState,
  isModelDownloaded,
  runSamInference,
  switchSamModel,
  pauseSamDownload,
  cancelSamDownload,
  SAM_MODELS,
  type SamPoint,
  type SamModelId
} from '../samModel'

export function registerSamIpc(): void {
  ipcMain.handle('sam:status', () => {
    return getSamState()
  })

  ipcMain.handle('sam:isInstalled', async (_event, modelId?: SamModelId) => {
    const currentState = getSamState()
    const targetId = modelId || currentState.currentModelId
    const downloaded = await isModelDownloaded(targetId)
    return {
      downloaded,
      state: currentState
    }
  })

  ipcMain.handle('sam:download', async (event, modelId: SamModelId) => {
    await downloadSamModel(modelId, (progress) => {
      event.sender.send('sam:download-progress', progress)
    })
    return {
      ok: true,
      state: getSamState()
    }
  })

  ipcMain.handle('sam:pauseDownload', async (_event, modelId: SamModelId) => {
    await pauseSamDownload(modelId)
    return { 
      ok: true,
      state: getSamState()
    }
  })

  ipcMain.handle('sam:cancelDownload', async (_event, modelId: SamModelId) => {
    await cancelSamDownload(modelId)
    return {
      ok: true,
      state: getSamState()
    }
  })

  ipcMain.handle('sam:setModel', async (_event, modelId: SamModelId) => {
    await switchSamModel(modelId)
    return {
      ok: true,
      state: getSamState()
    }
  })

  ipcMain.handle('sam:getModels', () => {
     return SAM_MODELS
  })

  ipcMain.handle(
    'sam:ensureReady',
    async () => {
      await ensureSamSessionLoaded()
      return {
        ok: true,
        state: getSamState()
      }
    }
  )

  ipcMain.handle(
    'sam:run',
    async (
      _event,
      payload: {
        imagePath: string
        points: SamPoint[]
      }
    ) => {
      const res = await runSamInference(payload.imagePath, payload.points)
      return {
        ok: true,
        mask: res
      }
    }
  )
}
