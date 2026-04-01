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

  it('@story-3-4 @p1 should report progress stages: analyzing → matching-assets → generating', async () => {
    const controller = new AbortController()
    const updateProgress = vi.fn()

    await generateAgentHandler(
      {
        chapterTitle: '系统架构',
        requirements: '支持高并发',
        guidanceText: '请设计微服务架构',
        scoringWeights: '技术方案 30分',
        mandatoryItems: '等保三级',
        adjacentChaptersBefore: '项目概述',
        adjacentChaptersAfter: '实施计划',
        strategySeed: '差异化策略',
        additionalContext: '重点突出安全性',
      },
      { signal: controller.signal, updateProgress }
    )

    expect(updateProgress).toHaveBeenCalledWith(0, 'analyzing')
    expect(updateProgress).toHaveBeenCalledWith(25, 'matching-assets')
    expect(updateProgress).toHaveBeenCalledWith(50, 'generating')
  })

  it('@story-3-4 @p1 should inject all context fields into prompt', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      {
        chapterTitle: '安全方案',
        chapterLevel: 3,
        requirements: '数据加密',
        guidanceText: '指导文本',
        additionalContext: '补充上下文',
      },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    const userMsg = result.messages[1].content
    expect(userMsg).toContain('安全方案')
    expect(userMsg).toContain('3级标题')
    expect(userMsg).toContain('数据加密')
    expect(userMsg).toContain('指导文本')
    expect(userMsg).toContain('补充上下文')
  })

  it('@story-3-4 @p1 should include system prompt as Professional Proposal Writing Assistant', async () => {
    const controller = new AbortController()
    const result = await generateAgentHandler(
      { chapterTitle: 'test', requirements: 'test' },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result.messages[0].content).toContain('专业技术方案撰写助手')
  })
})
