import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

const mockHandle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
    }
  },
}))

const mockImportTender = vi.fn()
const mockGetTender = vi.fn()
const mockExtractRequirements = vi.fn()
const mockGetRequirements = vi.fn()
const mockGetScoringModel = vi.fn()
const mockUpdateRequirement = vi.fn()
const mockUpdateScoringModel = vi.fn()
const mockConfirmScoringModel = vi.fn()
const mockDetectMandatory = vi.fn()
const mockGetMandatoryItems = vi.fn()
const mockGetMandatorySummary = vi.fn()
const mockUpdateMandatoryItem = vi.fn()
const mockAddMandatoryItem = vi.fn()
const mockGenerateSeeds = vi.fn()
const mockGetSeeds = vi.fn()
const mockGetSeedSummary = vi.fn()
const mockUpdateSeed = vi.fn()
const mockDeleteSeed = vi.fn()
const mockAddSeed = vi.fn()
const mockGenerateFogMap = vi.fn()
const mockGetFogMap = vi.fn()
const mockGetFogMapSummary = vi.fn()
const mockConfirmCertainty = vi.fn()
const mockBatchConfirm = vi.fn()

vi.mock('@main/services/document-parser', () => ({
  tenderImportService: {
    importTender: (...args: unknown[]) => mockImportTender(...args),
    getTender: (...args: unknown[]) => mockGetTender(...args),
  },
  scoringExtractor: {
    extract: (...args: unknown[]) => mockExtractRequirements(...args),
    getRequirements: (...args: unknown[]) => mockGetRequirements(...args),
    getScoringModel: (...args: unknown[]) => mockGetScoringModel(...args),
    updateRequirement: (...args: unknown[]) => mockUpdateRequirement(...args),
    updateScoringCriterion: (...args: unknown[]) => mockUpdateScoringModel(...args),
    confirmScoringModel: (...args: unknown[]) => mockConfirmScoringModel(...args),
  },
  mandatoryItemDetector: {
    detect: (...args: unknown[]) => mockDetectMandatory(...args),
    getItems: (...args: unknown[]) => mockGetMandatoryItems(...args),
    getSummary: (...args: unknown[]) => mockGetMandatorySummary(...args),
    updateItem: (...args: unknown[]) => mockUpdateMandatoryItem(...args),
    addItem: (...args: unknown[]) => mockAddMandatoryItem(...args),
  },
  strategySeedGenerator: {
    generate: (...args: unknown[]) => mockGenerateSeeds(...args),
    getSeeds: (...args: unknown[]) => mockGetSeeds(...args),
    getSummary: (...args: unknown[]) => mockGetSeedSummary(...args),
    updateSeed: (...args: unknown[]) => mockUpdateSeed(...args),
    deleteSeed: (...args: unknown[]) => mockDeleteSeed(...args),
    addSeed: (...args: unknown[]) => mockAddSeed(...args),
  },
  fogMapClassifier: {
    generate: (...args: unknown[]) => mockGenerateFogMap(...args),
    getFogMap: (...args: unknown[]) => mockGetFogMap(...args),
    getSummary: (...args: unknown[]) => mockGetFogMapSummary(...args),
    confirmCertainty: (...args: unknown[]) => mockConfirmCertainty(...args),
    batchConfirm: (...args: unknown[]) => mockBatchConfirm(...args),
  },
}))

import { registerAnalysisHandlers } from '@main/ipc/analysis-handlers'

describe('analysis-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register analysis:import-tender and analysis:get-tender handlers', () => {
    registerAnalysisHandlers()

    const channels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('analysis:import-tender')
    expect(channels).toContain('analysis:get-tender')
    expect(channels).toContain('analysis:extract-requirements')
    expect(channels).toContain('analysis:get-requirements')
    expect(channels).toContain('analysis:get-scoring-model')
    expect(channels).toContain('analysis:update-requirement')
    expect(channels).toContain('analysis:update-scoring-model')
    expect(channels).toContain('analysis:confirm-scoring-model')
    expect(channels).toContain('analysis:detect-mandatory')
    expect(channels).toContain('analysis:get-mandatory-items')
    expect(channels).toContain('analysis:get-mandatory-summary')
    expect(channels).toContain('analysis:update-mandatory-item')
    expect(channels).toContain('analysis:add-mandatory-item')
    expect(channels).toContain('analysis:generate-seeds')
    expect(channels).toContain('analysis:get-seeds')
    expect(channels).toContain('analysis:get-seed-summary')
    expect(channels).toContain('analysis:update-seed')
    expect(channels).toContain('analysis:delete-seed')
    expect(channels).toContain('analysis:add-seed')
    expect(channels).toContain('analysis:generate-fog-map')
    expect(channels).toContain('analysis:get-fog-map')
    expect(channels).toContain('analysis:get-fog-map-summary')
    expect(channels).toContain('analysis:confirm-certainty')
    expect(channels).toContain('analysis:batch-confirm-certainty')
  })

  it('analysis:import-tender dispatches to tenderImportService.importTender', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:import-tender'
    )?.[1]
    expect(handler).toBeDefined()

    const mockResult = { taskId: 'task-1' }
    mockImportTender.mockResolvedValue(mockResult)

    const result = await handler({}, { projectId: 'proj-1', filePath: '/test.pdf' })

    expect(result).toEqual({ success: true, data: mockResult })
    expect(mockImportTender).toHaveBeenCalledWith({ projectId: 'proj-1', filePath: '/test.pdf' })
  })

  it('analysis:get-tender dispatches to tenderImportService.getTender', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:get-tender'
    )?.[1]
    expect(handler).toBeDefined()

    const mockParsed = {
      meta: {},
      sections: [],
      rawText: '',
      totalPages: 5,
      hasScannedContent: false,
    }
    mockGetTender.mockResolvedValue(mockParsed)

    const result = await handler({}, { projectId: 'proj-1' })

    expect(result).toEqual({ success: true, data: mockParsed })
    expect(mockGetTender).toHaveBeenCalledWith('proj-1')
  })

  it('should wrap errors as ApiResponse error format', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:import-tender'
    )?.[1]

    const { BidWiseError } = await import('@main/utils/errors')
    mockImportTender.mockRejectedValue(new BidWiseError('TENDER_IMPORT', '文件不存在'))

    const result = await handler({}, { projectId: 'proj-1', filePath: '/bad.pdf' })

    expect(result).toEqual({
      success: false,
      error: { code: 'TENDER_IMPORT', message: '文件不存在' },
    })
  })

  it('@story-2-5 dispatches extraction requests to scoringExtractor.extract', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:extract-requirements'
    )?.[1]
    expect(handler).toBeDefined()

    mockExtractRequirements.mockResolvedValue({ taskId: 'extract-task-1' })

    const result = await handler({}, { projectId: 'proj-2-5' })

    expect(result).toEqual({ success: true, data: { taskId: 'extract-task-1' } })
    expect(mockExtractRequirements).toHaveBeenCalledWith({ projectId: 'proj-2-5' })
  })

  it('@story-2-5 dispatches requirement updates to scoringExtractor.updateRequirement', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:update-requirement'
    )?.[1]
    expect(handler).toBeDefined()

    const updatedRequirement = {
      id: 'req-1',
      sequenceNumber: 1,
      description: '更新后的需求说明',
      sourcePages: [2, 3],
      category: 'technical',
      priority: 'high',
      status: 'modified',
    }
    mockUpdateRequirement.mockResolvedValue(updatedRequirement)

    const result = await handler(
      {},
      {
        id: 'req-1',
        patch: { description: '更新后的需求说明', status: 'modified' },
      }
    )

    expect(result).toEqual({ success: true, data: updatedRequirement })
    expect(mockUpdateRequirement).toHaveBeenCalledWith('req-1', {
      description: '更新后的需求说明',
      status: 'modified',
    })
  })

  it('@story-2-5 dispatches confirmation requests to scoringExtractor.confirmScoringModel', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:confirm-scoring-model'
    )?.[1]
    expect(handler).toBeDefined()

    const confirmedModel = {
      projectId: 'proj-2-5',
      totalScore: 100,
      criteria: [
        {
          id: 'criterion-1',
          category: '技术方案',
          maxScore: 60,
          weight: 0.6,
          subItems: [],
          reasoning: '确认后的评分依据',
          status: 'confirmed',
        },
      ],
      extractedAt: '2026-03-22T09:00:00.000Z',
      confirmedAt: '2026-03-22T09:10:00.000Z',
      version: 1,
    }
    mockConfirmScoringModel.mockResolvedValue(confirmedModel)

    const result = await handler({}, { projectId: 'proj-2-5' })

    expect(result).toEqual({ success: true, data: confirmedModel })
    expect(mockConfirmScoringModel).toHaveBeenCalledWith('proj-2-5')
  })

  it('@story-2-7 dispatches seed generation requests to strategySeedGenerator.generate', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:generate-seeds'
    )?.[1]
    expect(handler).toBeDefined()

    mockGenerateSeeds.mockResolvedValue({ taskId: 'seed-task-1' })

    const result = await handler({}, { projectId: 'proj-2-7', sourceMaterial: '客户纪要' })

    expect(result).toEqual({ success: true, data: { taskId: 'seed-task-1' } })
    expect(mockGenerateSeeds).toHaveBeenCalledWith({
      projectId: 'proj-2-7',
      sourceMaterial: '客户纪要',
    })
  })

  it('@story-2-7 dispatches seed updates to strategySeedGenerator.updateSeed', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:update-seed'
    )?.[1]
    expect(handler).toBeDefined()

    const updatedSeed = {
      id: 'seed-1',
      title: '客户高度关注性能稳定性',
      reasoning: '客户主动提及竞品性能问题。',
      suggestion: '补充性能压测与容量规划。',
      sourceExcerpt: '竞品性能问题',
      confidence: 0.88,
      status: 'adjusted',
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-01T09:05:00.000Z',
    }
    mockUpdateSeed.mockResolvedValue(updatedSeed)

    const result = await handler(
      {},
      {
        id: 'seed-1',
        patch: { title: '客户高度关注性能稳定性' },
      }
    )

    expect(result).toEqual({ success: true, data: updatedSeed })
    expect(mockUpdateSeed).toHaveBeenCalledWith('seed-1', {
      title: '客户高度关注性能稳定性',
    })
  })
})
