import { describe, it, expect } from 'vitest'
import {
  generateChapterPrompt,
  isComplianceMatrixChapter,
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
    expect(prompt).toContain('例如不要输出“## 系统架构设计”')
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

  it('@p1 @story-5-3 should include terminology context when provided', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      terminologyContext:
        '【行业术语规范】请在生成内容时优先使用以下标准术语：\n- "设备管理" → "装备全寿命周期管理"',
    })
    expect(prompt).toContain('行业术语规范')
    expect(prompt).toContain('装备全寿命周期管理')
  })

  it('@p1 @story-5-3 should not include terminology section when absent', () => {
    const prompt = generateChapterPrompt(baseContext)
    expect(prompt).not.toContain('## 行业术语规范')
  })

  it('@p1 @story-5-3 should place terminology before additional context', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      terminologyContext: '术语规范',
      additionalContext: '补充上下文',
    })
    const termIdx = prompt.indexOf('行业术语规范')
    const addIdx = prompt.indexOf('补充说明')
    expect(termIdx).toBeLessThan(addIdx)
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
    expect(prompt).not.toContain('## 行业术语规范')
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
      terminologyContext: '术语规范',
    }
    const prompt = generateChapterPrompt(fullContext)
    const sections = prompt.split('\n\n').filter((s) => s.startsWith('## '))
    expect(sections.length).toBeGreaterThanOrEqual(10)
  })

  it('@p0 should define a professional system prompt', () => {
    expect(GENERATE_CHAPTER_SYSTEM_PROMPT).toContain('专业技术方案撰写助手')
    expect(GENERATE_CHAPTER_SYSTEM_PROMPT).toContain('Markdown')
  })
})

describe('isComplianceMatrixChapter', () => {
  it.each([
    '需求响应对照表',
    '需求响应矩阵',
    '需求响应表',
    '符合性说明',
    '技术偏离表',
    '商务偏离表',
    'Compliance Matrix',
  ])('should detect "%s" as compliance matrix chapter', (title) => {
    expect(isComplianceMatrixChapter(title)).toBe(true)
  })

  it.each([
    '系统架构设计',
    '项目概述',
    '数据架构设计',
    '实施计划',
    '售后服务与技术支持',
    '技术响应表达能力',
    '符合性说明书编制',
  ])('should NOT detect "%s" as compliance matrix chapter', (title) => {
    expect(isComplianceMatrixChapter(title)).toBe(false)
  })
})

describe('generateChapterPrompt — compliance matrix specialization', () => {
  const matrixContext: GenerateChapterContext = {
    chapterTitle: '需求响应对照表',
    chapterLevel: 2,
    requirements: '- [technical/high] 支持高并发\n- [service/medium] 提供7×24服务',
    guidanceText: '逐条对照招标要求进行响应说明。',
    documentOutline: '  - 系统架构设计\n  - 需求响应对照表 ← 当前章节\n  - 实施计划',
  }

  it('@p0 should override guidanceText with index-table semantics', () => {
    const prompt = generateChapterPrompt(matrixContext)
    expect(prompt).toContain('需求响应对照索引表')
    expect(prompt).toContain('Markdown 表格形式')
    expect(prompt).not.toContain('逐条对照招标要求进行响应说明')
  })

  it('@p0 should include table column definitions in output rules', () => {
    const prompt = generateChapterPrompt(matrixContext)
    expect(prompt).toContain('序号')
    expect(prompt).toContain('招标需求条目')
    expect(prompt).toContain('响应说明')
    expect(prompt).toContain('详见章节')
  })

  it('@p0 should instruct not to expand detailed solutions', () => {
    const prompt = generateChapterPrompt(matrixContext)
    expect(prompt).toContain('不要展开详细')
  })

  it('@p0 should not contain narrative chapter output rules', () => {
    const prompt = generateChapterPrompt(matrixContext)
    // Narrative-specific rules should be absent
    expect(prompt).not.toContain('内容需覆盖招标需求中与本章节相关的要点')
    expect(prompt).not.toContain('严格限定在「需求响应对照表」的主题范围内撰写')
  })

  it('@p1 should preserve standard rules for non-matrix chapters', () => {
    const normalContext: GenerateChapterContext = {
      chapterTitle: '系统架构设计',
      chapterLevel: 2,
      requirements: '- [technical/high] 支持高并发',
      guidanceText: '描述系统逻辑架构和技术选型。',
    }
    const prompt = generateChapterPrompt(normalContext)
    expect(prompt).toContain('描述系统逻辑架构和技术选型')
    expect(prompt).toContain('内容需覆盖招标需求中与本章节相关的要点')
    expect(prompt).toContain('严格限定在「系统架构设计」的主题范围内撰写')
    expect(prompt).not.toContain('需求响应对照索引表')
  })

  it('@p1 should work with 需求响应矩阵 variant from standard-technical template', () => {
    const variantContext: GenerateChapterContext = {
      ...matrixContext,
      chapterTitle: '需求响应矩阵',
      guidanceText: '逐项响应招标文件中的需求条目。',
    }
    const prompt = generateChapterPrompt(variantContext)
    expect(prompt).toContain('需求响应对照索引表')
    expect(prompt).not.toContain('逐项响应招标文件中的需求条目')
  })
})
