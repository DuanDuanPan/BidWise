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
  customerName: string | null
  deadline: string | null
  proposalType: string
  sopStage: string
  status: string
  rootPath: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectListItem = Pick<
  ProjectRecord,
  'id' | 'name' | 'customerName' | 'deadline' | 'sopStage' | 'status' | 'updatedAt'
>

export type CreateProjectInput = {
  name: string
  rootPath?: string
  customerName?: string
  deadline?: string
  proposalType?: string
}

export type UpdateProjectInput = Partial<
  Pick<ProjectRecord, 'name' | 'customerName' | 'deadline' | 'proposalType' | 'rootPath'>
>

export const IPC_CHANNELS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',
} as const
