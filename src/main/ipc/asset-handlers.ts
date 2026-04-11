import { createIpcHandler } from './create-handler'
import { assetService } from '@main/services/asset-service'
import type { IpcChannel } from '@shared/ipc-types'

type AssetChannel = Extract<IpcChannel, `asset:${string}`>

const assetHandlerMap: { [C in AssetChannel]: () => void } = {
  'asset:search': () => createIpcHandler('asset:search', (input) => assetService.search(input)),
  'asset:list': () =>
    createIpcHandler('asset:list', (input) => assetService.list(input || undefined)),
  'asset:get': () => createIpcHandler('asset:get', ({ id }) => assetService.getById(id)),
  'asset:update-tags': () =>
    createIpcHandler('asset:update-tags', (input) => assetService.updateTags(input)),
}

export type RegisteredAssetChannels = AssetChannel

export function registerAssetHandlers(): void {
  for (const register of Object.values(assetHandlerMap)) {
    register()
  }
}
