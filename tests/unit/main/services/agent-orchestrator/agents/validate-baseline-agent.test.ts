import { describe, it, expect, vi } from 'vitest'
import { validateBaselineAgentHandler } from '@main/services/agent-orchestrator/agents/validate-baseline-agent'
import { createContentDigest } from '@shared/chapter-markdown'

describe('@story-3-5 validateBaselineAgentHandler', () => {
  const mockSignal = new AbortController().signal
  const mockUpdateProgress = vi.fn()

  const context = {
    chapterTitle: '\u4ea7\u54c1\u529f\u80fd',
    paragraphs: [
      {
        paragraphIndex: 0,
        text: '\u652f\u6301\u4e07\u7ea7\u5e76\u53d1',
        digest: createContentDigest('\u652f\u6301\u4e07\u7ea7\u5e76\u53d1'),
      },
    ],
    productBaseline: '## \u57fa\u7ebf\n- \u5e76\u53d1: \u5343\u7ea7',
  }

  it('@p0 should return AiRequestParams with system and user messages', async () => {
    const result = await validateBaselineAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.maxTokens).toBe(4096)
  })

  it('@p0 should call updateProgress with correct stages', async () => {
    await validateBaselineAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(mockUpdateProgress).toHaveBeenCalledWith(0, 'extracting-claims')
    expect(mockUpdateProgress).toHaveBeenCalledWith(50, 'comparing-baseline')
  })

  it('@p0 should include baseline and paragraph content', async () => {
    const result = await validateBaselineAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result.messages[1].content).toContain('\u652f\u6301\u4e07\u7ea7\u5e76\u53d1')
    expect(result.messages[1].content).toContain('\u57fa\u7ebf')
  })
})
