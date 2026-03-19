import type {
  ApiResponse,
  CreateProjectInput,
  ProjectListItem,
  ProjectRecord,
  UpdateProjectInput,
} from '@shared/ipc-types'

declare global {
  interface Window {
    api: {
      projectCreate: (input: CreateProjectInput) => Promise<ApiResponse<ProjectRecord>>
      projectList: () => Promise<ApiResponse<ProjectListItem[]>>
      projectGet: (projectId: string) => Promise<ApiResponse<ProjectRecord>>
      projectUpdate: (
        projectId: string,
        input: UpdateProjectInput
      ) => Promise<ApiResponse<ProjectRecord>>
      projectDelete: (projectId: string) => Promise<ApiResponse<void>>
      projectArchive: (projectId: string) => Promise<ApiResponse<ProjectRecord>>
    }
  }
}
