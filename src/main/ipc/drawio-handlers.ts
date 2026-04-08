import { createIpcHandler } from './create-handler'
import { drawioAssetService } from '@main/services/drawio-asset-service'
import type { IpcChannel } from '@shared/ipc-types'

type DrawioChannel = Extract<IpcChannel, `drawio:${string}`>

const drawioHandlerMap: { [C in DrawioChannel]: () => void } = {
  'drawio:save-asset': () =>
    createIpcHandler('drawio:save-asset', (input) => drawioAssetService.saveDrawioAsset(input)),
  'drawio:load-asset': () =>
    createIpcHandler('drawio:load-asset', (input) => drawioAssetService.loadDrawioAsset(input)),
  'drawio:delete-asset': () =>
    createIpcHandler('drawio:delete-asset', (input) => drawioAssetService.deleteDrawioAsset(input)),
}

export type RegisteredDrawioChannels = DrawioChannel

export function registerDrawioHandlers(): void {
  for (const register of Object.values(drawioHandlerMap)) {
    register()
  }
}
