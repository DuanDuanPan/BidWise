import { createIpcHandler } from './create-handler'
import { annotationService } from '@main/services/annotation-service'
import type { IpcChannel } from '@shared/ipc-types'

type AnnotationChannel = Extract<IpcChannel, `annotation:${string}`>

const annotationHandlerMap: { [C in AnnotationChannel]: () => void } = {
  'annotation:create': () =>
    createIpcHandler('annotation:create', (input) => annotationService.create(input)),
  'annotation:update': () =>
    createIpcHandler('annotation:update', (input) => annotationService.update(input)),
  'annotation:delete': () =>
    createIpcHandler('annotation:delete', ({ id }) => annotationService.delete(id)),
  'annotation:list': () =>
    createIpcHandler('annotation:list', (input) => annotationService.list(input)),
}

export type RegisteredAnnotationChannels = AnnotationChannel

export function registerAnnotationHandlers(): void {
  for (const register of Object.values(annotationHandlerMap)) {
    register()
  }
}
