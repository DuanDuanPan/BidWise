import { describe, it, expect, vi } from 'vitest'
import { generateAgentHandler } from '@main/services/agent-orchestrator/agents/generate-agent'

describe('generateAgentHandler @story-2-2', () => {
  it('@p1 should return AiRequestParams with messages from generateChapterPrompt', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      { chapterTitle: '技术方案', requirements: '支持高并发' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.messages[1].content).toContain('技术方案')
    expect(result.messages[1].content).toContain('支持高并发')
    expect(result.maxTokens).toBe(8192)
  })

  it('@p1 should not include caller field (orchestrator sets it)', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      { chapterTitle: 'test', requirements: 'test' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result).not.toHaveProperty('caller')
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
})
