import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentExecuteResult } from '@shared/ai-types'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockApplyReplacements = vi.hoisted(() => vi.fn())
const mockAnnotationCreate = vi.hoisted(() => vi.fn())
const mockAnnotationDelete = vi.hoisted(() => vi.fn())
const mockCreateChapterLocatorKey = vi.hoisted(() => vi.fn())

vi.mock('@main/services/terminology-service', () => ({
  terminologyService: {
    getActiveEntries: mockGetActiveEntries,
  },
}))

vi.mock('@main/services/terminology-replacement-service', () => ({
  terminologyReplacementService: {
    applyReplacements: mockApplyReplacements,
  },
}))

vi.mock('@main/services/annotation-service', () => ({
  annotationService: {
    create: mockAnnotationCreate,
    delete: mockAnnotationDelete,
  },
}))

vi.mock('@shared/chapter-locator-key', () => ({
  createChapterLocatorKey: mockCreateChapterLocatorKey,
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { terminologyPostProcessor } from '@main/services/agent-orchestrator/post-processors/terminology-post-processor'

function makeResult(overrides: Partial<AgentExecuteResult> = {}): AgentExecuteResult {
  return {
    content: '设备管理是核心功能',
    usage: { promptTokens: 100, completionTokens: 50 },
    latencyMs: 500,
    ...overrides,
  }
}

function makeSignal(): AbortSignal {
  return new AbortController().signal
}

describe('terminologyPostProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replaces content and creates pending annotations when active terms exist', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是核心功能',
      replacements: [{ sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 }],
      totalReplacements: 1,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')
    mockAnnotationCreate.mockResolvedValue({ id: 'ann-1' })

    const result = makeResult()
    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    const output = await terminologyPostProcessor(result, context, makeSignal())

    expect(output.content).toBe('装备全寿命周期管理是核心功能')
    expect(output.usage).toEqual(result.usage)
    expect(output.latencyMs).toBe(result.latencyMs)

    expect(mockAnnotationCreate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      sectionId: '2:技术方案:0',
      type: 'ai-suggestion',
      content: expect.stringContaining('设备管理'),
      author: 'system:terminology',
    })
  })

  it('returns original result unchanged when no active terms exist', async () => {
    mockGetActiveEntries.mockResolvedValue([])

    const result = makeResult()
    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    const output = await terminologyPostProcessor(result, context, makeSignal())

    expect(output).toBe(result)
    expect(mockApplyReplacements).not.toHaveBeenCalled()
    expect(mockAnnotationCreate).not.toHaveBeenCalled()
  })

  it('skips processing for ask-system mode', async () => {
    const result = makeResult()
    const context: Record<string, unknown> = { mode: 'ask-system' }

    const output = await terminologyPostProcessor(result, context, makeSignal())

    expect(output).toBe(result)
    expect(mockGetActiveEntries).not.toHaveBeenCalled()
  })

  it('skips processing for annotation-feedback mode', async () => {
    const result = makeResult()
    const context: Record<string, unknown> = { mode: 'annotation-feedback' }

    const output = await terminologyPostProcessor(result, context, makeSignal())

    expect(output).toBe(result)
    expect(mockGetActiveEntries).not.toHaveBeenCalled()
  })

  it('annotationService.create receives correct projectId and stable sectionId', async () => {
    const entries = [{ id: 't1', sourceTerm: '甲方', targetTerm: '采购方', isActive: true }]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '采购方要求如下',
      replacements: [{ sourceTerm: '甲方', targetTerm: '采购方', count: 1 }],
      totalReplacements: 1,
    })
    mockCreateChapterLocatorKey.mockReturnValue('3:项目概述:1')
    mockAnnotationCreate.mockResolvedValue({ id: 'ann-2' })

    const target = { title: '项目概述', level: 3, occurrenceIndex: 1 }
    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-42',
      target,
    }

    await terminologyPostProcessor(makeResult({ content: '甲方要求如下' }), context, makeSignal())

    expect(mockCreateChapterLocatorKey).toHaveBeenCalledWith(target)
    expect(mockAnnotationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-42',
        sectionId: '3:项目概述:1',
      })
    )
  })

  it('throws AbortError when signal is aborted before annotation loop', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是核心功能',
      replacements: [{ sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 }],
      totalReplacements: 1,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')

    const controller = new AbortController()
    controller.abort()

    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    await expect(
      terminologyPostProcessor(makeResult(), context, controller.signal)
    ).rejects.toThrow(/aborted|cancelled|取消/)

    expect(mockAnnotationCreate).not.toHaveBeenCalled()
  })

  it('rolls back annotation and stops loop when signal aborted mid-iteration', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
      { id: 't2', sourceTerm: '甲方', targetTerm: '采购方', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是采购方核心功能',
      replacements: [
        { sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 },
        { sourceTerm: '甲方', targetTerm: '采购方', count: 1 },
      ],
      totalReplacements: 2,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')

    const controller = new AbortController()
    // Abort during the first annotation creation
    mockAnnotationCreate.mockImplementationOnce(async () => {
      controller.abort()
      return { id: 'ann-1' }
    })
    mockAnnotationDelete.mockResolvedValue(undefined)

    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    // Abort does not throw — replaced content is still returned
    const output = await terminologyPostProcessor(makeResult(), context, controller.signal)
    expect(output.content).toBe('装备全寿命周期管理是采购方核心功能')

    // First annotation was created then rolled back; second was never attempted
    expect(mockAnnotationCreate).toHaveBeenCalledTimes(1)
    expect(mockAnnotationDelete).toHaveBeenCalledWith('ann-1')
  })

  it('rolls back all created annotations when abort happens after multiple succeed', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
      { id: 't2', sourceTerm: '甲方', targetTerm: '采购方', isActive: true },
      { id: 't3', sourceTerm: '乙方', targetTerm: '承建方', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是采购方和承建方核心功能',
      replacements: [
        { sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 },
        { sourceTerm: '甲方', targetTerm: '采购方', count: 1 },
        { sourceTerm: '乙方', targetTerm: '承建方', count: 1 },
      ],
      totalReplacements: 3,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')

    const controller = new AbortController()
    // First create succeeds normally, second triggers abort, third never attempted
    mockAnnotationCreate.mockResolvedValueOnce({ id: 'ann-1' }).mockImplementationOnce(async () => {
      controller.abort()
      return { id: 'ann-2' }
    })
    mockAnnotationDelete.mockResolvedValue(undefined)

    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    const output = await terminologyPostProcessor(makeResult(), context, controller.signal)
    expect(output.content).toBe('装备全寿命周期管理是采购方和承建方核心功能')

    // Two annotations created, third never attempted
    expect(mockAnnotationCreate).toHaveBeenCalledTimes(2)
    // Both created annotations rolled back — no orphan leaks
    expect(mockAnnotationDelete).toHaveBeenCalledWith('ann-1')
    expect(mockAnnotationDelete).toHaveBeenCalledWith('ann-2')
    expect(mockAnnotationDelete).toHaveBeenCalledTimes(2)
  })

  it('throws BidWiseError when all annotation creates fail', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是核心功能',
      replacements: [{ sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 }],
      totalReplacements: 1,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')
    mockAnnotationCreate.mockRejectedValue(new Error('DB write failed'))

    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    await expect(terminologyPostProcessor(makeResult(), context, makeSignal())).rejects.toThrow(
      /批注创建失败/
    )

    expect(mockAnnotationCreate).toHaveBeenCalledTimes(1)
  })

  it('throws and rolls back created annotations when some annotations fail', async () => {
    const entries = [
      { id: 't1', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', isActive: true },
      { id: 't2', sourceTerm: '甲方', targetTerm: '采购方', isActive: true },
    ]
    mockGetActiveEntries.mockResolvedValue(entries)
    mockApplyReplacements.mockReturnValue({
      content: '装备全寿命周期管理是采购方核心功能',
      replacements: [
        { sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理', count: 1 },
        { sourceTerm: '甲方', targetTerm: '采购方', count: 1 },
      ],
      totalReplacements: 2,
    })
    mockCreateChapterLocatorKey.mockReturnValue('2:技术方案:0')
    mockAnnotationCreate
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({ id: 'ann-2' })
    mockAnnotationDelete.mockResolvedValue(undefined)

    const context: Record<string, unknown> = {
      mode: 'generate-chapter',
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
    }

    // AC3: partial annotation failure is an error — every replacement needs its annotation
    await expect(terminologyPostProcessor(makeResult(), context, makeSignal())).rejects.toThrow(
      /批注创建失败/
    )

    // Both annotation creates were attempted
    expect(mockAnnotationCreate).toHaveBeenCalledTimes(2)
    // The successful annotation is rolled back since operation is incomplete
    expect(mockAnnotationDelete).toHaveBeenCalledWith('ann-2')
  })
})
