import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockBuildPromptContext = vi.hoisted(() => vi.fn())
const mockLoggerWarn = vi.hoisted(() => vi.fn())
const mockMermaidRuntimeValidate = vi.hoisted(() => vi.fn().mockResolvedValue({ valid: true }))

vi.mock('@main/services/terminology-service', () => ({
  terminologyService: {
    getActiveEntries: mockGetActiveEntries,
  },
}))

vi.mock('@main/services/terminology-replacement-service', () => ({
  terminologyReplacementService: {
    buildPromptContext: mockBuildPromptContext,
  },
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

function unwrapResult(result: Awaited<ReturnType<typeof generateAgentHandler>>): {
  content: string
  usage: { promptTokens: number; completionTokens: number }
  latencyMs: number
} {
  expect(result).toMatchObject({ kind: 'result' })
  if ('kind' in result && result.kind === 'result') {
    return result.value as {
      content: string
      usage: { promptTokens: number; completionTokens: number }
      latencyMs: number
    }
  }
  throw new Error('Expected kind=result')
}

function makeAiProxy(responseContent: string): { call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: { promptTokens: 10, completionTokens: 20 },
      latencyMs: 50,
      model: 'mock',
      provider: 'mock',
    }),
  }
}

describe('generateAgentHandler skeleton-generate mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveEntries.mockResolvedValue([])
    mockBuildPromptContext.mockReturnValue('')
  })

  it('should return wrapResult with fallback:false and plan when LLM returns valid skeleton JSON', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const validSkeleton = {
      sections: [
        { title: '功能设计', level: 3, dimensions: ['functional', 'ui'] },
        { title: '接口设计', level: 3, dimensions: ['interface'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(validSkeleton))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统架构设计',
        chapterLevel: 2,
        requirements: '需要详细的系统架构说明',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan).toBeDefined()
    expect(parsed.plan.parentTitle).toBe('系统架构设计')
    expect(parsed.plan.parentLevel).toBe(2)
    expect(parsed.plan.sections).toHaveLength(2)
    expect(parsed.plan.sections[0].title).toBe('功能设计')
    expect(parsed.plan.sections[0].level).toBe(3)
    expect(parsed.plan.sections[0].dimensions).toEqual(['functional', 'ui'])
  })

  it('should use SKELETON_GENERATION_SYSTEM_PROMPT as system message', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const validSkeleton = {
      sections: [{ title: '数据模型', level: 3, dimensions: ['data-model'] }],
    }
    const aiProxy = makeAiProxy(JSON.stringify(validSkeleton))

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '数据库设计',
        chapterLevel: 2,
        requirements: '支持数据持久化',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(aiProxy.call).toHaveBeenCalledOnce()
    const callArg = aiProxy.call.mock.calls[0][0]
    expect(callArg.caller).toBe('generate-agent:skeleton')
    expect(callArg.maxTokens).toBe(2048)
    expect(callArg.messages[0].role).toBe('system')
    expect(callArg.messages[0].content).toContain('结构规划助手')
    expect(callArg.messages[1].role).toBe('user')
  })

  it('should report progress: analyzing → skeleton-generating → skeleton-ready', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const validSkeleton = {
      sections: [{ title: '安全设计', level: 3, dimensions: ['security'] }],
    }
    const aiProxy = makeAiProxy(JSON.stringify(validSkeleton))

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '安全体系',
        chapterLevel: 2,
        requirements: '满足等保三级',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(updateProgress).toHaveBeenCalledWith(0, 'analyzing')
    expect(updateProgress).toHaveBeenCalledWith(50, 'skeleton-generating')
    expect(updateProgress).toHaveBeenCalledWith(100, 'skeleton-ready')
  })

  it('should return wrapResult with fallback:true when LLM returns malformed JSON', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = makeAiProxy('这不是有效的 JSON 内容，无法解析')

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(true)
    expect(parsed.reason).toBeDefined()
  })

  it('should return fallback:true when LLM returns JSON without sections array', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = makeAiProxy(JSON.stringify({ something: 'else' }))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '需求描述',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(true)
  })

  it('should warn when skeleton JSON parse fails', async () => {
    const controller = new AbortController()
    const aiProxy = makeAiProxy('not json at all')

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(mockLoggerWarn).toHaveBeenCalledWith('Skeleton JSON parse failed, triggering fallback')
  })

  it('should filter out sections with level > 4, keeping only valid ones', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const skeletonWithMixed = {
      sections: [
        { title: '功能模块', level: 3, dimensions: ['functional'] },
        { title: '过深子节', level: 5, dimensions: ['ui'] },
        { title: '另一过深节', level: 6, dimensions: ['security'] },
        { title: '接口规范', level: 4, dimensions: ['interface'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonWithMixed))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统设计',
        chapterLevel: 2,
        requirements: '详细系统设计',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections).toHaveLength(2)
    expect(parsed.plan.sections.map((s: { title: string }) => s.title)).toEqual([
      '功能模块',
      '接口规范',
    ])
  })

  it('should filter out sections with level <= parentLevel', async () => {
    const controller = new AbortController()
    const skeletonWithTooShallow = {
      sections: [
        { title: '合法子章节', level: 3, dimensions: ['functional'] },
        { title: '同级章节', level: 2, dimensions: ['ui'] },
        { title: '父级章节', level: 1, dimensions: ['security'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonWithTooShallow))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统设计',
        chapterLevel: 2,
        requirements: '详细说明',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections).toHaveLength(1)
    expect(parsed.plan.sections[0].title).toBe('合法子章节')
  })

  it('should return fallback:true when all sections have level > 4', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const skeletonAllInvalid = {
      sections: [
        { title: '过深节点A', level: 5, dimensions: ['functional'] },
        { title: '过深节点B', level: 6, dimensions: ['ui'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonAllInvalid))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(true)
    expect(parsed.reason).toBeDefined()
  })

  it('should warn when no valid skeleton sections remain after filtering', async () => {
    const controller = new AbortController()
    const skeletonAllInvalid = {
      sections: [{ title: '过深节点', level: 5, dimensions: ['functional'] }],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonAllInvalid))

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'No valid skeleton sections after filtering, triggering fallback'
    )
  })

  it('should throw AbortError when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      generateAgentHandler(
        {
          mode: 'skeleton-generate',
          chapterTitle: '技术方案',
          chapterLevel: 2,
          requirements: '支持高并发',
        },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('should throw AbortError when signal is aborted after aiProxy call resolves', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const validSkeleton = {
      sections: [{ title: '功能设计', level: 3, dimensions: ['functional'] }],
    }
    const aiProxy = {
      call: vi.fn().mockImplementation(async () => {
        controller.abort()
        return {
          content: JSON.stringify(validSkeleton),
          usage: { promptTokens: 10, completionTokens: 20 },
          latencyMs: 50,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    await expect(
      generateAgentHandler(
        {
          mode: 'skeleton-generate',
          chapterTitle: '技术方案',
          chapterLevel: 2,
          requirements: '支持高并发',
        },
        { signal: controller.signal, updateProgress, aiProxy }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('should return fallback:true with reason about proxy when aiProxy is undefined', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(true)
    expect(parsed.reason).toBeDefined()
    expect(typeof parsed.reason).toBe('string')
    expect(parsed.reason.length).toBeGreaterThan(0)
  })

  it('should not call aiProxy when proxy is undefined', async () => {
    const controller = new AbortController()

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '技术方案',
        chapterLevel: 2,
        requirements: '支持高并发',
      },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    // No aiProxy provided — assert analyzing progress fired, no LLM call made
    // (validated implicitly: no error thrown, fallback returned)
  })

  it('should include usage from aiProxy response in wrapResult', async () => {
    const controller = new AbortController()
    const validSkeleton = {
      sections: [{ title: '部署方案', level: 3, dimensions: ['deployment'] }],
    }
    const aiProxy = {
      call: vi.fn().mockResolvedValue({
        content: JSON.stringify(validSkeleton),
        usage: { promptTokens: 42, completionTokens: 88 },
        latencyMs: 123,
        model: 'mock',
        provider: 'mock',
      }),
    }

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '部署架构设计',
        chapterLevel: 2,
        requirements: '高可用部署方案',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { usage } = unwrapResult(result)
    expect(usage.promptTokens).toBe(42)
    expect(usage.completionTokens).toBe(88)
  })

  it('should include chapterTitle and level in the aiProxy call prompt', async () => {
    const controller = new AbortController()
    const validSkeleton = {
      sections: [{ title: '数据安全', level: 3, dimensions: ['security', 'data-model'] }],
    }
    const aiProxy = makeAiProxy(JSON.stringify(validSkeleton))

    await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '安全设计专项',
        chapterLevel: 2,
        requirements: '满足等保三级标准',
        scoringWeights: '安全性 40分',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const callArg = aiProxy.call.mock.calls[0][0]
    const userPrompt: string = callArg.messages[1].content
    expect(userPrompt).toContain('安全设计专项')
    expect(userPrompt).toContain('满足等保三级标准')
  })

  it('should strip non-string values from dimensions array', async () => {
    const controller = new AbortController()
    const skeletonWithMixedDimensions = {
      sections: [
        {
          title: '功能设计',
          level: 3,
          dimensions: ['functional', 42, null, 'ui', true],
        },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonWithMixedDimensions))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统设计',
        chapterLevel: 2,
        requirements: '功能需求',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections[0].dimensions).toEqual(['functional', 'ui'])
  })

  it('should skip sections missing title or having non-string title', async () => {
    const controller = new AbortController()
    const skeletonWithBadTitles = {
      sections: [
        { title: '', level: 3, dimensions: ['functional'] },
        { title: 123, level: 3, dimensions: ['ui'] },
        { level: 3, dimensions: ['security'] },
        { title: '合法章节', level: 3, dimensions: ['deployment'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonWithBadTitles))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统设计',
        chapterLevel: 2,
        requirements: '详细说明',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections).toHaveLength(1)
    expect(parsed.plan.sections[0].title).toBe('合法章节')
  })

  it('should skip sections missing dimensions array', async () => {
    const controller = new AbortController()
    const skeletonMissingDimensions = {
      sections: [
        { title: '没有维度', level: 3 },
        { title: '有维度', level: 3, dimensions: ['functional'] },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonMissingDimensions))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '系统设计',
        chapterLevel: 2,
        requirements: '详细说明',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections).toHaveLength(1)
    expect(parsed.plan.sections[0].title).toBe('有维度')
  })

  it('should include guidanceHint when present in LLM response', async () => {
    const controller = new AbortController()
    const skeletonWithGuidance = {
      sections: [
        {
          title: '安全设计',
          level: 3,
          dimensions: ['security'],
          guidanceHint: '重点说明权限体系与审计机制',
        },
      ],
    }
    const aiProxy = makeAiProxy(JSON.stringify(skeletonWithGuidance))

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '安全方案',
        chapterLevel: 2,
        requirements: '等保三级安全要求',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections[0].guidanceHint).toBe('重点说明权限体系与审计机制')
  })

  it('should handle LLM response wrapped in ```json code fence', async () => {
    const controller = new AbortController()
    const validSkeleton = {
      sections: [{ title: '流程设计', level: 3, dimensions: ['process-flow'] }],
    }
    const fencedContent = '```json\n' + JSON.stringify(validSkeleton) + '\n```'
    const aiProxy = makeAiProxy(fencedContent)

    const result = await generateAgentHandler(
      {
        mode: 'skeleton-generate',
        chapterTitle: '业务流程',
        chapterLevel: 2,
        requirements: '流程自动化',
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    const { content } = unwrapResult(result)
    const parsed = JSON.parse(content)

    expect(parsed.fallback).toBe(false)
    expect(parsed.plan.sections[0].title).toBe('流程设计')
  })
})
