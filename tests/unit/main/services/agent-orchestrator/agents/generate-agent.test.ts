import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetActiveEntries = vi.hoisted(() => vi.fn())
const mockBuildPromptContext = vi.hoisted(() => vi.fn())
const mockLoggerWarn = vi.hoisted(() => vi.fn())
const mockMermaidRuntimeValidate = vi.hoisted(() => vi.fn().mockResolvedValue({ valid: true }))
const mockSaveDrawioAsset = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ assetPath: '/tmp/diagram.drawio' })
)

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
  drawioAssetService: {
    saveDrawioAsset: (...args: unknown[]) => mockSaveDrawioAsset(...args),
  },
}))

const mockGenerateSkillDiagram = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    kind: 'success',
    markdown:
      '<!-- ai-diagram:mock-id:ai-diagram-mock.svg:caption:prompt:flat-icon:architecture -->\n![mock](assets/ai-diagram-mock.svg)',
    assetFileName: 'ai-diagram-mock.svg',
    repairAttempts: 0,
  })
)

vi.mock('@main/services/skill-diagram-generation-service', () => ({
  generateSkillDiagram: (...args: unknown[]) => mockGenerateSkillDiagram(...args),
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
    mockMermaidRuntimeValidate.mockReset().mockResolvedValue({ valid: true })
    mockSaveDrawioAsset.mockReset().mockResolvedValue({ assetPath: '/tmp/diagram.drawio' })
    mockGenerateSkillDiagram.mockReset().mockResolvedValue({
      kind: 'success',
      markdown:
        '<!-- ai-diagram:mock-id:ai-diagram-mock.svg:caption:prompt:flat-icon:architecture -->\n![mock](assets/ai-diagram-mock.svg)',
      assetFileName: 'ai-diagram-mock.svg',
      repairAttempts: 0,
    })
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
    expect(result.maxTokens).toBe(16384)
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
            finishReason: 'stop',
          }
        }

        if (request.caller.startsWith('generate-agent:diagram')) {
          return {
            content: 'graph TD\nA[输入] --> B[处理]',
            usage: { promptTokens: 5, completionTokens: 8 },
            latencyMs: 50,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content:
            '{"pass":true,"issues":[{"type":"minor-risk","description":"建议补充边界条件","suggestion":"增加异常流说明"}],"checked_items":["组件覆盖"]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
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
    // text call + coherence call = 2 (diagram generation handled by skill mock)
    expect(aiProxy.call.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mockGenerateSkillDiagram).toHaveBeenCalledOnce()
    expect(updateProgress).toHaveBeenCalledWith(10, 'generating-text')
    expect(updateProgress).toHaveBeenCalledWith(20, 'validating-text')
    expect(updateProgress).toHaveBeenCalledWith(35, 'generating-diagrams')
    expect(updateProgress).toHaveBeenCalledWith(60, 'validating-diagrams')
    expect(updateProgress).toHaveBeenCalledWith(80, 'composing', expect.any(Object))
    expect(updateProgress).toHaveBeenCalledWith(90, 'validating-coherence')
  })

  it('@p0 @story-3-10 should route architecture placeholders to skill diagram service', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:系统总体架构图:' +
              Buffer.from('展示系统分层结构、核心模块与基础设施关系').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '总体架构设计',
        requirements: '描述系统总体分层架构和基础设施关系',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(mockGenerateSkillDiagram).toHaveBeenCalledOnce()
    expect(mockGenerateSkillDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          title: '系统总体架构图',
          style: 'flat-icon',
          diagramType: 'architecture',
        }),
        projectId: 'proj-1',
      })
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('<!-- ai-diagram:')
      expect(result.value.content).not.toContain('<!-- drawio:')
    }
  })

  it('@p0 @story-3-10 should delegate diagram repair to skill service and accept success result', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    mockGenerateSkillDiagram.mockResolvedValueOnce({
      kind: 'success',
      markdown: '<!-- ai-diagram:repaired -->\n![任务处理流程图](assets/ai-diagram-repaired.svg)',
      assetFileName: 'ai-diagram-repaired.svg',
      repairAttempts: 1,
    })

    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:任务处理流程图:' +
              Buffer.from('展示任务从提交到处理完成的主要步骤').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '任务流程设计',
        requirements: '描述任务处理的关键流程',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(mockGenerateSkillDiagram).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('<!-- ai-diagram:repaired -->')
      expect(result.value.content).not.toContain('[图表生成失败]')
    }
  })

  it('@p0 @story-3-10 should keep a visible failure marker when skill diagram generation exhausts retries', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    mockGenerateSkillDiagram.mockResolvedValueOnce({
      kind: 'failure',
      markdown: '> [图表生成失败] 任务处理流程图（skill）: SVG validation failed after 3 attempts',
      error: 'SVG validation failed after 3 attempts',
      repairAttempts: 3,
    })

    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content:
              '正文段落\n\n%%DIAGRAM:mermaid:任务处理流程图:' +
              Buffer.from('展示任务从提交到处理完成的主要步骤').toString('base64') +
              '%%',
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '任务流程设计',
        requirements: '描述任务处理的关键流程',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('[图表生成失败]')
      expect(result.value.content).not.toContain('图表生成中')
      expect(result.value.content).not.toContain('%%DIAGRAM:')
    }
  })

  it('@story-3-4 @p1 @story-3-10 should replace wrapped diagram placeholders via skill service', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const wrappedDesc = Buffer.from('展示自动生成模块与外部系统集成关系').toString('base64')
    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content: `正文段落\n\n%%DIAGRAM:mermaid:自动生成模块流程图:base64(${wrappedDesc})%%`,
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '自动生成模块流程设计',
        requirements: '支持任务流转与自动处理',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).not.toContain('%%DIAGRAM:')
      expect(result.value.content).toContain('<!-- ai-diagram:')
    }
  })

  it('@p0 @story-3-10 should convert ASCII diagram fences into skill diagram tasks', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const asciiDiagram = [
      '```',
      '数据模型四层架构',
      '┌─────────────────────────────┐',
      '│           系统数据层         │',
      '├─────────────────────────────┤',
      '│           基础数据层         │',
      '├─────────────────────────────┤',
      '│           模型数据层         │',
      '├─────────────────────────────┤',
      '│           应用数据层         │',
      '└─────────────────────────────┘',
      '```',
    ].join('\n')

    const aiProxy = {
      call: vi.fn().mockImplementation(async (request: { caller: string }) => {
        if (request.caller === 'generate-agent:text') {
          return {
            content: `### 数据模型设计\n\n${asciiDiagram}`,
            usage: { promptTokens: 10, completionTokens: 20 },
            latencyMs: 100,
            model: 'mock',
            provider: 'mock',
            finishReason: 'stop',
          }
        }

        return {
          content: '{"pass":true,"issues":[]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }
      }),
    }

    const result = await generateAgentHandler(
      {
        projectId: 'proj-1',
        chapterTitle: '数据架构设计',
        requirements: '描述数据模型、数据治理和存储方案',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    // ASCII diagram was converted to %%DIAGRAM:skill:...%% placeholder, then routed to skill service
    expect(mockGenerateSkillDiagram).toHaveBeenCalledOnce()

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('<!-- ai-diagram:')
      expect(result.value.content).not.toContain('┌─────────────────────────────┐')
    }
  })

  it('@p1 should preserve ordinary fenced code blocks as Markdown code blocks', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn().mockResolvedValue({
        content: ['### 数据接口示例', '', '```json', '{"app":"flow-control"}', '```'].join('\n'),
        usage: { promptTokens: 10, completionTokens: 20 },
        latencyMs: 100,
        model: 'mock',
        provider: 'mock',
        finishReason: 'stop',
      }),
    }

    const result = await generateAgentHandler(
      {
        chapterTitle: '数据架构设计',
        requirements: '描述数据模型、数据治理和存储方案',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress, aiProxy }
    )

    expect(aiProxy.call).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toContain('```json')
      expect(result.value.content).toContain('{"app":"flow-control"}')
      expect(result.value.content).not.toContain('<!-- mermaid:')
    }
  })

  it('@story-3-4 @p1 should return result via aiProxy when diagrams are disabled', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()
    const aiProxy = {
      call: vi.fn().mockResolvedValue({
        content: '项目概述正文内容',
        usage: { promptTokens: 10, completionTokens: 20 },
        latencyMs: 100,
        model: 'mock',
        provider: 'mock',
        finishReason: 'stop',
      }),
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

    expect(result).toMatchObject({ kind: 'result' })
    expect(aiProxy.call).toHaveBeenCalledTimes(1)
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toBe('项目概述正文内容')
    }
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
            finishReason: 'stop',
          }
        }

        // coherence check
        return {
          content: '{"pass":false,"issues":[{"type":"consistency","description":"图文不一致"}]}',
          usage: { promptTokens: 3, completionTokens: 5 },
          latencyMs: 30,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
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

  it('should return wrapParams when aiProxy is not provided (path A fallback)', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      {
        chapterTitle: '技术方案',
        requirements: '支持高并发',
        enableDiagrams: true,
      },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result).toMatchObject({ kind: 'params' })
    const params = unwrapParams(result)
    expect(params.maxTokens).toBe(16384)
  })

  it('should auto-continue when finishReason is length', async () => {
    const controller = new AbortController()
    const aiProxy = {
      call: vi
        .fn()
        .mockResolvedValueOnce({
          content: '第一部分内容',
          usage: { promptTokens: 10, completionTokens: 20 },
          latencyMs: 100,
          model: 'mock',
          provider: 'mock',
          finishReason: 'length',
        })
        .mockResolvedValueOnce({
          content: '第二部分内容（续写完成）',
          usage: { promptTokens: 30, completionTokens: 25 },
          latencyMs: 120,
          model: 'mock',
          provider: 'mock',
          finishReason: 'stop',
        }),
    }

    const result = await generateAgentHandler(
      {
        chapterTitle: '技术方案',
        requirements: '支持高并发',
        enableDiagrams: false,
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    expect(aiProxy.call).toHaveBeenCalledTimes(2)
    if ('kind' in result && result.kind === 'result') {
      expect(result.value.content).toBe('第一部分内容\n\n第二部分内容（续写完成）')
      expect(result.value.usage.promptTokens).toBe(40)
      expect(result.value.usage.completionTokens).toBe(45)
    }
  })

  it('should stop continuation after MAX_CONTINUATIONS attempts', async () => {
    const controller = new AbortController()
    const aiProxy = {
      call: vi.fn().mockResolvedValue({
        content: '内容片段',
        usage: { promptTokens: 10, completionTokens: 20 },
        latencyMs: 100,
        model: 'mock',
        provider: 'mock',
        finishReason: 'length',
      }),
    }

    const result = await generateAgentHandler(
      {
        chapterTitle: '技术方案',
        requirements: '支持高并发',
        enableDiagrams: false,
      },
      { signal: controller.signal, updateProgress: vi.fn(), aiProxy }
    )

    expect(result).toMatchObject({ kind: 'result' })
    // MAX_CONTINUATIONS = 3, so total calls = 4 (1 initial + 3 continuations)
    expect(aiProxy.call).toHaveBeenCalledTimes(4)
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
