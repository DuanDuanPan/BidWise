import { createIpcHandler } from './create-handler'
import { templateService } from '@main/services/template-service'
import type { IpcChannel } from '@shared/ipc-types'

type TemplateChannel = Extract<IpcChannel, `template:${string}`>

const templateHandlerMap: { [C in TemplateChannel]: () => void } = {
  'template:list': () => createIpcHandler('template:list', () => templateService.listTemplates()),
  'template:get': () =>
    createIpcHandler('template:get', ({ templateId }) => templateService.getTemplate(templateId)),
  'template:generate-skeleton': () =>
    createIpcHandler('template:generate-skeleton', (input) =>
      templateService.generateSkeleton(input)
    ),
  'template:persist-skeleton': () =>
    createIpcHandler('template:persist-skeleton', (input) =>
      templateService.persistSkeleton(input)
    ),
}

export type RegisteredTemplateChannels = TemplateChannel

export function registerTemplateHandlers(): void {
  for (const register of Object.values(templateHandlerMap)) {
    register()
  }
}
