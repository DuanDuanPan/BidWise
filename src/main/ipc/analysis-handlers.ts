import { createIpcHandler } from './create-handler'
import { tenderImportService } from '@main/services/document-parser'
import type { IpcChannel } from '@shared/ipc-types'

type AnalysisChannel = Extract<IpcChannel, `analysis:${string}`>

const analysisHandlerMap: { [C in AnalysisChannel]: () => void } = {
  'analysis:import-tender': () =>
    createIpcHandler('analysis:import-tender', (input) => tenderImportService.importTender(input)),
  'analysis:get-tender': () =>
    createIpcHandler('analysis:get-tender', (input) =>
      tenderImportService.getTender(input.projectId)
    ),
}

export type RegisteredAnalysisChannels = AnalysisChannel

export function registerAnalysisHandlers(): void {
  for (const register of Object.values(analysisHandlerMap)) {
    register()
  }
}
