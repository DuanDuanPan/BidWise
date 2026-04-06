import { describe, it, expect, vi } from 'vitest'
import { attributeSourcesAgentHandler } from '@main/services/agent-orchestrator/agents/attribute-sources-agent'
import { createContentDigest } from '@shared/chapter-markdown'

describe('@story-3-5 attributeSourcesAgentHandler', () => {
  const mockSignal = new AbortController().signal
  const mockUpdateProgress = vi.fn()

  const context = {
    chapterTitle: '\u7cfb\u7edf\u67b6\u6784',
    paragraphs: [
      {
        paragraphIndex: 0,
        text: '\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784',
        digest: createContentDigest('\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784'),
      },
    ],
  }

  it('@p0 should return AiRequestParams with system and user messages', async () => {
    const result = await attributeSourcesAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.maxTokens).toBe(4096)
  })

  it('@p0 should call updateProgress with correct stages', async () => {
    await attributeSourcesAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(mockUpdateProgress).toHaveBeenCalledWith(0, 'parsing-paragraphs')
    expect(mockUpdateProgress).toHaveBeenCalledWith(50, 'analyzing-sources')
  })

  it('@p0 should include paragraph content in user message', async () => {
    const result = await attributeSourcesAgentHandler(context, {
      signal: mockSignal,
      updateProgress: mockUpdateProgress,
    })

    expect(result.messages[1].content).toContain(
      '\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784'
    )
    expect(result.messages[1].content).toContain('\u7cfb\u7edf\u67b6\u6784')
  })
})
