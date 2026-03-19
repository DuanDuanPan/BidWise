export type SuccessResponse<T> = {
  success: true
  data: T
}

export type ErrorResponse = {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

export type ProjectRecord = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type ProjectListItem = Pick<ProjectRecord, 'id' | 'name' | 'updatedAt'>

export type CreateProjectInput = {
  name: string
  rootPath: string
}

export type UpdateProjectInput = Partial<Pick<ProjectRecord, 'name'>>

export const IPC_CHANNELS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',
} as const
