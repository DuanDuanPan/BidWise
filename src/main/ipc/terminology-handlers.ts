import { createIpcHandler } from './create-handler'
import { terminologyService } from '@main/services/terminology-service'
import type { IpcChannel } from '@shared/ipc-types'

type TerminologyChannel = Extract<IpcChannel, `terminology:${string}`>

const terminologyHandlerMap: { [C in TerminologyChannel]: () => void } = {
  'terminology:list': () =>
    createIpcHandler('terminology:list', (input) => terminologyService.list(input || undefined)),
  'terminology:create': () =>
    createIpcHandler('terminology:create', (input) => terminologyService.create(input)),
  'terminology:update': () =>
    createIpcHandler('terminology:update', (input) => terminologyService.update(input)),
  'terminology:delete': () =>
    createIpcHandler('terminology:delete', ({ id }) => terminologyService.delete(id)),
  'terminology:batch-create': () =>
    createIpcHandler('terminology:batch-create', (input) =>
      terminologyService.batchCreate(input.entries)
    ),
  'terminology:export': () =>
    createIpcHandler('terminology:export', () => terminologyService.exportToFile()),
}

export type RegisteredTerminologyChannels = TerminologyChannel

export function registerTerminologyHandlers(): void {
  for (const register of Object.values(terminologyHandlerMap)) {
    register()
  }
}
