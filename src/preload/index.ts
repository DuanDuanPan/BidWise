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
import type { NotificationRecord } from '@shared/notification-types'

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

  analysisGenerateFogMap: (input: IpcChannelMap['analysis:generate-fog-map']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GENERATE_FOG_MAP, input),

  analysisGetFogMap: (input: IpcChannelMap['analysis:get-fog-map']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_FOG_MAP, input),

  analysisGetFogMapSummary: (input: IpcChannelMap['analysis:get-fog-map-summary']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_FOG_MAP_SUMMARY, input),

  analysisConfirmCertainty: (input: IpcChannelMap['analysis:confirm-certainty']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_CONFIRM_CERTAINTY, input),

  analysisBatchConfirmCertainty: (
    input: IpcChannelMap['analysis:batch-confirm-certainty']['input']
  ) => typedInvoke(IPC_CHANNELS.ANALYSIS_BATCH_CONFIRM_CERTAINTY, input),

  analysisGenerateMatrix: (input: IpcChannelMap['analysis:generate-matrix']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GENERATE_MATRIX, input),

  analysisGetMatrix: (input: IpcChannelMap['analysis:get-matrix']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_MATRIX, input),

  analysisGetMatrixStats: (input: IpcChannelMap['analysis:get-matrix-stats']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_GET_MATRIX_STATS, input),

  analysisCreateLink: (input: IpcChannelMap['analysis:create-link']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_CREATE_LINK, input),

  analysisUpdateLink: (input: IpcChannelMap['analysis:update-link']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_UPDATE_LINK, input),

  analysisDeleteLink: (input: IpcChannelMap['analysis:delete-link']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_DELETE_LINK, input),

  analysisImportAddendum: (input: IpcChannelMap['analysis:import-addendum']['input']) =>
    typedInvoke(IPC_CHANNELS.ANALYSIS_IMPORT_ADDENDUM, input),

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

  annotationCreate: (input: IpcChannelMap['annotation:create']['input']) =>
    typedInvoke(IPC_CHANNELS.ANNOTATION_CREATE, input),

  annotationUpdate: (input: IpcChannelMap['annotation:update']['input']) =>
    typedInvoke(IPC_CHANNELS.ANNOTATION_UPDATE, input),

  annotationDelete: (input: IpcChannelMap['annotation:delete']['input']) =>
    typedInvoke(IPC_CHANNELS.ANNOTATION_DELETE, input),

  annotationList: (input: IpcChannelMap['annotation:list']['input']) =>
    typedInvoke(IPC_CHANNELS.ANNOTATION_LIST, input),

  annotationListReplies: (input: IpcChannelMap['annotation:list-replies']['input']) =>
    typedInvoke(IPC_CHANNELS.ANNOTATION_LIST_REPLIES, input),

  sourceAttribute: (input: IpcChannelMap['source:attribute']['input']) =>
    typedInvoke(IPC_CHANNELS.SOURCE_ATTRIBUTE, input),

  sourceValidateBaseline: (input: IpcChannelMap['source:validate-baseline']['input']) =>
    typedInvoke(IPC_CHANNELS.SOURCE_VALIDATE_BASELINE, input),

  sourceGetAttributions: (input: IpcChannelMap['source:get-attributions']['input']) =>
    typedInvoke(IPC_CHANNELS.SOURCE_GET_ATTRIBUTIONS, input),

  writingStyleList: () => typedInvoke(IPC_CHANNELS.WRITING_STYLE_LIST),

  writingStyleGet: (input: IpcChannelMap['writing-style:get']['input']) =>
    typedInvoke(IPC_CHANNELS.WRITING_STYLE_GET, input),

  writingStyleUpdateProject: (input: IpcChannelMap['writing-style:update-project']['input']) =>
    typedInvoke(IPC_CHANNELS.WRITING_STYLE_UPDATE_PROJECT, input),

  drawioSaveAsset: (input: IpcChannelMap['drawio:save-asset']['input']) =>
    typedInvoke(IPC_CHANNELS.DRAWIO_SAVE_ASSET, input),

  drawioLoadAsset: (input: IpcChannelMap['drawio:load-asset']['input']) =>
    typedInvoke(IPC_CHANNELS.DRAWIO_LOAD_ASSET, input),

  drawioDeleteAsset: (input: IpcChannelMap['drawio:delete-asset']['input']) =>
    typedInvoke(IPC_CHANNELS.DRAWIO_DELETE_ASSET, input),

  docxRender: (input: IpcChannelMap['docx:render']['input']) =>
    typedInvoke(IPC_CHANNELS.DOCX_RENDER, input),

  docxHealth: () => typedInvoke(IPC_CHANNELS.DOCX_HEALTH),

  mermaidSaveAsset: (input: IpcChannelMap['mermaid:save-asset']['input']) =>
    typedInvoke(IPC_CHANNELS.MERMAID_SAVE_ASSET, input),

  mermaidDeleteAsset: (input: IpcChannelMap['mermaid:delete-asset']['input']) =>
    typedInvoke(IPC_CHANNELS.MERMAID_DELETE_ASSET, input),

  notificationList: (input: IpcChannelMap['notification:list']['input']) =>
    typedInvoke(IPC_CHANNELS.NOTIFICATION_LIST, input),

  notificationMarkRead: (input: IpcChannelMap['notification:mark-read']['input']) =>
    typedInvoke(IPC_CHANNELS.NOTIFICATION_MARK_READ, input),

  notificationMarkAllRead: (input: IpcChannelMap['notification:mark-all-read']['input']) =>
    typedInvoke(IPC_CHANNELS.NOTIFICATION_MARK_ALL_READ, input),

  notificationCountUnread: (input: IpcChannelMap['notification:count-unread']['input']) =>
    typedInvoke(IPC_CHANNELS.NOTIFICATION_COUNT_UNREAD, input),

  exportPreview: (input: IpcChannelMap['export:preview']['input']) =>
    typedInvoke(IPC_CHANNELS.EXPORT_PREVIEW, input),

  exportLoadPreview: (input: IpcChannelMap['export:load-preview']['input']) =>
    typedInvoke(IPC_CHANNELS.EXPORT_LOAD_PREVIEW, input),

  exportConfirm: (input: IpcChannelMap['export:confirm']['input']) =>
    typedInvoke(IPC_CHANNELS.EXPORT_CONFIRM, input),

  exportCleanupPreview: (input: IpcChannelMap['export:cleanup-preview']['input']) =>
    typedInvoke(IPC_CHANNELS.EXPORT_CLEANUP_PREVIEW, input),

  assetSearch: (input: IpcChannelMap['asset:search']['input']) =>
    typedInvoke(IPC_CHANNELS.ASSET_SEARCH, input),

  assetList: (input?: IpcChannelMap['asset:list']['input']) =>
    typedInvoke(IPC_CHANNELS.ASSET_LIST, input),

  assetGet: (input: IpcChannelMap['asset:get']['input']) =>
    typedInvoke(IPC_CHANNELS.ASSET_GET, input),

  assetUpdateTags: (input: IpcChannelMap['asset:update-tags']['input']) =>
    typedInvoke(IPC_CHANNELS.ASSET_UPDATE_TAGS, input),
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
  onNotificationNew: (callback: (notification: NotificationRecord) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: NotificationRecord): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_NEW_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_NEW_EVENT, handler)
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
