import { createIpcHandler } from './create-handler'
import { sourceAttributionService } from '@main/services/source-attribution-service'
import type { IpcChannel } from '@shared/ipc-types'

type SourceChannel = Extract<IpcChannel, `source:${string}`>

const sourceHandlerMap: { [C in SourceChannel]: () => void } = {
  'source:attribute': () =>
    createIpcHandler('source:attribute', (input) =>
      sourceAttributionService.attributeSources(input)
    ),
  'source:validate-baseline': () =>
    createIpcHandler('source:validate-baseline', (input) =>
      sourceAttributionService.validateBaseline(input)
    ),
  'source:get-attributions': () =>
    createIpcHandler('source:get-attributions', (input) =>
      sourceAttributionService.getAttributions(input)
    ),
}

export type RegisteredSourceAttributionChannels = SourceChannel

export function registerSourceAttributionHandlers(): void {
  for (const register of Object.values(sourceHandlerMap)) {
    register()
  }
}
