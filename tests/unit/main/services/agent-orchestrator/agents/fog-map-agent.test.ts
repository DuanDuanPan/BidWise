import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockClassifyCertaintyPrompt = vi.fn().mockReturnValue('mocked prompt')
const mockThrowIfAborted = vi.fn()

vi.mock('@main/prompts/classify-certainty.prompt', () => ({
  classifyCertaintyPrompt: (...args: unknown[]) => mockClassifyCertaintyPrompt(...args),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: (...args: unknown[]) => mockThrowIfAborted(...args),
}))

import { fogMapAgentHandler } from '@main/services/agent-orchestrator/agents/fog-map-agent'

describe('fogMapAgentHandler', () => {
  const mockContext = {
    requirements: [{ description: '系统需支持国密算法', sourcePages: [2] }],
    scoringModel: {
      criteria: [{ category: '技术方案', maxScore: 50, weight: 0.5 }],
    },
    mandatoryItems: [{ content: '项目经理需在中标后 3 日内到岗' }],
    tenderSections: [{ title: '技术要求', content: '详见附件一' }],
  }

  const mockOptions = {
    signal: new AbortController().signal,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AiRequestParams with system and user messages', async () => {
    const result = await fogMapAgentHandler(mockContext, mockOptions)

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1]).toEqual({
      role: 'user',
      content: 'mocked prompt',
    })
  })

  it('system message contains 资深招标分析师 and JSON', async () => {
    const result = await fogMapAgentHandler(mockContext, mockOptions)

    expect(result.messages[0].content).toContain('资深招标分析师')
    expect(result.messages[0].content).toContain('JSON')
  })

  it('uses temperature 0.3', async () => {
    const result = await fogMapAgentHandler(mockContext, mockOptions)

    expect(result.temperature).toBe(0.3)
  })

  it('uses maxTokens 8192', async () => {
    const result = await fogMapAgentHandler(mockContext, mockOptions)

    expect(result.maxTokens).toBe(8192)
  })

  it('calls throwIfAborted twice (before and after prompt construction)', async () => {
    await fogMapAgentHandler(mockContext, mockOptions)

    expect(mockThrowIfAborted).toHaveBeenCalledTimes(2)
  })
})
