import { describe, it, expect, vi } from 'vitest'
import { parseAgentHandler } from '@main/services/agent-orchestrator/agents/parse-agent'

describe('parseAgentHandler @story-2-2', () => {
  it('@p1 should return AiRequestParams with messages from parseRfpPrompt', async () => {
    const controller = new AbortController()
    const result = await parseAgentHandler(
      { rfpContent: '招标文件内容测试' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.messages[1].content).toContain('招标文件内容测试')
    expect(result.maxTokens).toBe(4096)
  })

  it('@p1 should not include caller field (orchestrator sets it)', async () => {
    const controller = new AbortController()
    const result = await parseAgentHandler(
      { rfpContent: 'test' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result).not.toHaveProperty('caller')
  })

  it('@p1 should use parseRfpPrompt to generate user message', async () => {
    const controller = new AbortController()
    const result = await parseAgentHandler(
      { rfpContent: '特定内容' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    // Prompt should contain the rfp content
    expect(result.messages[1].content).toContain('特定内容')
    // Prompt should have structure (from template)
    expect(result.messages[1].content).toContain('招标文件')
  })

  it('@p1 should throw AbortError when cancelled before prompt generation', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      parseAgentHandler(
        { rfpContent: 'cancelled' },
        { signal: controller.signal, updateProgress: vi.fn() }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
