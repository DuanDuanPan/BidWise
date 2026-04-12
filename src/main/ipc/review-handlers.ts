import { createIpcHandler } from './create-handler'
import { adversarialLineupService } from '@main/services/adversarial-lineup-service'
import { adversarialReviewService } from '@main/services/adversarial-review-service'
import { attackChecklistService } from '@main/services/attack-checklist-service'
import type { IpcChannel } from '@shared/ipc-types'

type ReviewChannel = Extract<IpcChannel, `review:${string}`>

const reviewHandlerMap: { [C in ReviewChannel]: () => void } = {
  'review:generate-roles': () =>
    createIpcHandler('review:generate-roles', (input) => adversarialLineupService.generate(input)),
  'review:get-lineup': () =>
    createIpcHandler('review:get-lineup', ({ projectId }) =>
      adversarialLineupService.getLineup(projectId)
    ),
  'review:update-roles': () =>
    createIpcHandler('review:update-roles', (input) => adversarialLineupService.updateRoles(input)),
  'review:confirm-lineup': () =>
    createIpcHandler('review:confirm-lineup', (input) =>
      adversarialLineupService.confirmLineup(input)
    ),
  'review:start-execution': () =>
    createIpcHandler('review:start-execution', (input) =>
      adversarialReviewService.startExecution(input.projectId)
    ),
  'review:get-review': () =>
    createIpcHandler('review:get-review', (input) =>
      adversarialReviewService.getReview(input.projectId)
    ),
  'review:handle-finding': () =>
    createIpcHandler('review:handle-finding', (input) =>
      adversarialReviewService.handleFinding(input.findingId, input.action, input.rebuttalReason)
    ),
  'review:retry-role': () =>
    createIpcHandler('review:retry-role', (input) =>
      adversarialReviewService.retryRole(input.projectId, input.roleId)
    ),
  'review:generate-attack-checklist': () =>
    createIpcHandler('review:generate-attack-checklist', (input) =>
      attackChecklistService.generate(input.projectId)
    ),
  'review:get-attack-checklist': () =>
    createIpcHandler('review:get-attack-checklist', (input) =>
      attackChecklistService.getChecklist(input.projectId)
    ),
  'review:update-checklist-item-status': () =>
    createIpcHandler('review:update-checklist-item-status', (input) =>
      attackChecklistService.updateItemStatus(input.itemId, input.status)
    ),
}

export type RegisteredReviewChannels = ReviewChannel

export function registerReviewHandlers(): void {
  for (const register of Object.values(reviewHandlerMap)) {
    register()
  }
}
