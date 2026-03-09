import { app, BrowserWindow, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DbService } from './services/db-service'
import { registerIpc } from './services/ipc'
import { UpdaterService } from './services/updater-service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const dbService = new DbService()
const updaterService = new UpdaterService()
let mainWindow: BrowserWindow | null = null
const RENDERER_RUN_SQL_SHORTCUT_CHANNEL = 'pointer:shortcut:run-sql'
let isF5ShortcutRegistered = false

function registerFocusedWindowShortcuts(): void {
  if (isF5ShortcutRegistered) {
    return
  }

  const ok = globalShortcut.register('F5', () => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFocused()) {
      return
    }

    mainWindow.webContents.send(RENDERER_RUN_SQL_SHORTCUT_CHANNEL)
  })

  isF5ShortcutRegistered = ok
}

function unregisterFocusedWindowShortcuts(): void {
  if (!isF5ShortcutRegistered) {
    return
  }

  globalShortcut.unregister('F5')
  isF5ShortcutRegistered = false
}

registerIpc(dbService, updaterService)

function createMainWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#020617',
    titleBarStyle: isMac ? 'hidden' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 5 } : undefined,
    icon: path.join(process.env.VITE_PUBLIC, 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isPlainF5 =
      input.type === 'keyDown' &&
      !input.control &&
      !input.meta &&
      !input.alt &&
      (input.key === 'F5' || input.code === 'F5')

    if (!isPlainF5) {
      return
    }

    event.preventDefault()
    mainWindow?.webContents.send(RENDERER_RUN_SQL_SHORTCUT_CHANNEL)
  })

  mainWindow.on('focus', () => {
    registerFocusedWindowShortcuts()
  })

  mainWindow.on('blur', () => {
    unregisterFocusedWindowShortcuts()
  })

  mainWindow.on('closed', () => {
    unregisterFocusedWindowShortcuts()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('before-quit', async () => {
  unregisterFocusedWindowShortcuts()
  await dbService.close()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.whenReady().then(() => {
  createMainWindow()
})
