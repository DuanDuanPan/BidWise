import { describe, it, expect } from 'vitest'
import {
  generateChapterPrompt,
  GENERATE_CHAPTER_SYSTEM_PROMPT,
} from '@main/prompts/generate-chapter.prompt'
import type { GenerateChapterContext } from '@main/prompts/generate-chapter.prompt'

describe('@story-3-4 generateChapterPrompt', () => {
  const baseContext: GenerateChapterContext = {
    chapterTitle: '系统架构设计',
    chapterLevel: 2,
    requirements: '- [技术/高] 系统支持高并发\n- [技术/中] 数据加密传输',
  }

  it('@p0 should include chapter title and level', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).toContain('系统架构设计')
    expect(prompt).toContain('2级标题')
  })

  it('@p0 should include requirements section', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).toContain('招标需求')
    expect(prompt).toContain('系统支持高并发')
    expect(prompt).toContain('数据加密传输')
  })

  it('@p0 should include output format instructions', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).toContain('H3/H4')
    expect(prompt).toContain('Markdown')
    expect(prompt).toContain('不要包含章节主标题')
  })

  it('@p0 should default to Chinese language', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).toContain('中文')
  })

  it('@p1 should include guidance text when provided', () => {
    const prompt = generateChapterPrompt({ ...baseContext, guidanceText: '重点描述微服务架构' })
    expect(prompt).toContain('编写指导')
    expect(prompt).toContain('重点描述微服务架构')
  })

  it('@p1 should not include guidance section when guidanceText is absent', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).not.toContain('编写指导')
  })

  it('@p1 should include scoring weights when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      scoringWeights: '- 技术方案 (30分, 权重0.3): 架构, 安全',
    })
    expect(prompt).toContain('评分标准与权重')
    expect(prompt).toContain('技术方案 (30分')
  })

  it('@p1 should include mandatory items when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      mandatoryItems: '- 必须提供等保三级证明\n- 投标人须具有 CMMI 3 级',
    })
    expect(prompt).toContain('必响应条款')
    expect(prompt).toContain('等保三级证明')
  })

  it('@p1 should include adjacent chapter summaries when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      adjacentChaptersBefore: '**项目概述**: 本项目旨在...',
      adjacentChaptersAfter: '**实施计划**: 第一阶段...',
    })
    expect(prompt).toContain('前序章节摘要')
    expect(prompt).toContain('项目概述')
    expect(prompt).toContain('后续章节摘要')
    expect(prompt).toContain('实施计划')
  })

  it('@p1 should include strategy seed when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      strategySeed: '差异化竞争策略：强调自主可控',
    })
    expect(prompt).toContain('投标策略参考')
    expect(prompt).toContain('差异化竞争策略')
  })

  it('@p1 should include writing style section when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      writingStyle: '文风：军工文风\n语气要求：严谨、精确\n禁用词：非常、大概',
    })
    expect(prompt).toContain('写作风格要求')
    expect(prompt).toContain('军工文风')
    expect(prompt).toContain('严谨、精确')
    expect(prompt).toContain('禁用词')
  })

  it('@p1 should not include writing style section when absent', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).not.toContain('## 写作风格要求')
  })

  it('@p1 should place writing style after mandatory items and before adjacent chapters', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      mandatoryItems: '必响应项',
      writingStyle: '文风约束文本',
      adjacentChaptersBefore: '前序摘要',
    })
    const mandatoryIdx = prompt.indexOf('必响应条款')
    const styleIdx = prompt.indexOf('写作风格要求')
    const adjacentIdx = prompt.indexOf('前序章节摘要')
    expect(mandatoryIdx).toBeLessThan(styleIdx)
    expect(styleIdx).toBeLessThan(adjacentIdx)
  })

  it('@p1 should include additional context for regeneration', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      additionalContext: '重点突出我方在智慧城市领域的经验',
    })
    expect(prompt).toContain('补充说明')
    expect(prompt).toContain('智慧城市领域')
  })

  it('@p1 should not include optional section headers when absent', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).not.toContain('## 评分标准与权重')
    expect(prompt).not.toContain('## 必响应条款')
    expect(prompt).not.toContain('## 写作风格要求')
    expect(prompt).not.toContain('## 前序章节摘要')
    expect(prompt).not.toContain('## 后续章节摘要')
    expect(prompt).not.toContain('## 投标策略参考')
    expect(prompt).not.toContain('## 补充说明')
  })

  it('@p1 should return well-structured multi-section prompt', () => {
    const fullContext: GenerateChapterContext = {
      ...baseContext,
      guidanceText: '指导文本',
      scoringWeights: '评分权重',
      mandatoryItems: '必响应项',
      writingStyle: '文风约束',
      adjacentChaptersBefore: '前序摘要',
      adjacentChaptersAfter: '后续摘要',
      strategySeed: '策略种子',
      additionalContext: '补充上下文',
    }
    const prompt = generateChapterPrompt(fullContext)
    const sections = prompt.split('\n\n').filter((s) => s.startsWith('## '))
    expect(sections.length).toBeGreaterThanOrEqual(9)
  })

  it('@p0 should define a professional system prompt', () => {
    expect(GENERATE_CHAPTER_SYSTEM_PROMPT).toContain('专业技术方案撰写助手')
    expect(GENERATE_CHAPTER_SYSTEM_PROMPT).toContain('Markdown')
  })
})
