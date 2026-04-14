import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SkeletonExpandPlan } from '@shared/chapter-types'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockBuildPromptContext = vi.hoisted(() => vi.fn())
const mockLoggerWarn = vi.hoisted(() => vi.fn())
const mockMermaidRuntimeValidate = vi.hoisted(() => vi.fn().mockResolvedValue({ valid: true }))

vi.mock('@main/services/terminology-service', () => ({
  terminologyService: { getActiveEntries: mockGetActiveEntries },
}))
vi.mock('@main/services/terminology-replacement-service', () => ({
  terminologyReplacementService: { buildPromptContext: mockBuildPromptContext },
}))
vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))
vi.mock('@main/services/diagram-runtime/mermaid-runtime-client', () => ({
  mermaidRuntimeClient: {
    validate: (...args: unknown[]) => mockMermaidRuntimeValidate(...args),
  },
}))
vi.mock('@main/services/drawio-asset-service', () => ({
  drawioAssetService: { saveDrawioAsset: vi.fn() },
}))

const { generateAgentHandler } =
  await import('@main/services/agent-orchestrator/agents/generate-agent')

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeAiResponse(
  content: string,
  overrides?: { finishReason?: string }
): {
  content: string
  usage: { promptTokens: number; completionTokens: number }
  latencyMs: number
  model: string
  provider: string
  finishReason: string
} {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    latencyMs: 100,
    model: 'mock',
    provider: 'mock',
    finishReason: overrides?.finishReason ?? 'stop',
  }
}

function makeSkeleton(
  sections: Array<{ title: string; level?: number; dimensions?: string[] }>
): SkeletonExpandPlan {
  return {
    parentTitle: '系统设计',
    parentLevel: 2,
    sections: sections.map((s) => ({
      title: s.title,
      level: s.level ?? 3,
      dimensions: s.dimensions ?? ['functional'],
      guidanceHint: undefined,
    })),
    dimensionChecklist: ['functional', 'ui', 'security'],
    confirmedAt: '2026-04-14T00:00:00.000Z',
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('generateAgentHandler skeleton-batch mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveEntries.mockResolvedValue([])
    mockBuildPromptContext.mockReturnValue('')
  })

  it('returns assembled markdown with all section headings when all 3 sections succeed', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce(makeAiResponse('功能设计内容'))
        .mockResolvedValueOnce(makeAiResponse('接口设计内容'))
        .mockResolvedValueOnce(makeAiResponse('安全设计内容')),
    }

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if (result.kind !== 'result') return

    const { content } = result.value
    expect(content).toContain('### 功能设计')
    expect(content).toContain('功能设计内容')
    expect(content).toContain('### 接口设计')
    expect(content).toContain('接口设计内容')
    expect(content).toContain('### 安全设计')
    expect(content).toContain('安全设计内容')
  })

  it('returns partial markdown with failure placeholder when the middle section throws, without overall throw', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce(makeAiResponse('功能设计内容'))
        .mockRejectedValueOnce(new Error('LLM timeout'))
        .mockResolvedValueOnce(makeAiResponse('安全设计内容')),
    }

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if (result.kind !== 'result') return

    const { content } = result.value
    // Successful sections are present
    expect(content).toContain('### 功能设计')
    expect(content).toContain('功能设计内容')
    expect(content).toContain('### 安全设计')
    expect(content).toContain('安全设计内容')
    // Failed section has placeholder, not missing
    expect(content).toContain('### 接口设计')
    expect(content).toContain('> [生成失败]')
    expect(content).toContain('接口设计')
  })

  it('includes summary of section 1 content in prompt for section 2 (context chaining)', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([{ title: '功能设计' }, { title: '接口设计' }])

    const section1Content = '功能设计详细内容，包括用户管理模块'
    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce(makeAiResponse(section1Content))
        .mockResolvedValueOnce(makeAiResponse('接口设计内容')),
    }

    await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(aiProxy.call).toHaveBeenCalledTimes(2)

    // The second call should have a prompt that contains the first section's content summary
    const secondCallMessages = aiProxy.call.mock.calls[1][0].messages as Array<{
      role: string
      content: string
    }>
    const userMessage = secondCallMessages.find((m) => m.role === 'user')
    expect(userMessage).toBeDefined()
    expect(userMessage!.content).toContain(section1Content)
  })

  it('throws abort error when signal is aborted mid-generation', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    // Abort after the first section completes
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:batch:0') {
          return makeAiResponse('功能设计内容')
        }
        // Abort before the second section is processed
        controller.abort()
        return makeAiResponse('接口设计内容')
      }),
    }

    await expect(
      generateAgentHandler(
        {
          mode: 'skeleton-batch',
          confirmedSkeleton,
          requirements: '支持高并发系统',
        },
        { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('resumes from checkpoint index 1 when checkpoint contains one completed markdown', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    const checkpoint = {
      sectionResults: [{ kind: 'completed' as const, markdown: 'content1' }, null, null],
      nextIndex: 1,
    }

    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce(makeAiResponse('接口设计内容'))
        .mockResolvedValueOnce(makeAiResponse('安全设计内容')),
    }

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy, checkpoint }
    )

    // Should only call aiProxy twice (section index 1 and 2, not 0)
    expect(aiProxy.call).toHaveBeenCalledTimes(2)
    expect(aiProxy.call.mock.calls[0][0].caller).toBe('generate-agent:batch:1')
    expect(aiProxy.call.mock.calls[1][0].caller).toBe('generate-agent:batch:2')

    // Assembled content should include all three sections (section 0 from checkpoint)
    expect(result).toMatchObject({ kind: 'result' })
    if (result.kind !== 'result') return

    const { content } = result.value
    expect(content).toContain('### 功能设计')
    expect(content).toContain('content1')
    expect(content).toContain('### 接口设计')
    expect(content).toContain('接口设计内容')
    expect(content).toContain('### 安全设计')
    expect(content).toContain('安全设计内容')
  })

  it('calls setCheckpoint after each successful section', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce(makeAiResponse('功能设计内容'))
        .mockResolvedValueOnce(makeAiResponse('接口设计内容'))
        .mockResolvedValueOnce(makeAiResponse('安全设计内容')),
    }

    const nextIndicesAtCallTime: number[] = []
    const setCheckpoint = vi.fn().mockImplementation(async (data: unknown) => {
      const cp = data as { sectionResults: unknown[]; nextIndex: number }
      nextIndicesAtCallTime.push(cp.nextIndex)
    })

    await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy, setCheckpoint }
    )

    // setCheckpoint should be called once per section (3 total)
    expect(setCheckpoint).toHaveBeenCalledTimes(3)

    // Verify that nextIndex increments: 1, 2, 3
    expect(nextIndicesAtCallTime).toEqual([1, 2, 3])

    // Final checkpoint should have all sections completed
    const lastCall = setCheckpoint.mock.calls[2][0] as {
      sectionResults: Array<{ kind: string; markdown?: string }>
      nextIndex: number
    }
    expect(lastCall.nextIndex).toBe(3)
    expect(lastCall.sectionResults[0]).toMatchObject({
      kind: 'completed',
      markdown: '功能设计内容',
    })
    expect(lastCall.sectionResults[1]).toMatchObject({
      kind: 'completed',
      markdown: '接口设计内容',
    })
    expect(lastCall.sectionResults[2]).toMatchObject({
      kind: 'completed',
      markdown: '安全设计内容',
    })
  })

  describe('skeleton-batch-single mode (progressive)', () => {
    it('returns single sub-chapter content via aiProxy', async () => {
      const controller = new AbortController()
      const aiProxy = {
        call: vi.fn().mockResolvedValueOnce(makeAiResponse('功能设计内容')),
      }

      const result = await generateAgentHandler(
        {
          mode: 'skeleton-batch-single',
          sectionIndex: 0,
          section: {
            title: '功能设计',
            level: 3,
            dimensions: ['functional'],
            guidanceHint: '聚焦核心功能',
          },
          previousSections: [],
          requirements: '支持高并发系统',
        },
        { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
      )

      expect(result).toMatchObject({ kind: 'result' })
      if (result.kind !== 'result') return
      expect(result.value.content).toBe('功能设计内容')
      expect(aiProxy.call).toHaveBeenCalledTimes(1)
      expect(aiProxy.call.mock.calls[0][0].caller).toBe('generate-agent:batch-single:0')
    })

    it('injects previousSections into prompt', async () => {
      const controller = new AbortController()
      const aiProxy = {
        call: vi.fn().mockResolvedValueOnce(makeAiResponse('接口设计内容')),
      }

      await generateAgentHandler(
        {
          mode: 'skeleton-batch-single',
          sectionIndex: 1,
          section: {
            title: '接口设计',
            level: 3,
            dimensions: ['interface'],
          },
          previousSections: [{ title: '功能设计', markdown: '功能设计详细内容，包括用户管理模块' }],
          requirements: '支持高并发系统',
        },
        { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
      )

      const userMessage = aiProxy.call.mock.calls[0][0].messages.find(
        (m: { role: string }) => m.role === 'user'
      )
      expect(userMessage.content).toContain('功能设计详细内容，包括用户管理模块')
    })

    it('auto-continues when truncated', async () => {
      const controller = new AbortController()
      const aiProxy = {
        call: vi
          .fn()
          .mockResolvedValueOnce(makeAiResponse('第一部分', { finishReason: 'length' }))
          .mockResolvedValueOnce(makeAiResponse('第二部分')),
      }

      const result = await generateAgentHandler(
        {
          mode: 'skeleton-batch-single',
          sectionIndex: 0,
          section: { title: '功能设计', level: 3, dimensions: ['functional'] },
          previousSections: [],
          requirements: 'test',
        },
        { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
      )

      expect(result).toMatchObject({ kind: 'result' })
      if (result.kind !== 'result') return
      expect(result.value.content).toBe('第一部分\n\n第二部分')
      expect(aiProxy.call).toHaveBeenCalledTimes(2)
    })

    it('throws BidWiseError when aiProxy is not provided', async () => {
      const controller = new AbortController()

      await expect(
        generateAgentHandler(
          {
            mode: 'skeleton-batch-single',
            sectionIndex: 0,
            section: { title: '功能设计', level: 3, dimensions: ['functional'] },
            previousSections: [],
            requirements: 'test',
          },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      ).rejects.toThrow('AI proxy required for skeleton-batch-single')
    })
  })

  it('auto-continues truncated sub-chapter and joins with \\n\\n', async () => {
    const controller = new AbortController()

    const confirmedSkeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])

    const aiProxy = {
      call: vi
        .fn()
        // section 0: normal
        .mockResolvedValueOnce(makeAiResponse('功能设计内容'))
        // section 1: truncated first call
        .mockResolvedValueOnce(makeAiResponse('接口设计第一部分', { finishReason: 'length' }))
        // section 1: continuation succeeds
        .mockResolvedValueOnce(makeAiResponse('接口设计第二部分'))
        // section 2: normal
        .mockResolvedValueOnce(makeAiResponse('安全设计内容')),
    }

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-batch',
        confirmedSkeleton,
        requirements: '支持高并发系统',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    // Total calls: section 0 (1) + section 1 (2, with continuation) + section 2 (1) = 4
    expect(aiProxy.call).toHaveBeenCalledTimes(4)

    // Verify continuation caller name
    expect(aiProxy.call.mock.calls[2][0].caller).toBe('generate-agent:batch:1:cont-1')

    expect(result).toMatchObject({ kind: 'result' })
    if (result.kind !== 'result') return

    const { content } = result.value
    expect(content).toContain('接口设计第一部分\n\n接口设计第二部分')
  })
})
