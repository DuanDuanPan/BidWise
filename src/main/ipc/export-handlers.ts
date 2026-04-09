import { createIpcHandler } from './create-handler'
import { exportService } from '@main/services/export-service'
import type { IpcChannel } from '@shared/ipc-types'

type ExportChannel = Extract<IpcChannel, `export:${string}`>

const exportHandlerMap: { [C in ExportChannel]: () => void } = {
  'export:preview': () =>
    createIpcHandler('export:preview', (input) => exportService.startPreview(input)),
  'export:load-preview': () =>
    createIpcHandler('export:load-preview', (input) => exportService.loadPreviewContent(input)),
  'export:confirm': () =>
    createIpcHandler('export:confirm', (input) => exportService.confirmExport(input)),
  'export:cleanup-preview': () =>
    createIpcHandler('export:cleanup-preview', (input) => exportService.cleanupPreview(input)),
}

export type RegisteredExportChannels = ExportChannel

export function registerExportHandlers(): void {
  for (const register of Object.values(exportHandlerMap)) {
    register()
  }
}
