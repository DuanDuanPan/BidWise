import { createIpcHandler } from './create-handler'
import { adversarialLineupService } from '@main/services/adversarial-lineup-service'
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
}

export type RegisteredReviewChannels = ReviewChannel

export function registerReviewHandlers(): void {
  for (const register of Object.values(reviewHandlerMap)) {
    register()
  }
}
