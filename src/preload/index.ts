import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResponse,
  CreateProjectInput,
  ProjectListItem,
  ProjectRecord,
  UpdateProjectInput,
} from '@shared/ipc-types'
import { IPC_CHANNELS } from '@shared/ipc-types'

type ProjectApi = {
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

const api: ProjectApi = {
  projectCreate: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input) as Promise<ApiResponse<ProjectRecord>>,
  projectList: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST) as Promise<ApiResponse<ProjectListItem[]>>,
  projectGet: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, projectId) as Promise<ApiResponse<ProjectRecord>>,
  projectUpdate: (projectId, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, { projectId, input }) as Promise<
      ApiResponse<ProjectRecord>
    >,
  projectDelete: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, projectId) as Promise<ApiResponse<void>>,
  projectArchive: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ARCHIVE, projectId) as Promise<
      ApiResponse<ProjectRecord>
    >,
}

contextBridge.exposeInMainWorld('api', api)
