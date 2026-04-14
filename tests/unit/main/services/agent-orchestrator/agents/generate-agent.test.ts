import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockBuildPromptContext = vi.hoisted(() => vi.fn())
const mockLoggerWarn = vi.hoisted(() => vi.fn())
const mockMermaidParse = vi.hoisted(() => vi.fn().mockResolvedValue(true))

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

vi.mock('mermaid', () => ({
  default: {
    parse: (...args: unknown[]) => mockMermaidParse(...args),
  },
}))

const { generateAgentHandler } =
  await import('@main/services/agent-orchestrator/agents/generate-agent')

function unwrapParams(result: Awaited<ReturnType<typeof generateAgentHandler>>): {
  messages: Array<{ role: string; content: string }>
  maxTokens?: number
} {
  if ('kind' in result) {
    expect(result.kind).toBe('params')
    return result.value
  }
  return result
}

describe('generateAgentHandler @story-2-2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveEntries.mockResolvedValue([])
    mockBuildPromptContext.mockReturnValue('')
    mockMermaidParse.mockReset().mockResolvedValue(true)
  })

  it('@p1 should return AiRequestParams with messages from generateChapterPrompt', async () => {
    const controller = new AbortController()
    const result = unwrapParams(
      await generateAgentHandler(
        { chapterTitle: '技术方案', requirements: '支持高并发' },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    )

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.messages[1].content).toContain('技术方案')
    expect(result.messages[1].content).toContain('支持高并发')
    expect(result.maxTokens).toBe(8192)
  })

  it('@p1 should return wrapped params without caller field', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      { chapterTitle: '技术方案', requirements: '支持高并发' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result).toMatchObject({ kind: 'params' })
    expect(unwrapParams(result)).not.toHaveProperty('caller')
  })

  it('@p1 should throw AbortError when cancelled before prompt generation', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      generateAgentHandler(
        { chapterTitle: 'test', requirements: 'test' },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('@story-3-4 @p1 should report fallback progress stages: analyzing → generating-text', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()

    await generateAgentHandler(
      {
        chapterTitle: '系统架构',
        requirements: '支持高并发',
        guidanceText: '请设计微服务架构',
        scoringWeights: '技术方案 30分',
        mandatoryItems: '等保三级',
        adjacentChaptersBefore: '项目概述',
        adjacentChaptersAfter: '实施计划',
        strategySeed: '差异化策略',
        additionalContext: '重点突出安全性',
      },
      { signal: controller.signal, updateProgress }
    )

    expect(updateProgress).toHaveBeenCalledWith(0, 'analyzing')
    expect(updateProgress).toHaveBeenCalledWith(10, 'generating-text')
  })

  it('@story-3-4 @p1 should inject all context fields into prompt', async () => {
    const controller = new AbortController()
    const result = unwrapParams(
      await generateAgentHandler(
        {
          chapterTitle: '安全方案',
          chapterLevel: 3,
          requirements: '数据加密',
          guidanceText: '指导文本',
          additionalContext: '补充上下文',
        },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    )

    const userMsg = result.messages[1].content
    expect(userMsg).toContain('安全方案')
    expect(userMsg).toContain('3级标题')
    expect(userMsg).toContain('数据加密')
    expect(userMsg).toContain('指导文本')
    expect(userMsg).toContain('补充上下文')
  })

  it('@story-3-4 @p1 should execute multi-phase flow when aiProxy is provided', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:总体流程:' +
              Buffer.from('展示系统主要处理流程').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller.startsWith('generate-agent:diagram')) {
          return {
            content: 'graph TD\nA[输入] --> B[处理]',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
          }
        }

        return {
          content:
            '{"pass":true,"issues":[{"type":"minor-risk","description":"建议补充边界条件","suggestion":"增加异常流说明"}],"checked_items":["组件覆盖"]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '系统架构设计',
        requirements: '支持高并发',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    expect(aiProxy.call.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(updateProgress).toHaveBeenCalledWith(10, 'generating-text')
    expect(updateProgress).toHaveBeenCalledWith(20, 'validating-text')
    expect(updateProgress).toHaveBeenCalledWith(35, 'generating-diagrams')
    expect(updateProgress).toHaveBeenCalledWith(60, 'validating-diagrams')
    expect(updateProgress).toHaveBeenCalledWith(80, 'composing', expect.any(Object))
    expect(updateProgress).toHaveBeenCalledWith(90, 'validating-coherence')
  })

  it('@p0 should call a dedicated diagram repair prompt with invalid code and validation error', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    mockMermaidParse
      .mockRejectedValueOnce(new Error('Parse error at line 2'))
      .mockResolvedValueOnce(true)

    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:系统集成架构图:' +
              Buffer.from('展示系统集成关系').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller === 'generate-agent:diagram:mermaid') {
          return {
            content: 'graph TD\ntitle 系统集成架构图\nA-->B',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller === 'generate-agent:diagram-repair:mermaid') {
          return {
            content: 'graph TD\nA[系统集成平台] --> B[业务系统]',
            usage: { promptTokens: 6, completionTokens: 9 },
            latencyMs: 55,
            model: 'mock',
            provider: 'mock',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '总体架构设计',
        requirements: '描述系统集成关系',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    const repairCall = aiProxy.call.mock.calls.find(
      ([request]: [{ caller: string }]) =>
        request.caller === 'generate-agent:diagram-repair:mermaid'
    )?.[0]

    expect(repairCall).toBeDefined()
    expect(repairCall.messages[1].content).toContain('Parse error at line 2')
    expect(repairCall.messages[1].content).toContain('graph TD\ntitle 系统集成架构图\nA-->B')

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('```mermaid')
      expect(result.value.content).toContain('A[系统集成平台] --> B[业务系统]')
      expect(result.value.content).not.toContain('[图表生成失败]')
    }
  })

  it('@p0 should keep a visible failure marker when diagram generation exhausts retries', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    mockMermaidParse.mockRejectedValue(new Error('Parse error at line 2'))

    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:系统集成架构图:' +
              Buffer.from('展示系统集成关系').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller.startsWith('generate-agent:diagram')) {
          return {
            content: 'graph TD\ntitle 系统集成架构图\nA-->B',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '总体架构设计',
        requirements: '描述系统集成关系',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain(
        '[图表生成失败] 系统集成架构图（mermaid）: Parse error at line 2'
      )
      expect(result.value.content).not.toContain('图表生成中')
      expect(result.value.content).not.toContain('%%DIAGRAM:')
    }
  })

  it('@story-3-4 @p1 should replace wrapped diagram placeholders instead of leaking raw markers', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const wrappedDesc = Buffer.from('展示自动生成模块与外部系统集成关系').toString('base64')
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content: `正文段落\n\n%%DIAGRAM:mermaid:自动生成模块集成架构图:base64(${wrappedDesc})%%`,
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller.startsWith('generate-agent:diagram')) {
          return {
            content: 'graph TD\nA[自动生成模块] --> B[外部系统]',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '自动生成模块架构设计',
        requirements: '支持与外部系统集成',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).not.toContain('%%DIAGRAM:')
      expect(result.value.content).toContain('<!-- mermaid:')
      expect(result.value.content).toContain('```mermaid')
    }
  })

  it('@story-3-4 @p1 should stay on single-pass flow when diagrams are disabled', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn(),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '项目概述',
        requirements: '支持高并发',
        enableDiagrams: false,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'params' })
    expect(aiProxy.call).not.toHaveBeenCalled()
    expect(updateProgress).toHaveBeenCalledWith(0, 'analyzing')
    expect(updateProgress).toHaveBeenCalledWith(10, 'generating-text')
    expect(updateProgress).not.toHaveBeenCalledWith(20, 'validating-text')
  })

  it('@story-3-4 @p1 should warn when coherence validation returns pass=false', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:总体流程:' +
              Buffer.from('展示系统主要处理流程').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
          }
        }

        if (request.caller.startsWith('generate-agent:diagram')) {
          return {
            content: 'graph TD\nA[输入] --> B[处理]',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
          }
        }

        return {
          content: '{"pass":false,"issues":[{"type":"consistency","description":"图文不一致"}]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
        }
      }),
    }

    await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '系统架构设计',
        requirements: '支持高并发',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(mockLoggerWarn).toHaveBeenCalledWith('Coherence validation flagged issues', {
      issues: [{ type: 'consistency', description: '图文不一致' }],
    })
  })

  it('@story-3-4 @p1 should include system prompt as Professional Proposal Writing Assistant', async () => {
    const controller = new AbortController()
    const result = unwrapParams(
      await generateAgentHandler(
        { chapterTitle: 'test', requirements: 'test' },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    )

    expect(result.messages[0].content).toContain('专业技术方案撰写助手')
  })

  describe('@story-5-3 terminology context injection', () => {
    it('should inject terminologyContext into prompt when active entries exist', async () => {
      const entries = [
        {
          id: 'e1',
          sourceTerm: '设备管理',
          targetTerm: '装备全寿命周期管理',
          normalizedSourceTerm: '设备管理',
          category: null,
          description: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
      mockGetActiveEntries.mockResolvedValue(entries)
      mockBuildPromptContext.mockReturnValue(
        '【行业术语规范】请在生成内容时优先使用以下标准术语：\n- "设备管理" → "装备全寿命周期管理"'
      )

      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          { chapterTitle: '技术方案', requirements: '支持高并发' },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      expect(mockGetActiveEntries).toHaveBeenCalled()
      expect(mockBuildPromptContext).toHaveBeenCalledWith(entries)
      expect(result.messages[1].content).toContain('行业术语规范')
      expect(result.messages[1].content).toContain('装备全寿命周期管理')
    })

    it('should not inject terminology section when no active entries', async () => {
      mockGetActiveEntries.mockResolvedValue([])
      mockBuildPromptContext.mockReturnValue('')

      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          { chapterTitle: '技术方案', requirements: '支持高并发' },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      expect(result.messages[1].content).not.toContain('行业术语规范')
    })
  })

  describe('ask-system mode', () => {
    it('@story-4-3 @p1 should return ask-system prompt when mode is ask-system', async () => {
      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          {
            mode: 'ask-system',
            chapterTitle: '系统架构',
            chapterLevel: 2,
            sectionContent: '本章介绍系统整体架构',
            userQuestion: '这个架构支持水平扩展吗？',
          },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('system')
      expect(result.messages[1].role).toBe('user')
      expect(result.messages[1].content).toContain('系统架构')
      expect(result.messages[1].content).toContain('本章介绍系统整体架构')
    })

    it('@story-4-3 @p1 should use ASK_SYSTEM_SYSTEM_PROMPT as system message', async () => {
      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          {
            mode: 'ask-system',
            chapterTitle: '技术方案',
            chapterLevel: 2,
            sectionContent: '内容',
            userQuestion: '问题',
          },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      expect(result.messages[0].content).toContain('BidWise 标智的方案顾问 AI')
    })

    it('@story-4-3 @p1 should use maxTokens 2048', async () => {
      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          {
            mode: 'ask-system',
            chapterTitle: '技术方案',
            chapterLevel: 2,
            sectionContent: '内容',
            userQuestion: '问题',
          },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      expect(result.maxTokens).toBe(2048)
    })

    it('@story-4-3 @p1 should call updateProgress with analyzing and generating-text', async () => {
      const controller = new AbortController()
      const updateProgress = vi.fn()

      await generateAgentHandler(
        {
          mode: 'ask-system',
          chapterTitle: '技术方案',
          chapterLevel: 2,
          sectionContent: '内容',
          userQuestion: '问题',
        },
        { signal: controller.signal, updateProgress }
      )

      expect(updateProgress).toHaveBeenCalledWith(0, 'analyzing')
      expect(updateProgress).toHaveBeenCalledWith(50, 'generating-text')
    })

    it('@story-4-3 @p1 should include userQuestion in prompt', async () => {
      const controller = new AbortController()
      const result = unwrapParams(
        await generateAgentHandler(
          {
            mode: 'ask-system',
            chapterTitle: '安全方案',
            chapterLevel: 3,
            sectionContent: '数据加密与访问控制',
            userQuestion: '是否满足等保三级要求？',
          },
          { signal: controller.signal, updateProgress: vi.fn() }
        )
      )

      const userMsg = result.messages[1].content
      expect(userMsg).toContain('是否满足等保三级要求？')
    })
  })
})
