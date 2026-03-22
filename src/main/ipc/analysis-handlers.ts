import { createIpcHandler } from './create-handler'
import { tenderImportService, scoringExtractor } from '@main/services/document-parser'
import type { IpcChannel } from '@shared/ipc-types'

type AnalysisChannel = Extract<IpcChannel, `analysis:${string}`>

const analysisHandlerMap: { [C in AnalysisChannel]: () => void } = {
  'analysis:import-tender': () =>
    createIpcHandler('analysis:import-tender', (input) => tenderImportService.importTender(input)),
  'analysis:get-tender': () =>
    createIpcHandler('analysis:get-tender', (input) =>
      tenderImportService.getTender(input.projectId)
    ),
  'analysis:extract-requirements': () =>
    createIpcHandler('analysis:extract-requirements', (input) => scoringExtractor.extract(input)),
  'analysis:get-requirements': () =>
    createIpcHandler('analysis:get-requirements', (input) =>
      scoringExtractor.getRequirements(input.projectId)
    ),
  'analysis:get-scoring-model': () =>
    createIpcHandler('analysis:get-scoring-model', (input) =>
      scoringExtractor.getScoringModel(input.projectId)
    ),
  'analysis:update-requirement': () =>
    createIpcHandler('analysis:update-requirement', (input) =>
      scoringExtractor.updateRequirement(input.id, input.patch)
    ),
  'analysis:update-scoring-model': () =>
    createIpcHandler('analysis:update-scoring-model', (input) =>
      scoringExtractor.updateScoringCriterion(input.projectId, input.criterionId, input.patch)
    ),
  'analysis:confirm-scoring-model': () =>
    createIpcHandler('analysis:confirm-scoring-model', (input) =>
      scoringExtractor.confirmScoringModel(input.projectId)
    ),
}

export type RegisteredAnalysisChannels = AnalysisChannel

export function registerAnalysisHandlers(): void {
  for (const register of Object.values(analysisHandlerMap)) {
    register()
  }
}
