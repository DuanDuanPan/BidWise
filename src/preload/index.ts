import { contextBridge, ipcRenderer } from 'electron'
import type { ApiResponse, IpcChannelMap, PreloadApi } from '@shared/ipc-types'
import { IPC_CHANNELS } from '@shared/ipc-types'

// 类型安全的 IPC invoke 包装（内部使用，不暴露给 renderer）
function typedInvoke<C extends keyof IpcChannelMap>(
  channel: C,
  ...args: IpcChannelMap[C]['input'] extends void ? [] : [IpcChannelMap[C]['input']]
): Promise<ApiResponse<IpcChannelMap[C]['output']>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ApiResponse<IpcChannelMap[C]['output']>>
}

// Exhaustive whitelist API — satisfies PreloadApi ensures every IpcChannel has a method.
// Adding a channel to IpcChannelMap without implementing it in preload will cause a compile error.
const api = {
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
} satisfies PreloadApi

contextBridge.exposeInMainWorld('api', api)
