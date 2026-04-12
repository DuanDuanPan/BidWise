import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: vi.fn(),
}))

vi.mock('@main/prompts/adversarial-review.prompt', () => ({
  buildAdversarialReviewPrompt: vi.fn().mockReturnValue({
    prompt: 'test prompt',
    temperature: 0.6,
    maxTokens: 4096,
  }),
}))

import { adversarialReviewAgentHandler } from '@main/services/agent-orchestrator/agents/adversarial-review-agent'
import { buildAdversarialReviewPrompt } from '@main/prompts/adversarial-review.prompt'

describe('adversarialReviewAgentHandler', () => {
  const mockSignal = new AbortController().signal
  const mockUpdateProgress = vi.fn()

  const context = {
    roleName: '技术专家',
    rolePerspective: '从技术架构角度审查',
    attackFocus: ['高可用', '性能'],
    intensity: 'medium',
    roleDescription: '技术审查角色',
    proposalContent: '方案内容',
    scoringCriteria: '评分标准',
    mandatoryItems: '必响应项',
  }

  it('should return AiRequestParams with correct structure', async () => {
    const result = await adversarialReviewAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result).toHaveProperty('messages')
    expect(result).toHaveProperty('maxTokens')
    expect(result).toHaveProperty('temperature')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
  })

  it('should call buildAdversarialReviewPrompt with context', async () => {
    await adversarialReviewAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(buildAdversarialReviewPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        roleName: '技术专家',
        rolePerspective: '从技术架构角度审查',
        intensity: 'medium',
      })
    )
  })

  it('should use temperature and maxTokens from prompt builder', async () => {
    const result = await adversarialReviewAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result.temperature).toBe(0.6)
    expect(result.maxTokens).toBe(4096)
  })

  it('should report progress', async () => {
    await adversarialReviewAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(mockUpdateProgress).toHaveBeenCalledWith(10, expect.any(String))
  })
})
