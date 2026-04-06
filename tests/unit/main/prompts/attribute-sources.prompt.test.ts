import { describe, it, expect } from 'vitest'
import {
  attributeSourcesPrompt,
  ATTRIBUTE_SOURCES_SYSTEM_PROMPT,
} from '@main/prompts/attribute-sources.prompt'
import type { AttributeSourcesContext } from '@main/prompts/attribute-sources.prompt'
import { createContentDigest } from '@shared/chapter-markdown'

describe('@story-3-5 attributeSourcesPrompt', () => {
  const baseContext: AttributeSourcesContext = {
    chapterTitle: '\u7cfb\u7edf\u67b6\u6784\u8bbe\u8ba1',
    paragraphs: [
      {
        paragraphIndex: 0,
        text: '\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784',
        digest: createContentDigest('\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784'),
      },
      {
        paragraphIndex: 1,
        text: '- API \u7f51\u5173\u670d\u52a1',
        digest: createContentDigest('- API \u7f51\u5173\u670d\u52a1'),
      },
    ],
  }

  it('@p0 should include chapter title', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).toContain('\u7cfb\u7edf\u67b6\u6784\u8bbe\u8ba1')
  })

  it('@p0 should include all paragraphs with indices', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).toContain('[\u6bb5\u843d 0]')
    expect(prompt).toContain('[\u6bb5\u843d 1]')
    expect(prompt).toContain('\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784')
    expect(prompt).toContain('API \u7f51\u5173\u670d\u52a1')
  })

  it('@p0 should require no-source for uncertain attribution', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).toContain('no-source')
    expect(prompt).toContain('\u7981\u6b62\u7f16\u9020')
  })

  it('@p0 should require JSON output format', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).toContain('paragraphIndex')
    expect(prompt).toContain('sourceType')
    expect(prompt).toContain('confidence')
    expect(prompt).toContain('JSON')
  })

  it('@p1 should include asset hints when provided', () => {
    const prompt = attributeSourcesPrompt({
      ...baseContext,
      availableAssetHints: [
        '\u667a\u6167\u57ce\u5e02\u6848\u4f8b.md',
        '\u5b89\u5168\u65b9\u6848\u6a21\u677f.docx',
      ],
    })
    expect(prompt).toContain('\u8d44\u4ea7\u5e93\u7d20\u6750\u63d0\u793a')
    expect(prompt).toContain('\u667a\u6167\u57ce\u5e02\u6848\u4f8b.md')
  })

  it('@p1 should include knowledge hints when provided', () => {
    const prompt = attributeSourcesPrompt({
      ...baseContext,
      knowledgeHints: ['ISO 27001 \u5b89\u5168\u6807\u51c6'],
    })
    expect(prompt).toContain('\u77e5\u8bc6\u5e93\u63d0\u793a')
    expect(prompt).toContain('ISO 27001')
  })

  it('@p1 should not include optional sections when absent', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).not.toContain('\u8d44\u4ea7\u5e93\u7d20\u6750\u63d0\u793a')
    expect(prompt).not.toContain('\u77e5\u8bc6\u5e93\u63d0\u793a')
  })

  it('@p0 should define a professional system prompt', () => {
    expect(ATTRIBUTE_SOURCES_SYSTEM_PROMPT).toContain('\u6765\u6e90\u5206\u6790')
    expect(ATTRIBUTE_SOURCES_SYSTEM_PROMPT).toContain('JSON')
    expect(ATTRIBUTE_SOURCES_SYSTEM_PROMPT).toContain('no-source')
  })

  it('@p1 should list all valid source types', () => {
    const prompt = attributeSourcesPrompt(baseContext)
    expect(prompt).toContain('asset-library')
    expect(prompt).toContain('knowledge-base')
    expect(prompt).toContain('ai-inference')
    expect(prompt).toContain('no-source')
  })
})
