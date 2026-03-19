import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-types'

// Thin dispatch layer — business logic lives in services/
export function registerIpcHandlers(): void {
  const stubResponse = { success: true as const, data: null }

  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, () => stubResponse)
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, () => stubResponse)
  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, () => stubResponse)
  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, () => stubResponse)
  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, () => stubResponse)
  ipcMain.handle(IPC_CHANNELS.PROJECT_ARCHIVE, () => stubResponse)
}
