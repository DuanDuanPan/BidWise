import { vi, describe, it, expect } from 'vitest'

const { mockExposeInMainWorld, mockGetPathForFile } = vi.hoisted(() => ({
  mockExposeInMainWorld: vi.fn(),
  mockGetPathForFile: vi.fn((file: File) => `/native/${file.name}`),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  webUtils: {
    getPathForFile: mockGetPathForFile,
  },
  ipcRenderer: {
    invoke: vi.fn(),
    sendSync: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

// Trigger preload side-effects (contextBridge.exposeInMainWorld call)
await import('../../../src/preload/index')

const exposedKey = mockExposeInMainWorld.mock.calls[0]?.[0] as string
const exposedApi = mockExposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown>

describe('preload security isolation (AC-2, AC-5)', () => {
  it('exposes API under "api" namespace only (single call)', () => {
    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(exposedKey).toBe('api')
  })

  it('does not expose raw ipcRenderer methods', () => {
    const rawIpcMethods = [
      'send',
      'sendSync',
      'sendToHost',
      'invoke',
      'on',
      'once',
      'removeListener',
      'removeAllListeners',
    ]
    for (const method of rawIpcMethods) {
      expect(exposedApi, `ipcRenderer.${method} must not be exposed`).not.toHaveProperty(method)
    }
  })

  it('does not expose Node.js built-ins', () => {
    const forbidden = [
      'require',
      'process',
      'Buffer',
      '__dirname',
      '__filename',
      'module',
      'exports',
      'global',
    ]
    for (const prop of forbidden) {
      expect(exposedApi, `${prop} must not be exposed`).not.toHaveProperty(prop)
    }
  })

  it('only exposes whitelisted API methods', () => {
    const allowedMethods = new Set([
      'projectCreate',
      'projectList',
      'projectGet',
      'projectUpdate',
      'projectDelete',
      'projectArchive',
      'projectListWithPriority',
      'configGetAiStatus',
      'configSaveAi',
      'agentExecute',
      'agentStatus',
      'taskList',
      'taskCancel',
      'taskDelete',
      'taskGetStatus',
      'analysisImportTender',
      'analysisGetTender',
      'analysisExtractRequirements',
      'analysisGetRequirements',
      'analysisGetScoringModel',
      'analysisUpdateRequirement',
      'analysisUpdateScoringModel',
      'analysisConfirmScoringModel',
      'analysisDetectMandatory',
      'analysisGetMandatoryItems',
      'analysisGetMandatorySummary',
      'analysisUpdateMandatoryItem',
      'analysisAddMandatoryItem',
      'analysisGenerateSeeds',
      'analysisGetSeeds',
      'analysisGetSeedSummary',
      'analysisUpdateSeed',
      'analysisDeleteSeed',
      'analysisAddSeed',
      'analysisGenerateMatrix',
      'analysisGetMatrix',
      'analysisGetMatrixStats',
      'analysisCreateLink',
      'analysisUpdateLink',
      'analysisDeleteLink',
      'analysisImportAddendum',
      'analysisGenerateFogMap',
      'analysisGetFogMap',
      'analysisGetFogMapSummary',
      'analysisConfirmCertainty',
      'analysisBatchConfirmCertainty',
      'documentLoad',
      'documentSave',
      'documentSaveSync',
      'documentGetMetadata',
      'templateList',
      'templateGet',
      'templateGenerateSkeleton',
      'templatePersistSkeleton',
      'chapterBatchGenerate',
      'chapterBatchRetrySection',
      'chapterBatchSkipSection',
      'chapterGenerate',
      'chapterRegenerate',
      'chapterSkeletonConfirm',
      'chapterSkeletonGenerate',
      'annotationCreate',
      'annotationUpdate',
      'annotationDelete',
      'annotationList',
      'sourceAttribute',
      'sourceValidateBaseline',
      'sourceGetAttributions',
      'writingStyleList',
      'writingStyleGet',
      'writingStyleUpdateProject',
      'drawioSaveAsset',
      'drawioLoadAsset',
      'drawioDeleteAsset',
      'docxRender',
      'docxHealth',
      'mermaidSaveAsset',
      'mermaidLoadAsset',
      'mermaidDeleteAsset',
      'annotationListReplies',
      'notificationList',
      'notificationMarkRead',
      'notificationMarkAllRead',
      'notificationCountUnread',
      'exportPreview',
      'exportLoadPreview',
      'exportConfirm',
      'exportCleanupPreview',
      'assetSearch',
      'assetList',
      'assetGet',
      'assetUpdateTags',
      'assetCreate',
      'assetRecommend',
      'complianceCheck',
      'complianceExportGate',
      'reviewGenerateRoles',
      'reviewGetLineup',
      'reviewUpdateRoles',
      'reviewConfirmLineup',
      'reviewStartExecution',
      'reviewGetReview',
      'reviewHandleFinding',
      'reviewRetryRole',
      'reviewGenerateAttackChecklist',
      'reviewGetAttackChecklist',
      'reviewUpdateChecklistItemStatus',
      'terminologyList',
      'terminologyCreate',
      'terminologyUpdate',
      'terminologyDelete',
      'terminologyBatchCreate',
      'terminologyExport',
      'aiDiagramSaveAsset',
      'aiDiagramLoadAsset',
      'aiDiagramDeleteAsset',
      'onTaskProgress',
      'onNotificationNew',
      'getPathForFile',
    ])
    expect(new Set(Object.keys(exposedApi))).toEqual(allowedMethods)
  })

  it('all exposed values are functions (no data leaks)', () => {
    for (const [key, value] of Object.entries(exposedApi)) {
      expect(typeof value, `${key} should be a function`).toBe('function')
    }
  })

  it('bridges file path lookup through Electron webUtils', () => {
    const file = new File(['seed'], 'tender.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    expect(exposedApi.getPathForFile(file)).toBe('/native/tender.docx')
    expect(mockGetPathForFile).toHaveBeenCalledWith(file)
  })
})
