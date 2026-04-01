import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResponse,
  DocumentSaveOutput,
  DocumentSaveSyncInput,
  FullPreloadApi,
  IpcChannelMap,
  PreloadApi,
} from '@shared/ipc-types'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type { TaskProgressEvent } from '@shared/ai-types'

// 类型安全的 IPC invoke 包装（内部使用，不暴露给 renderer）
function typedInvoke<C extends keyof IpcChannelMap>(
  channel: C,
  ...args: IpcChannelMap[C]['input'] extends void ? [] : [IpcChannelMap[C]['input']]
): Promise<ApiResponse<IpcChannelMap[C]['output']>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<ApiResponse<IpcChannelMap[C]['output']>>
}

function typedSendSync<TInput, TOutput>(channel: string, input: TInput): ApiResponse<TOutput> {
  return ipcRenderer.sendSync(channel, input) as ApiResponse<TOutput>
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

  projectListWithPriority: () => typedInvoke(IPC_CHANNELS.PROJECT_LIST_WITH_PRIORITY),

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

  analysisExtractRequirements: (input: IpcChannelMap['analysis:extract-requirements']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_EXTRACT_REQUIREMENTS, input),

  analysisGetRequirements: (input: IpcChannelMap['analysis:get-requirements']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_REQUIREMENTS, input),

  analysisGetScoringModel: (input: IpcChannelMap['analysis:get-scoring-model']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_SCORING_MODEL, input),

  analysisUpdateRequirement: (input: IpcChannelMap['analysis:update-requirement']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_UPDATE_REQUIREMENT, input),

  analysisUpdateScoringModel: (input: IpcChannelMap['analysis:update-scoring-model']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_UPDATE_SCORING_MODEL, input),

  analysisConfirmScoringModel: (input: IpcChannelMap['analysis:confirm-scoring-model']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_CONFIRM_SCORING_MODEL, input),

  analysisDetectMandatory: (input: IpcChannelMap['analysis:detect-mandatory']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_DETECT_MANDATORY, input),

  analysisGetMandatoryItems: (input: IpcChannelMap['analysis:get-mandatory-items']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_MANDATORY_ITEMS, input),

  analysisGetMandatorySummary: (input: IpcChannelMap['analysis:get-mandatory-summary']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_MANDATORY_SUMMARY, input),

  analysisUpdateMandatoryItem: (input: IpcChannelMap['analysis:update-mandatory-item']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_UPDATE_MANDATORY_ITEM, input),

  analysisAddMandatoryItem: (input: IpcChannelMap['analysis:add-mandatory-item']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_ADD_MANDATORY_ITEM, input),

  analysisGenerateSeeds: (input: IpcChannelMap['analysis:generate-seeds']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GENERATE_SEEDS, input),

  analysisGetSeeds: (input: IpcChannelMap['analysis:get-seeds']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_SEEDS, input),

  analysisGetSeedSummary: (input: IpcChannelMap['analysis:get-seed-summary']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_SEED_SUMMARY, input),

  analysisUpdateSeed: (input: IpcChannelMap['analysis:update-seed']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_UPDATE_SEED, input),

  analysisDeleteSeed: (input: IpcChannelMap['analysis:delete-seed']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_DELETE_SEED, input),

  analysisAddSeed: (input: IpcChannelMap['analysis:add-seed']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_ADD_SEED, input),

  documentLoad: (input: IpcChannelMap['document:load']['input']) =>
    typedInvoke(IPC_CHANNELS.DOCUMENT_LOAD, input),

  documentSave: (input: IpcChannelMap['document:save']['input']) =>
    typedInvoke(IPC_CHANNELS.DOCUMENT_SAVE, input),

  documentGetMetadata: (input: IpcChannelMap['document:get-metadata']['input']) =>
    typedInvoke(IPC_CHANNELS.DOCUMENT_GET_METADATA, input),

  templateList: () => typedInvoke(IPC_CHANNELS.TEMPLATE_LIST),

  templateGet: (input: IpcChannelMap['template:get']['input']) =>
    typedInvoke(IPC_CHANNELS.TEMPLATE_GET, input),

  templateGenerateSkeleton: (input: IpcChannelMap['template:generate-skeleton']['input']) =>
    typedInvoke(IPC_CHANNELS.TEMPLATE_GENERATE_SKELETON, input),

  templatePersistSkeleton: (input: IpcChannelMap['template:persist-skeleton']['input']) =>
    typedInvoke(IPC_CHANNELS.TEMPLATE_PERSIST_SKELETON, input),

  chapterGenerate: (input: IpcChannelMap['chapter:generate']['input']) =>
    typedInvoke(IPC_CHANNELS.CHAPTER_GENERATE, input),

  chapterRegenerate: (input: IpcChannelMap['chapter:regenerate']['input']) =>
    typedInvoke(IPC_CHANNELS.CHAPTER_REGENERATE, input),
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

const syncApi = {
  documentSaveSync: (input: DocumentSaveSyncInput): ApiResponse<DocumentSaveOutput> =>
    typedSendSync(IPC_CHANNELS.DOCUMENT_SAVE_SYNC, input),
}

// Combined API exposed to renderer
const api: FullPreloadApi = {
  ...requestApi,
  ...eventApi,
  ...syncApi,
}

contextBridge.exposeInMainWorld('api', api)
