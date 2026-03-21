import { contextBridge, ipcRenderer } from 'electron'
import type { ApiResponse, IpcChannelMap, PreloadApi, FullPreloadApi } from '@shared/ipc-types'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type { TaskProgressEvent } from '@shared/ai-types'

// 类型安全的 IPC invoke 包装（内部使用，不暴露给 renderer）
function typedInvoke<C extends keyof IpcChannelMap>(
  channel: C,
  ...args: IpcChannelMap[C]['input'] extends void ? [] : [IpcChannelMap[C]['input']]
): Promise<ApiResponse<IpcChannelMap[C]['output']>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ApiResponse<IpcChannelMap[C]['output']>>
}

// Request-response methods — satisfies PreloadApi ensures every IpcChannel has a method.
const requestApi = {
  projectCreate: (input: IpcChannelMap['project:create']['input']) =>
    typedInvoke(IPC_CHANNELS.PROJECT_CREATE, input),

  projectList: () => typedInvoke(IPC_CHANNELS.PROJECT_LIST),

  projectGet: (projectId: IpcChannelMap['project:get']['input']) =>
    typedInvoke(IPC_CHANNELS.PROJECT_GET, projectId),

  projectUpdate: (input: IpcChannelMap['project:update']['input']) =>
    typedInvoke(IPC_CHANNELS.PROJECT_UPDATE, input),

  projectDelete: (projectId: IpcChannelMap['project:delete']['input']) =>
    typedInvoke(IPC_CHANNELS.PROJECT_DELETE, projectId),

  projectArchive: (projectId: IpcChannelMap['project:archive']['input']) =>
    typedInvoke(IPC_CHANNELS.PROJECT_ARCHIVE, projectId),

  agentExecute: (input: IpcChannelMap['agent:execute']['input']) =>
    typedInvoke(IPC_CHANNELS.AGENT_EXECUTE, input),

  agentStatus: (taskId: IpcChannelMap['agent:status']['input']) =>
    typedInvoke(IPC_CHANNELS.AGENT_STATUS, taskId),

  taskList: (filter?: IpcChannelMap['task:list']['input']) =>
    typedInvoke(IPC_CHANNELS.TASK_LIST, filter),

  taskCancel: (taskId: IpcChannelMap['task:cancel']['input']) =>
    typedInvoke(IPC_CHANNELS.TASK_CANCEL, taskId),

  taskGetStatus: (input: IpcChannelMap['task:get-status']['input']) =>
    typedInvoke(IPC_CHANNELS.TASK_GET_STATUS, input),

  analysisImportTender: (input: IpcChannelMap['analysis:import-tender']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_IMPORT_TENDER, input),

  analysisGetTender: (input: IpcChannelMap['analysis:get-tender']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_TENDER, input),
} satisfies PreloadApi

// Event listener methods — single-direction push from main → renderer
const eventApi = {
  onTaskProgress: (callback: (event: TaskProgressEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TaskProgressEvent): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS_EVENT, handler)
    }
  },
}

// Combined API exposed to renderer
const api: FullPreloadApi = {
  ...requestApi,
  ...eventApi,
}

contextBridge.exposeInMainWorld('api', api)
