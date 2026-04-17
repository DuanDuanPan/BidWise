import { describe, it, expect } from 'vitest'
import {
  generateChapterPrompt,
  isComplianceMatrixChapter,
  GENERATE_CHAPTER_SYSTEM_PROMPT,
  generateSkeletonPrompt,
  generateSubChapterPrompt,
  shouldSuggestDiagrams,
} from '@main/prompts/generate-chapter.prompt'
import type {
  GenerateChapterContext,
  SkeletonPromptContext,
  SubChapterPromptContext,
} from '@main/prompts/generate-chapter.prompt'

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

describe('generateSkeletonPrompt', () => {
  const baseSkeletonContext: SkeletonPromptContext = {
    chapterTitle: '系统功能设计',
    chapterLevel: 2,
    requirements: '- [技术/高] 支持多租户\n- [技术/中] 提供 RESTful API',
    dimensionChecklist: '设计维度检查清单（根据实际需求选择性应用）',
  }

  it('@p0 should include chapter title and dimension checklist in output', () => {
    const prompt = generateSkeletonPrompt(baseSkeletonContext)
    expect(prompt).toContain('系统功能设计')
    expect(prompt).toContain('2级标题')
    expect(prompt).toContain('设计维度检查清单')
  })

  it('@p0 should include JSON output instructions', () => {
    const prompt = generateSkeletonPrompt(baseSkeletonContext)
    expect(prompt).toContain('输出严格 JSON')
    expect(prompt).toContain('"sections"')
    expect(prompt).toContain('"title"')
    expect(prompt).toContain('"level"')
    expect(prompt).toContain('"dimensions"')
    expect(prompt).toContain('"guidanceHint"')
  })

  it('@p1 should include scoring weights when provided', () => {
    const prompt = generateSkeletonPrompt({
      ...baseSkeletonContext,
      scoringWeights: '- 功能完备性 (40分, 权重0.4)',
    })
    expect(prompt).toContain('评分标准与权重')
    expect(prompt).toContain('功能完备性 (40分')
  })

  it('@p1 should not include scoring section when absent', () => {
    const prompt = generateSkeletonPrompt(baseSkeletonContext)
    expect(prompt).not.toContain('## 评分标准与权重')
  })

  it('@p1 should include document outline when provided', () => {
    const prompt = generateSkeletonPrompt({
      ...baseSkeletonContext,
      documentOutline: '  - 项目概述\n  - 系统功能设计 ← 当前章节\n  - 实施计划',
    })
    expect(prompt).toContain('文档完整大纲')
    expect(prompt).toContain('项目概述')
    expect(prompt).toContain('实施计划')
  })

  it('@p1 should not include outline section when absent', () => {
    const prompt = generateSkeletonPrompt(baseSkeletonContext)
    expect(prompt).not.toContain('## 文档完整大纲')
  })
})

describe('generateSubChapterPrompt', () => {
  const baseSubContext: SubChapterPromptContext = {
    chapterTitle: '用户管理模块 - 功能设计',
    chapterLevel: 3,
    requirements: '- [技术/高] 支持 RBAC 权限控制',
    dimensionFocus: 'functional, ui',
  }

  it('@p0 should include dimensionFocus in output', () => {
    const prompt = generateSubChapterPrompt(baseSubContext)
    expect(prompt).toContain('设计维度聚焦')
    expect(prompt).toContain('functional, ui')
  })

  it('@p0 should include previousSectionsSummary when provided', () => {
    const prompt = generateSubChapterPrompt({
      ...baseSubContext,
      previousSectionsSummary: '**登录模块**: 实现了用户名密码及 SSO 登录',
    })
    expect(prompt).toContain('已生成的同级子章节摘要')
    expect(prompt).toContain('登录模块')
  })

  it('@p1 should omit previousSectionsSummary block when not provided (first section)', () => {
    const prompt = generateSubChapterPrompt(baseSubContext)
    expect(prompt).not.toContain('已生成的同级子章节摘要')
  })

  it('@p0 should wrap the base generateChapterPrompt output', () => {
    const prompt = generateSubChapterPrompt(baseSubContext)
    // Base prompt sections should appear
    expect(prompt).toContain('用户管理模块 - 功能设计')
    expect(prompt).toContain('RBAC 权限控制')
    // Sub-chapter-specific section should appear after base content
    const baseIdx = prompt.indexOf('招标需求')
    const focusIdx = prompt.indexOf('设计维度聚焦')
    expect(baseIdx).toBeGreaterThanOrEqual(0)
    expect(focusIdx).toBeGreaterThan(baseIdx)
  })

  it('@p0 should include sibling boundary instructions when sibling sections are provided', () => {
    const prompt = generateSubChapterPrompt({
      ...baseSubContext,
      siblingSectionTitles: ['用户管理模块 - 功能设计', '认证模块 - 接口设计', '权限模型设计'],
    })

    expect(prompt).toContain('同级子章节边界')
    expect(prompt).toContain('认证模块 - 接口设计')
    expect(prompt).toContain('权限模型设计')
    expect(prompt).toContain('只覆盖「用户管理模块 - 功能设计」')
    expect(prompt).toContain('不要输出 3 级标题')
  })
})

describe('shouldSuggestDiagrams', () => {
  it('@p0 should enable diagrams for summary sub-chapters when guidance mentions structure relations', () => {
    expect(
      shouldSuggestDiagrams('核心功能模块总览', {
        guidanceText: '概述30个工业APP的分类体系及与系统其他模块的关系',
        dimensions: ['functional'],
      })
    ).toBe(true)
  })

  it('@p1 should keep narrative-only overview chapters text-first when guidance is plain narrative', () => {
    expect(
      shouldSuggestDiagrams('项目概述', {
        guidanceText: '概述项目建设背景与总体目标',
        dimensions: ['functional'],
      })
    ).toBe(false)
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

  it('@p1 should require plain-text single-line diagram placeholders for diagram-heavy chapters', () => {
    const prompt = generateChapterPrompt({
      chapterTitle: '系统架构设计',
      chapterLevel: 2,
      requirements: '- [technical/high] 支持高并发',
    })

    expect(prompt).toContain('%%DIAGRAM:skill:图表标题:图表描述%%')
    expect(prompt).toContain('禁止使用 base64、URL 编码')
    expect(prompt).toContain('整个占位符必须写在同一行内')
    expect(prompt).not.toContain('%%DIAGRAM:drawio')
    expect(prompt).toContain('类型标识必须固定写 skill')
    expect(prompt).toContain('后续系统会根据语义自动选择合适的图表风格和类型')
  })

  it('@p1 @story-3-10 should use skill as default diagram type in placeholder format', () => {
    const prompt = generateChapterPrompt({
      chapterTitle: '系统架构设计',
      chapterLevel: 2,
      requirements: '- [technical/high] 支持高并发',
    })

    expect(prompt).toContain('%%DIAGRAM:skill:')
    expect(prompt).not.toContain('%%DIAGRAM:mermaid:')
    expect(prompt).toContain('类型标识必须固定写 skill')
    expect(prompt).toContain('图表描述必须具体说明图表包含哪些组件、分组、关系和关键连线约束')
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

describe('@story-3-12 generatedChaptersContext four-group rendering', () => {
  const baseContext: GenerateChapterContext = {
    chapterTitle: '系统架构',
    chapterLevel: 2,
    requirements: '- req a',
  }

  it('@p0 renders ancestors / siblings / descendants / others when all groups populated', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      generatedChaptersContext: {
        ancestors: [
          {
            headingKey: '1:Proposal:0',
            headingTitle: 'Proposal',
            headingLevel: 1,
            occurrenceIndex: 0,
            distance: 1,
            source: 'cache',
            summary: '{"key_commitments":["提供总包"]}',
          },
        ],
        siblings: [
          {
            headingKey: '2:部署方案:0',
            headingTitle: '部署方案',
            headingLevel: 2,
            occurrenceIndex: 0,
            distance: 2,
            source: 'cache',
            summary: '{"numbers":[{"label":"工期","value":"180天"}]}',
          },
        ],
        descendants: [
          {
            headingKey: '3:总体设计:0',
            headingTitle: '总体设计',
            headingLevel: 3,
            occurrenceIndex: 0,
            distance: 1,
            source: 'fallback',
            summary: '子章节直属正文截断内容…',
          },
        ],
        others: [
          {
            headingKey: '2:项目概述:0',
            headingTitle: '项目概述',
            headingLevel: 2,
            occurrenceIndex: 0,
            distance: 3,
            source: 'cache',
            summary: '项目背景摘要',
          },
        ],
      },
    })

    expect(prompt).toContain('父级章节摘要（当前章节是其细化）')
    expect(prompt).toContain('已生成同级章节摘要（术语 / 数字 / 承诺对齐）')
    expect(prompt).toContain('已生成子章节摘要（供上位概括）')
    expect(prompt).toContain('其他已生成章节摘要（仅供全局一致性参考）')
    expect(prompt).toContain('Proposal')
    expect(prompt).toContain('部署方案')
    expect(prompt).toContain('总体设计')
    expect(prompt).toContain('项目概述')
    // Global context takes over from adjacent legacy fields entirely.
    expect(prompt).not.toContain('前序章节摘要（避免重复）')
    expect(prompt).not.toContain('后续章节摘要（避免前置）')
  })

  it('@p0 omits empty groups while keeping the populated ones', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      generatedChaptersContext: {
        ancestors: [],
        siblings: [
          {
            headingKey: '2:部署方案:0',
            headingTitle: '部署方案',
            headingLevel: 2,
            occurrenceIndex: 0,
            distance: 2,
            source: 'cache',
            summary: 'sib',
          },
        ],
        descendants: [],
        others: [],
      },
    })
    expect(prompt).toContain('已生成同级章节摘要')
    expect(prompt).not.toContain('父级章节摘要')
    expect(prompt).not.toContain('已生成子章节摘要')
    expect(prompt).not.toContain('其他已生成章节摘要')
  })

  it('@p0 falls back to legacy adjacent fields when global context is empty', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      generatedChaptersContext: {
        ancestors: [],
        siblings: [],
        descendants: [],
        others: [],
      },
      adjacentChaptersBefore: '**项目概述**: 本项目旨在...',
      adjacentChaptersAfter: '**实施计划**: 第一阶段...',
    })
    expect(prompt).toContain('前序章节摘要（避免重复）')
    expect(prompt).toContain('后续章节摘要（避免前置）')
    expect(prompt).not.toContain('父级章节摘要')
    expect(prompt).not.toContain('已生成同级章节摘要')
  })

  it('@p1 continues to use adjacent fields when generatedChaptersContext is undefined', () => {
    const prompt = generateChapterPrompt({
      ...baseContext,
      adjacentChaptersBefore: '**A**: body',
    })
    expect(prompt).toContain('前序章节摘要')
  })

  it('@p1 sub-chapter prompt inherits four-group context from base context', () => {
    const subPrompt = generateSubChapterPrompt({
      ...baseContext,
      dimensionFocus: 'functional',
      generatedChaptersContext: {
        ancestors: [
          {
            headingKey: '1:Proposal:0',
            headingTitle: 'Proposal',
            headingLevel: 1,
            occurrenceIndex: 0,
            distance: 1,
            source: 'cache',
            summary: '承诺',
          },
        ],
        siblings: [],
        descendants: [],
        others: [],
      },
    })
    expect(subPrompt).toContain('父级章节摘要（当前章节是其细化）')
    expect(subPrompt).toContain('Proposal')
  })
})
