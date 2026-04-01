import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockGenerateSeedPrompt = vi.fn().mockReturnValue('mocked seed prompt')
const mockThrowIfAborted = vi.fn()

vi.mock('@main/prompts/generate-seed.prompt', () => ({
  generateSeedPrompt: (...args: unknown[]) => mockGenerateSeedPrompt(...args),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: (...args: unknown[]) => mockThrowIfAborted(...args),
}))

import { seedAgentHandler } from '@main/services/agent-orchestrator/agents/seed-agent'

describe('seedAgentHandler', () => {
  const mockContext = {
    sourceMaterial: '客户纪要：客户高度关注数据安全和性能稳定性。',
    existingRequirements: [{ description: '系统需支持国密算法', sourcePages: [2] }],
    scoringModel: {
      criteria: [{ category: '技术方案', maxScore: 50, weight: 0.5 }],
    },
    mandatoryItems: [{ content: '项目经理需在中标后 3 日内到岗' }],
  }

  const mockOptions = {
    signal: new AbortController().signal,
    updateProgress: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the prompt from the seed context and returns system/user messages', async () => {
    const result = await seedAgentHandler(mockContext, mockOptions)

    expect(mockGenerateSeedPrompt).toHaveBeenCalledWith(mockContext)
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('售前架构师')
    expect(result.messages[1]).toEqual({
      role: 'user',
      content: 'mocked seed prompt',
    })
  })

  it('uses the expected generation parameters', async () => {
    const result = await seedAgentHandler(mockContext, mockOptions)

    expect(result.maxTokens).toBe(8192)
    expect(result.temperature).toBe(0.5)
    expect(mockThrowIfAborted).toHaveBeenCalledTimes(2)
  })
})
