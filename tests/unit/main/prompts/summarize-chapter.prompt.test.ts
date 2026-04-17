import { describe, it, expect } from 'vitest'
import {
  summarizeChapterPrompt,
  SUMMARIZE_CHAPTER_SYSTEM_PROMPT,
} from '@main/prompts/summarize-chapter.prompt'

describe('@story-3-12 summarizeChapterPrompt', () => {
  it('@p0 renders chapter title, level, and direct body verbatim', () => {
    const prompt = summarizeChapterPrompt({
      chapterTitle: '系统架构',
      chapterLevel: 2,
      directBody: '本章承诺 99.9% SLA，工期 180 天。',
    })
    expect(prompt).toContain('系统架构')
    expect(prompt).toContain('2 级标题')
    expect(prompt).toContain('99.9% SLA')
  })

  it('@p0 demands strict JSON output without code fences', () => {
    const prompt = summarizeChapterPrompt({
      chapterTitle: 't',
      chapterLevel: 3,
      directBody: 'body',
    })
    expect(prompt).toContain('key_commitments')
    expect(prompt).toContain('numbers')
    expect(prompt).toContain('terms')
    expect(prompt).toContain('tone')
    expect(prompt).toMatch(/不加代码围栏/)
  })

  it('@p1 falls back to placeholder when direct body is empty', () => {
    const prompt = summarizeChapterPrompt({
      chapterTitle: 't',
      chapterLevel: 2,
      directBody: '',
    })
    expect(prompt).toContain('（本章直属正文为空）')
  })

  it('@p1 system prompt enforces structured JSON role', () => {
    expect(SUMMARIZE_CHAPTER_SYSTEM_PROMPT).toContain('JSON')
  })
})
