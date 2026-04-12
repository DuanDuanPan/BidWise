import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentExecuteResult } from '@shared/ai-types'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockApplyReplacements = vi.hoisted(() => vi.fn())
const mockAnnotationCreate = vi.hoisted(() => vi.fn())
const mockAnnotationUpdate = vi.hoisted(() => vi.fn())
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
    update: mockAnnotationUpdate,
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

    // Annotations stay as pending for sidebar visibility (AC3)
    expect(mockAnnotationUpdate).not.toHaveBeenCalled()
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
    const entries = [
      { id: 't1', sourceTerm: '甲方', targetTerm: '采购方', isActive: true },
    ]
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
})
