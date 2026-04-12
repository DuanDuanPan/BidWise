import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockAttackChecklistPrompt = vi.fn().mockReturnValue('mocked attack checklist prompt')
const mockThrowIfAborted = vi.fn()

vi.mock('@main/prompts/attack-checklist.prompt', () => ({
  attackChecklistPrompt: (...args: unknown[]) => mockAttackChecklistPrompt(...args),
  ATTACK_CHECKLIST_SYSTEM_PROMPT: '你是一位资深投标评审战略分析师',
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: (...args: unknown[]) => mockThrowIfAborted(...args),
}))

import { attackChecklistAgentHandler } from '@main/services/agent-orchestrator/agents/attack-checklist-agent'

describe('attackChecklistAgentHandler @story-7-5', () => {
  const mockContext = {
    requirements: '1. 系统支持国密算法',
    scoringCriteria: '- 技术方案（50分）',
    mandatoryItems: '- 项目经理需在中标后3日到岗',
    strategySeed: '- 数据安全: 强调加密能力',
    proposalType: '技术标',
    industry: '金融',
  }

  const mockOptions = {
    signal: new AbortController().signal,
    updateProgress: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds prompt from context and returns system/user messages', async () => {
    const result = await attackChecklistAgentHandler(mockContext, mockOptions)

    expect(mockAttackChecklistPrompt).toHaveBeenCalledWith({
      requirements: mockContext.requirements,
      scoringCriteria: mockContext.scoringCriteria,
      mandatoryItems: mockContext.mandatoryItems,
      strategySeed: mockContext.strategySeed,
      proposalType: mockContext.proposalType,
      industry: mockContext.industry,
    })
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('投标评审战略分析师')
    expect(result.messages[1]).toEqual({
      role: 'user',
      content: 'mocked attack checklist prompt',
    })
  })

  it('uses expected generation parameters', async () => {
    const result = await attackChecklistAgentHandler(mockContext, mockOptions)

    expect(result.maxTokens).toBe(4096)
    expect(result.temperature).toBe(0.7)
  })

  it('calls throwIfAborted and updateProgress with correct messages', async () => {
    await attackChecklistAgentHandler(mockContext, mockOptions)

    expect(mockThrowIfAborted).toHaveBeenCalledTimes(2)
    expect(mockOptions.updateProgress).toHaveBeenCalledWith(10, '正在分析项目攻击面...')
    expect(mockOptions.updateProgress).toHaveBeenCalledWith(30, '正在生成攻击清单...')
  })
})
