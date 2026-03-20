import type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentStatus,
  TaskRecord,
  TaskProgressEvent,
  TaskStatus,
  TaskCategory,
  AgentType,
} from './ai-types'

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
  industry: string | null
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
  'id' | 'name' | 'customerName' | 'industry' | 'deadline' | 'sopStage' | 'status' | 'updatedAt'
>

export type CreateProjectInput = {
  name: string
  rootPath?: string
  customerName?: string
  industry?: string
  deadline?: string
  proposalType?: string
}

export type UpdateProjectInput = Partial<
  Pick<
    ProjectRecord,
    'name' | 'customerName' | 'industry' | 'deadline' | 'proposalType' | 'rootPath'
  >
>

export const IPC_CHANNELS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',
  AGENT_EXECUTE: 'agent:execute',
  AGENT_STATUS: 'agent:status',
  TASK_LIST: 'task:list',
  TASK_CANCEL: 'task:cancel',
  TASK_PROGRESS_EVENT: 'task:progress',
} as const

/** Filter for task:list queries */
export type TaskFilter = {
  status?: TaskStatus
  category?: TaskCategory
  agentType?: AgentType
}

// --- IPC Channel Map: 频道名 → { input, output } 类型对 ---

export type IpcChannelMap = {
  'project:create': { input: CreateProjectInput; output: ProjectRecord }
  'project:list': { input: void; output: ProjectListItem[] }
  'project:get': { input: string; output: ProjectRecord }
  'project:update': {
    input: { projectId: string; input: UpdateProjectInput }
    output: ProjectRecord
  }
  'project:delete': { input: string; output: void }
  'project:archive': { input: string; output: ProjectRecord }
  'agent:execute': { input: AgentExecuteRequest; output: AgentExecuteResponse }
  'agent:status': { input: string; output: AgentStatus }
  'task:list': { input: TaskFilter | void; output: TaskRecord[] }
  'task:cancel': { input: string; output: void }
}

// --- IPC Event Payload Map: 单向推送事件通道类型映射 ---
// webContents.send / ipcRenderer.on 专用，不进 IpcChannelMap

export type IpcEventPayloadMap = {
  'task:progress': TaskProgressEvent
}

export type IpcChannel = keyof IpcChannelMap

// --- Channel name → camelCase method name (e.g. 'project:create' → 'projectCreate') ---

type ChannelToMethodName<S extends string> = S extends `${infer Domain}:${infer Action}`
  ? `${Domain}${Capitalize<Action>}`
  : S

// --- Exhaustive preload API type — derived from IpcChannelMap ---
// Adding a channel to IpcChannelMap without implementing it in preload will cause a compile error.

export type PreloadApi = {
  [C in IpcChannel as ChannelToMethodName<C>]: IpcChannelMap[C]['input'] extends void
    ? () => Promise<ApiResponse<IpcChannelMap[C]['output']>>
    : (input: IpcChannelMap[C]['input']) => Promise<ApiResponse<IpcChannelMap[C]['output']>>
}

// --- IPC Handler 泛型约束 ---

export type IpcHandler<C extends IpcChannel> = (
  input: IpcChannelMap[C]['input']
) => Promise<IpcChannelMap[C]['output']>

// --- Preload Event API: event listener methods exposed to renderer ---

export type PreloadEventApi = {
  onTaskProgress: (callback: (event: TaskProgressEvent) => void) => () => void
}

// --- Combined API type: request-response + event listeners ---

export type FullPreloadApi = PreloadApi & PreloadEventApi

// --- IPC Error 类型（供 renderer 端消费） ---

export type IpcError = {
  code: string
  message: string
}
