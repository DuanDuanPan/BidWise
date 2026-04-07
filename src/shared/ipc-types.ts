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
import type {
  ImportTenderInput,
  ImportTenderResult,
  GetTenderInput,
  ParsedTender,
  ExtractRequirementsInput,
  ExtractionTaskResult,
  GetRequirementsInput,
  RequirementItem,
  GetScoringModelInput,
  ScoringModel,
  UpdateRequirementInput,
  UpdateScoringModelInput,
  ConfirmScoringModelInput,
  DetectMandatoryInput,
  DetectMandatoryResult,
  GetMandatoryItemsInput,
  MandatoryItem,
  GetMandatorySummaryInput,
  MandatoryItemSummary,
  UpdateMandatoryItemInput,
  AddMandatoryItemInput,
  GenerateSeedsInput,
  GenerateSeedsResult,
  GetSeedsInput,
  StrategySeed,
  GetSeedSummaryInput,
  StrategySeedSummary,
  UpdateSeedInput,
  DeleteSeedInput,
  AddSeedInput,
  GenerateFogMapInput,
  GenerateFogMapResult,
  GetFogMapInput,
  FogMapItem,
  GetFogMapSummaryInput,
  FogMapSummary,
  ConfirmCertaintyInput,
  RequirementCertainty,
  BatchConfirmCertaintyInput,
  GenerateMatrixInput,
  GenerateMatrixResult,
  GetMatrixInput,
  TraceabilityMatrix,
  TraceabilityStats,
  CreateLinkInput,
  TraceabilityLink,
  UpdateLinkInput,
  DeleteLinkInput,
  ImportAddendumInput,
  ImportAddendumResult,
} from './analysis-types'
import type { ProposalDocument, ProposalMetadata } from './models/proposal'
import type {
  TemplateSummary,
  ProposalTemplate,
  GenerateSkeletonInput,
  GenerateSkeletonOutput,
  PersistSkeletonInput,
  PersistSkeletonOutput,
} from './template-types'
import type {
  ChapterGenerateInput,
  ChapterRegenerateInput,
  ChapterGenerateOutput,
} from './chapter-types'
import type {
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  DeleteAnnotationInput,
  ListAnnotationsInput,
} from './annotation-types'
import type {
  AttributeSourcesInput,
  ValidateBaselineInput,
  GetSourceAttributionsInput,
  SourceTaskOutput,
  GetSourceAttributionsOutput,
} from './source-attribution-types'

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

export type ProjectWithPriority = ProjectListItem & {
  priorityScore: number
  nextAction: string
}

export type CreateProjectInput = {
  name: string
  rootPath?: string
  customerName?: string
  industry?: string
  deadline?: string
  proposalType?: string
}

export type DocumentSaveInput = {
  projectId: string
  content: string
}

export type DocumentSaveOutput = {
  lastSavedAt: string
}

export type DocumentSaveSyncInput = DocumentSaveInput & {
  rootPath: string
}

export type UpdateProjectInput = Partial<
  Pick<
    ProjectRecord,
    'name' | 'customerName' | 'industry' | 'deadline' | 'proposalType' | 'rootPath' | 'sopStage'
  >
>

export const IPC_CHANNELS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARCHIVE: 'project:archive',
  PROJECT_LIST_WITH_PRIORITY: 'project:list-with-priority',
  AGENT_EXECUTE: 'agent:execute',
  AGENT_STATUS: 'agent:status',
  TASK_LIST: 'task:list',
  TASK_CANCEL: 'task:cancel',
  TASK_GET_STATUS: 'task:get-status',
  TASK_PROGRESS_EVENT: 'task:progress',
  ANALYSIS_IMPORT_TENDER: 'analysis:import-tender',
  ANALYSIS_GET_TENDER: 'analysis:get-tender',
  ANALYSIS_EXTRACT_REQUIREMENTS: 'analysis:extract-requirements',
  ANALYSIS_GET_REQUIREMENTS: 'analysis:get-requirements',
  ANALYSIS_GET_SCORING_MODEL: 'analysis:get-scoring-model',
  ANALYSIS_UPDATE_REQUIREMENT: 'analysis:update-requirement',
  ANALYSIS_UPDATE_SCORING_MODEL: 'analysis:update-scoring-model',
  ANALYSIS_CONFIRM_SCORING_MODEL: 'analysis:confirm-scoring-model',
  ANALYSIS_DETECT_MANDATORY: 'analysis:detect-mandatory',
  ANALYSIS_GET_MANDATORY_ITEMS: 'analysis:get-mandatory-items',
  ANALYSIS_GET_MANDATORY_SUMMARY: 'analysis:get-mandatory-summary',
  ANALYSIS_UPDATE_MANDATORY_ITEM: 'analysis:update-mandatory-item',
  ANALYSIS_ADD_MANDATORY_ITEM: 'analysis:add-mandatory-item',
  ANALYSIS_GENERATE_SEEDS: 'analysis:generate-seeds',
  ANALYSIS_GET_SEEDS: 'analysis:get-seeds',
  ANALYSIS_GET_SEED_SUMMARY: 'analysis:get-seed-summary',
  ANALYSIS_UPDATE_SEED: 'analysis:update-seed',
  ANALYSIS_DELETE_SEED: 'analysis:delete-seed',
  ANALYSIS_ADD_SEED: 'analysis:add-seed',
  ANALYSIS_GENERATE_FOG_MAP: 'analysis:generate-fog-map',
  ANALYSIS_GET_FOG_MAP: 'analysis:get-fog-map',
  ANALYSIS_GET_FOG_MAP_SUMMARY: 'analysis:get-fog-map-summary',
  ANALYSIS_CONFIRM_CERTAINTY: 'analysis:confirm-certainty',
  ANALYSIS_BATCH_CONFIRM_CERTAINTY: 'analysis:batch-confirm-certainty',
  ANALYSIS_GENERATE_MATRIX: 'analysis:generate-matrix',
  ANALYSIS_GET_MATRIX: 'analysis:get-matrix',
  ANALYSIS_GET_MATRIX_STATS: 'analysis:get-matrix-stats',
  ANALYSIS_CREATE_LINK: 'analysis:create-link',
  ANALYSIS_UPDATE_LINK: 'analysis:update-link',
  ANALYSIS_DELETE_LINK: 'analysis:delete-link',
  ANALYSIS_IMPORT_ADDENDUM: 'analysis:import-addendum',
  DOCUMENT_LOAD: 'document:load',
  DOCUMENT_SAVE: 'document:save',
  DOCUMENT_SAVE_SYNC: 'document:save-sync',
  DOCUMENT_GET_METADATA: 'document:get-metadata',
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_GENERATE_SKELETON: 'template:generate-skeleton',
  TEMPLATE_PERSIST_SKELETON: 'template:persist-skeleton',
  CHAPTER_GENERATE: 'chapter:generate',
  CHAPTER_REGENERATE: 'chapter:regenerate',
  ANNOTATION_CREATE: 'annotation:create',
  ANNOTATION_UPDATE: 'annotation:update',
  ANNOTATION_DELETE: 'annotation:delete',
  ANNOTATION_LIST: 'annotation:list',
  SOURCE_ATTRIBUTE: 'source:attribute',
  SOURCE_VALIDATE_BASELINE: 'source:validate-baseline',
  SOURCE_GET_ATTRIBUTIONS: 'source:get-attributions',
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
  'project:list-with-priority': { input: void; output: ProjectWithPriority[] }
  'agent:execute': { input: AgentExecuteRequest; output: AgentExecuteResponse }
  'agent:status': { input: string; output: AgentStatus }
  'task:list': { input: TaskFilter | void; output: TaskRecord[] }
  'task:cancel': { input: string; output: void }
  'task:get-status': { input: { taskId: string }; output: TaskRecord | null }
  'analysis:import-tender': { input: ImportTenderInput; output: ImportTenderResult }
  'analysis:get-tender': { input: GetTenderInput; output: ParsedTender | null }
  'analysis:extract-requirements': { input: ExtractRequirementsInput; output: ExtractionTaskResult }
  'analysis:get-requirements': { input: GetRequirementsInput; output: RequirementItem[] | null }
  'analysis:get-scoring-model': { input: GetScoringModelInput; output: ScoringModel | null }
  'analysis:update-requirement': { input: UpdateRequirementInput; output: RequirementItem }
  'analysis:update-scoring-model': { input: UpdateScoringModelInput; output: ScoringModel }
  'analysis:confirm-scoring-model': { input: ConfirmScoringModelInput; output: ScoringModel }
  'analysis:detect-mandatory': { input: DetectMandatoryInput; output: DetectMandatoryResult }
  'analysis:get-mandatory-items': { input: GetMandatoryItemsInput; output: MandatoryItem[] | null }
  'analysis:get-mandatory-summary': {
    input: GetMandatorySummaryInput
    output: MandatoryItemSummary | null
  }
  'analysis:update-mandatory-item': { input: UpdateMandatoryItemInput; output: MandatoryItem }
  'analysis:add-mandatory-item': { input: AddMandatoryItemInput; output: MandatoryItem }
  'analysis:generate-seeds': { input: GenerateSeedsInput; output: GenerateSeedsResult }
  'analysis:get-seeds': { input: GetSeedsInput; output: StrategySeed[] | null }
  'analysis:get-seed-summary': { input: GetSeedSummaryInput; output: StrategySeedSummary | null }
  'analysis:update-seed': { input: UpdateSeedInput; output: StrategySeed }
  'analysis:delete-seed': { input: DeleteSeedInput; output: void }
  'analysis:add-seed': { input: AddSeedInput; output: StrategySeed }
  'analysis:generate-fog-map': { input: GenerateFogMapInput; output: GenerateFogMapResult }
  'analysis:get-fog-map': { input: GetFogMapInput; output: FogMapItem[] | null }
  'analysis:get-fog-map-summary': { input: GetFogMapSummaryInput; output: FogMapSummary | null }
  'analysis:confirm-certainty': { input: ConfirmCertaintyInput; output: RequirementCertainty }
  'analysis:batch-confirm-certainty': { input: BatchConfirmCertaintyInput; output: void }
  'analysis:generate-matrix': { input: GenerateMatrixInput; output: GenerateMatrixResult }
  'analysis:get-matrix': { input: GetMatrixInput; output: TraceabilityMatrix | null }
  'analysis:get-matrix-stats': { input: GetMatrixInput; output: TraceabilityStats | null }
  'analysis:create-link': { input: CreateLinkInput; output: TraceabilityLink }
  'analysis:update-link': { input: UpdateLinkInput; output: TraceabilityLink }
  'analysis:delete-link': { input: DeleteLinkInput; output: TraceabilityLink | null }
  'analysis:import-addendum': { input: ImportAddendumInput; output: ImportAddendumResult }
  'document:load': { input: { projectId: string }; output: ProposalDocument }
  'document:save': { input: DocumentSaveInput; output: DocumentSaveOutput }
  'document:get-metadata': { input: { projectId: string }; output: ProposalMetadata }
  'template:list': { input: void; output: TemplateSummary[] }
  'template:get': { input: { templateId: string }; output: ProposalTemplate }
  'template:generate-skeleton': { input: GenerateSkeletonInput; output: GenerateSkeletonOutput }
  'template:persist-skeleton': { input: PersistSkeletonInput; output: PersistSkeletonOutput }
  'chapter:generate': { input: ChapterGenerateInput; output: ChapterGenerateOutput }
  'chapter:regenerate': { input: ChapterRegenerateInput; output: ChapterGenerateOutput }
  'annotation:create': { input: CreateAnnotationInput; output: AnnotationRecord }
  'annotation:update': { input: UpdateAnnotationInput; output: AnnotationRecord }
  'annotation:delete': { input: DeleteAnnotationInput; output: void }
  'annotation:list': { input: ListAnnotationsInput; output: AnnotationRecord[] }
  'source:attribute': { input: AttributeSourcesInput; output: SourceTaskOutput }
  'source:validate-baseline': { input: ValidateBaselineInput; output: SourceTaskOutput }
  'source:get-attributions': {
    input: GetSourceAttributionsInput
    output: GetSourceAttributionsOutput
  }
}

// --- IPC Event Payload Map: 单向推送事件通道类型映射 ---
// webContents.send / ipcRenderer.on 专用，不进 IpcChannelMap

export type IpcEventPayloadMap = {
  'task:progress': TaskProgressEvent
}

export type IpcChannel = keyof IpcChannelMap

// --- Channel name → camelCase method name (e.g. 'task:get-status' → 'taskGetStatus') ---

type KebabToCamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<KebabToCamelCase<Tail>>}`
  : S

type ChannelToMethodName<S extends string> = S extends `${infer Domain}:${infer Action}`
  ? `${Domain}${Capitalize<KebabToCamelCase<Action>>}`
  : KebabToCamelCase<S>

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

export type PreloadSyncApi = {
  documentSaveSync: (input: DocumentSaveSyncInput) => ApiResponse<DocumentSaveOutput>
}

// --- Combined API type: request-response + event listeners ---

export type FullPreloadApi = PreloadApi & PreloadEventApi & PreloadSyncApi

// --- IPC Error 类型（供 renderer 端消费） ---

export type IpcError = {
  code: string
  message: string
}
