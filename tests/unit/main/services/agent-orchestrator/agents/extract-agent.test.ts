import { describe, it, expect, vi } from 'vitest'

vi.mock('@main/prompts/extract-requirements.prompt', () => ({
  extractRequirementsPrompt: vi.fn().mockReturnValue('mocked prompt'),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: vi.fn(),
}))

import { extractAgentHandler } from '@main/services/agent-orchestrator/agents/extract-agent'

describe('extractAgentHandler', () => {
  const mockContext = {
    sections: [{ id: 's1', title: '总则', content: '内容', pageStart: 1, pageEnd: 5 }],
    rawText: '招标文件内容',
    totalPages: 42,
    hasScannedContent: false,
  }

  const mockOptions = {
    signal: new AbortController().signal,
    updateProgress: vi.fn(),
  }

  it('should return AiRequestParams with system and user messages', async () => {
    const result = await extractAgentHandler(mockContext, mockOptions)

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('售前工程师')
    expect(result.messages[1].role).toBe('user')
    expect(result.messages[1].content).toBe('mocked prompt')
  })

  it('should set maxTokens to 8192', async () => {
    const result = await extractAgentHandler(mockContext, mockOptions)
    expect(result.maxTokens).toBe(8192)
  })

  it('should set temperature to 0.3', async () => {
    const result = await extractAgentHandler(mockContext, mockOptions)
    expect(result.temperature).toBe(0.3)
  })
})
