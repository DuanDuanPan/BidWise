import { createIpcHandler } from './create-handler'
import { mermaidAssetService } from '@main/services/mermaid-asset-service'
import type { IpcChannel } from '@shared/ipc-types'

type MermaidChannel = Extract<IpcChannel, `mermaid:${string}`>

const mermaidHandlerMap: { [C in MermaidChannel]: () => void } = {
  'mermaid:save-asset': () =>
    createIpcHandler('mermaid:save-asset', (input) => mermaidAssetService.saveMermaidAsset(input)),
  'mermaid:load-asset': () =>
    createIpcHandler('mermaid:load-asset', (input) => mermaidAssetService.loadMermaidAsset(input)),
  'mermaid:delete-asset': () =>
    createIpcHandler('mermaid:delete-asset', (input) =>
      mermaidAssetService.deleteMermaidAsset(input)
    ),
}

export type RegisteredMermaidChannels = MermaidChannel

export function registerMermaidHandlers(): void {
  for (const register of Object.values(mermaidHandlerMap)) {
    register()
  }
}
