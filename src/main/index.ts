console.time('cold-start')

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '@resources/icon.png?asset'
import { registerIpcHandlers } from '@main/ipc'
import { initDb, destroyDb } from '@main/db/client'
import { runMigrations } from '@main/db/migrator'
import { taskQueue } from '@main/services/task-queue'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { createLogger } from '@main/utils/logger'
import { docxBridgeService } from '@main/services/docx-bridge'
import { initSkillEngine } from '@main/services/skill-engine'
import { mermaidRuntimeClient } from '@main/services/diagram-runtime/mermaid-runtime-client'

const logger = createLogger('main')

async function ensureDataDirectories(): Promise<void> {
  const dataRoot = join(app.getPath('userData'), 'data')
  const subdirs = [
    'db',
    'projects',
    'config',
    'desensitize-mappings',
    'logs/ai-trace',
    'logs/app',
    'backups',
  ]
  for (const dir of [dataRoot, ...subdirs.map((s) => join(dataRoot, s))]) {
    await fs.mkdir(dir, { recursive: true })
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
      sandbox: true,
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

// Override userData before any path-dependent call (macOS ignores HOME env var)
if (process.env.BIDWISE_USER_DATA_DIR) {
  app.setPath('userData', process.env.BIDWISE_USER_DATA_DIR)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.bidwise')

  await ensureDataDirectories()

  const dbPath = join(app.getPath('userData'), 'data', 'db', 'bidwise.sqlite')
  initDb(dbPath)
  await runMigrations()
  // Ensure singleton side effects run before recovered tasks are re-dispatched.
  void agentOrchestrator
  await initSkillEngine()
  await taskQueue.recoverPendingTasks()
  logger.info('数据库初始化完成')

  registerIpcHandlers()

  // Start docx-bridge in background — must not block window creation
  void docxBridgeService.start().catch((err) => {
    logger.warn(`docx-bridge 后台启动失败: ${err}`)
  })

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
  try {
    await mermaidRuntimeClient.stop()
  } catch (err) {
    logger.error(`mermaid runtime 关闭异常: ${err}`)
  }
  try {
    await docxBridgeService.stop()
  } catch (err) {
    logger.error(`docx-bridge 关闭异常: ${err}`)
  }
  try {
    await destroyDb()
  } catch (err) {
    logger.error(`数据库关闭异常: ${err}`)
  }
})
