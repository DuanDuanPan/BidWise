import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockAdversarialRolePrompt = vi.fn().mockReturnValue('mocked adversarial prompt')
const mockThrowIfAborted = vi.fn()

vi.mock('@main/prompts/adversarial-role.prompt', () => ({
  adversarialRolePrompt: (...args: unknown[]) => mockAdversarialRolePrompt(...args),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: (...args: unknown[]) => mockThrowIfAborted(...args),
}))

import { adversarialAgentHandler } from '@main/services/agent-orchestrator/agents/adversarial-agent'

describe('adversarialAgentHandler @story-7-2', () => {
  const mockContext = {
    requirements: '1. 系统支持国密算法',
    scoringCriteria: '- 技术方案（50分）',
    strategySeeds: '- 数据安全: 强调加密能力',
    proposalType: '技术标',
    mandatoryItems: '- 项目经理需在中标后3日到岗',
  }

  const mockOptions = {
    signal: new AbortController().signal,
    updateProgress: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds prompt from context and returns system/user messages', async () => {
    const result = await adversarialAgentHandler(mockContext, mockOptions)

    expect(mockAdversarialRolePrompt).toHaveBeenCalledWith({
      requirements: mockContext.requirements,
      scoringCriteria: mockContext.scoringCriteria,
      strategySeeds: mockContext.strategySeeds,
      proposalType: mockContext.proposalType,
      mandatoryItems: mockContext.mandatoryItems,
    })
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('投标评审专家')
    expect(result.messages[1]).toEqual({
      role: 'user',
      content: 'mocked adversarial prompt',
    })
  })

  it('uses expected generation parameters', async () => {
    const result = await adversarialAgentHandler(mockContext, mockOptions)

    expect(result.maxTokens).toBe(4096)
    expect(result.temperature).toBe(0.7)
  })

  it('calls throwIfAborted and updateProgress', async () => {
    await adversarialAgentHandler(mockContext, mockOptions)

    expect(mockThrowIfAborted).toHaveBeenCalledTimes(2)
    expect(mockOptions.updateProgress).toHaveBeenCalledWith(10, '正在整理对抗角色提示词...')
  })
})
