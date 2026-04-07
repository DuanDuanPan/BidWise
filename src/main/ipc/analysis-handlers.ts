import { createIpcHandler } from './create-handler'
import {
  tenderImportService,
  scoringExtractor,
  mandatoryItemDetector,
  strategySeedGenerator,
  traceabilityMatrixService,
} from '@main/services/document-parser'
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
  'analysis:detect-mandatory': () =>
    createIpcHandler('analysis:detect-mandatory', (input) => mandatoryItemDetector.detect(input)),
  'analysis:get-mandatory-items': () =>
    createIpcHandler('analysis:get-mandatory-items', (input) =>
      mandatoryItemDetector.getItems(input.projectId)
    ),
  'analysis:get-mandatory-summary': () =>
    createIpcHandler('analysis:get-mandatory-summary', (input) =>
      mandatoryItemDetector.getSummary(input.projectId)
    ),
  'analysis:update-mandatory-item': () =>
    createIpcHandler('analysis:update-mandatory-item', (input) =>
      mandatoryItemDetector.updateItem(input.id, input.patch)
    ),
  'analysis:add-mandatory-item': () =>
    createIpcHandler('analysis:add-mandatory-item', (input) =>
      mandatoryItemDetector.addItem(input)
    ),
  'analysis:generate-seeds': () =>
    createIpcHandler('analysis:generate-seeds', (input) => strategySeedGenerator.generate(input)),
  'analysis:get-seeds': () =>
    createIpcHandler('analysis:get-seeds', (input) =>
      strategySeedGenerator.getSeeds(input.projectId)
    ),
  'analysis:get-seed-summary': () =>
    createIpcHandler('analysis:get-seed-summary', (input) =>
      strategySeedGenerator.getSummary(input.projectId)
    ),
  'analysis:update-seed': () =>
    createIpcHandler('analysis:update-seed', (input) =>
      strategySeedGenerator.updateSeed(input.id, input.patch)
    ),
  'analysis:delete-seed': () =>
    createIpcHandler('analysis:delete-seed', (input) => strategySeedGenerator.deleteSeed(input.id)),
  'analysis:add-seed': () =>
    createIpcHandler('analysis:add-seed', (input) => strategySeedGenerator.addSeed(input)),
  'analysis:generate-matrix': () =>
    createIpcHandler('analysis:generate-matrix', (input) =>
      traceabilityMatrixService.generate(input)
    ),
  'analysis:get-matrix': () =>
    createIpcHandler('analysis:get-matrix', (input) =>
      traceabilityMatrixService.getMatrix(input.projectId)
    ),
  'analysis:get-matrix-stats': () =>
    createIpcHandler('analysis:get-matrix-stats', (input) =>
      traceabilityMatrixService.getStats(input.projectId)
    ),
  'analysis:create-link': () =>
    createIpcHandler('analysis:create-link', (input) =>
      traceabilityMatrixService.createLink(input)
    ),
  'analysis:update-link': () =>
    createIpcHandler('analysis:update-link', (input) =>
      traceabilityMatrixService.updateLink(input.id, input.patch)
    ),
  'analysis:delete-link': () =>
    createIpcHandler('analysis:delete-link', (input) =>
      traceabilityMatrixService.deleteLink(input.id)
    ),
  'analysis:import-addendum': () =>
    createIpcHandler('analysis:import-addendum', (input) =>
      traceabilityMatrixService.importAddendum(input)
    ),
}

export type RegisteredAnalysisChannels = AnalysisChannel

export function registerAnalysisHandlers(): void {
  for (const register of Object.values(analysisHandlerMap)) {
    register()
  }
}
