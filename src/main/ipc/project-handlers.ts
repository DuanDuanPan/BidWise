import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type { CreateProjectInput, UpdateProjectInput } from '@shared/ipc-types'
import { ProjectService } from '@main/services'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'

const projectService = new ProjectService()

function wrapError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof BidWiseError) {
    return { success: false as const, error: { code: error.code, message: error.message } }
  }
  return { success: false as const, error: { code: ErrorCode.UNKNOWN, message: String(error) } }
}

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (_event, input: CreateProjectInput) => {
    try {
      const result = await projectService.create(input)
      return { success: true as const, data: result }
    } catch (error) {
      return wrapError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async () => {
    try {
      const result = await projectService.findAll()
      return { success: true as const, data: result }
    } catch (error) {
      return wrapError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, async (_event, projectId: string) => {
    try {
      const result = await projectService.findById(projectId)
      return { success: true as const, data: result }
    } catch (error) {
      return wrapError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE,
    async (_event, payload: { projectId: string; input: UpdateProjectInput }) => {
      try {
        const result = await projectService.update(payload.projectId, payload.input)
        return { success: true as const, data: result }
      } catch (error) {
        return wrapError(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, async (_event, projectId: string) => {
    try {
      await projectService.delete(projectId)
      return { success: true as const, data: null }
    } catch (error) {
      return wrapError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_ARCHIVE, async (_event, projectId: string) => {
    try {
      const result = await projectService.archive(projectId)
      return { success: true as const, data: result }
    } catch (error) {
      return wrapError(error)
    }
  })
}
