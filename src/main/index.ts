import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { extname, join } from 'path'
import { pathToFileURL } from 'url'
import { dialog } from 'electron'
import { readdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb } from './db/sqlite'
import { registerDbIpc } from './ipc/dbIpc'
import { registerSamIpc } from './ipc/samIpc'
import { registerAuthIpc } from './api/authIpc'
import { registerCloudTasksIpc } from './api/cloudTasksIpc'
import { startSync } from './sync/syncManager'
import { registerExportIpc } from './ipc/exportIpc'

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
// local:// protokolünü renderer'da "güvenli/standard" gibi kullanabilmek için
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])
function createWindow(): void {
  // Create the browser window with a custom (frameless) title bar so we can draw
  // our own top bar with window controls like a code editor.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Ignore malformed URLs and deny opening a new window.
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.labelgun.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  protocol.handle('local', async (request) => {
    try {
      const u = new URL(request.url)

      // u.pathname örn:
      // Windows: "/C:/Users/.../20211218_145115.jpg"
      // POSIX  : "/home/user/.../img.jpg"
      let p = decodeURIComponent(u.pathname)

      // Windows'ta baştaki "/" kaldırılmalı ("/C:/..." -> "C:/...")
      if (/^\/[a-zA-Z]:\//.test(p)) {
        p = p.slice(1)
      }

      const ext = extname(p).toLowerCase()
      if (!IMAGE_EXTS.includes(ext)) {
        return new Response('Forbidden', { status: 403 })
      }

      const fileUrl = pathToFileURL(p).toString()
      return net.fetch(fileUrl)
    } catch (e) {
      console.error('[local-protocol] failed:', e, 'url=', request.url)
      return new Response('Not found', { status: 404 })
    }
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  // Window controls for custom title bar
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.minimize()
  })

  ipcMain.handle('window:toggleMaximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.close()
  })
  initDb()
  registerDbIpc()
  registerSamIpc()
  registerAuthIpc()
  registerCloudTasksIpc()
  registerExportIpc()
  startSync()

  // === Dataset folder picker ===
  ipcMain.handle('dataset:pickFolder', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null

    const folder = res.filePaths[0]
    const files = readdirSync(folder)

    const images = files.filter((f) => {
      const ext = f.toLowerCase().slice(f.lastIndexOf('.'))
      return IMAGE_EXTS.includes(ext)
    })

    return {
      folder,
      images
    }
  })
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
