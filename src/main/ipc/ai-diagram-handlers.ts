import { createIpcHandler } from './create-handler'
import { aiDiagramAssetService } from '@main/services/ai-diagram-asset-service'
import type { IpcChannel } from '@shared/ipc-types'

type AiDiagramChannel = Extract<IpcChannel, `ai-diagram:${string}`>

const aiDiagramHandlerMap: { [C in AiDiagramChannel]: () => void } = {
  'ai-diagram:save-asset': () =>
    createIpcHandler('ai-diagram:save-asset', (input) =>
      aiDiagramAssetService.saveAiDiagramAsset(input)
    ),
  'ai-diagram:load-asset': () =>
    createIpcHandler('ai-diagram:load-asset', (input) =>
      aiDiagramAssetService.loadAiDiagramAsset(input)
    ),
  'ai-diagram:delete-asset': () =>
    createIpcHandler('ai-diagram:delete-asset', (input) =>
      aiDiagramAssetService.deleteAiDiagramAsset(input)
    ),
}

export type RegisteredAiDiagramChannels = AiDiagramChannel

export function registerAiDiagramHandlers(): void {
  for (const register of Object.values(aiDiagramHandlerMap)) {
    register()
  }
}
