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
})
