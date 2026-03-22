import { createIpcHandler } from './create-handler'
import { projectService } from '@main/services/project-service'
import { sortProjectsByPriority } from '@main/services/todo-priority-service'
import type { IpcChannel } from '@shared/ipc-types'

// Automatically extracts all project:* channels from IpcChannelMap
type ProjectChannel = Extract<IpcChannel, `project:${string}`>

// Exhaustive handler map — adding a project:* channel to IpcChannelMap
// without adding its handler here will cause a compile error.
const projectHandlerMap: { [C in ProjectChannel]: () => void } = {
  'project:create': () =>
    createIpcHandler('project:create', (input) => projectService.create(input)),
  'project:list': () => createIpcHandler('project:list', () => projectService.list()),
  'project:get': () =>
    createIpcHandler('project:get', (projectId) => projectService.get(projectId)),
  'project:update': () =>
    createIpcHandler('project:update', ({ projectId, input }) =>
      projectService.update(projectId, input)
    ),
  'project:delete': () =>
    createIpcHandler('project:delete', (projectId) => projectService.delete(projectId)),
  'project:archive': () =>
    createIpcHandler('project:archive', (projectId) => projectService.archive(projectId)),
  'project:list-with-priority': () =>
    createIpcHandler('project:list-with-priority', async () => {
      const projects = await projectService.list()
      return sortProjectsByPriority(projects)
    }),
}

export type RegisteredProjectChannels = ProjectChannel

export function registerProjectHandlers(): void {
  for (const register of Object.values(projectHandlerMap)) {
    register()
  }
}
