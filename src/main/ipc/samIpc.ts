import { ipcMain } from 'electron'
import {
  downloadSamModel,
  ensureSamSessionLoaded,
  getSamState,
  getSamModelPath,
  isSamModelDownloaded,
  runSamInference,
  type SamPoint
} from '../samModel'

export function registerSamIpc(): void {
  ipcMain.handle('sam:status', () => {
    return getSamState()
  })

  ipcMain.handle('sam:isInstalled', async () => {
    const downloaded = await isSamModelDownloaded()
    const state = getSamState()
    return {
      downloaded,
      state
    }
  })

  ipcMain.handle('sam:download', async (event) => {
    await downloadSamModel((progress) => {
      event.sender.send('sam:download-progress', progress)
    })
    return {
      ok: true,
      path: getSamModelPath(),
      state: getSamState()
    }
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
