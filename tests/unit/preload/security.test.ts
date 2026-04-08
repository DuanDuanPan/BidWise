import { vi, describe, it, expect } from 'vitest'

const mockExposeInMainWorld = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
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
      'agentExecute',
      'agentStatus',
      'taskList',
      'taskCancel',
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
      'chapterGenerate',
      'chapterRegenerate',
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
      'mermaidDeleteAsset',
      'onTaskProgress',
    ])
    expect(new Set(Object.keys(exposedApi))).toEqual(allowedMethods)
  })

  it('all exposed values are functions (no data leaks)', () => {
    for (const [key, value] of Object.entries(exposedApi)) {
      expect(typeof value, `${key} should be a function`).toBe('function')
    }
  })
})
