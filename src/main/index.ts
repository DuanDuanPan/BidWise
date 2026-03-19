console.time('cold-start')

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '@resources/icon.png?asset'
import { registerIpcHandlers } from '@main/ipc'
import { initDb, destroyDb } from '@main/db/client'
import { runMigrations } from '@main/db/migrator'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('main')

function ensureDataDirectories(): void {
  const dataRoot = join(app.getPath('userData'), 'data')
  const subdirs = ['db', 'projects', 'config', 'logs/ai-trace', 'backups']
  for (const dir of [dataRoot, ...subdirs.map((s) => join(dataRoot, s))]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  mainWindow.on('ready-to-show', () => {
    console.timeEnd('cold-start')
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.bidwise')

  ensureDataDirectories()

  const dbPath = join(app.getPath('userData'), 'data', 'db', 'bidwise.sqlite')
  initDb(dbPath)
  await runMigrations()
  logger.info('数据库初始化完成')

  registerIpcHandlers()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  await destroyDb()
})
