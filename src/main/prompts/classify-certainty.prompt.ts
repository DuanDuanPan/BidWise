/**
 * Classify requirement certainty prompt template (Story 2.9)
 */

import type {
  RequirementItem,
  ScoringModel,
  MandatoryItem,
  TenderSection,
} from '@shared/analysis-types'

export interface ClassifyCertaintyPromptContext {
  requirements: RequirementItem[]
  scoringModel: ScoringModel | null
  mandatoryItems: MandatoryItem[] | null
  tenderSections: TenderSection[] | null
}

export function classifyCertaintyPrompt(context: ClassifyCertaintyPromptContext): string {
  const { requirements, scoringModel, mandatoryItems, tenderSections } = context

  const requirementsList = requirements
    .map(
      (r) =>
        `- [#${r.sequenceNumber}] id="${r.id}" | 分类=${r.category} | 优先级=${r.priority} | 来源页=${r.sourcePages.join(',')} | 描述：${r.description}`
    )
    .join('\n')

  let scoringContext = ''
  if (scoringModel && scoringModel.criteria.length > 0) {
    const highWeightCategories = scoringModel.criteria
      .filter((c) => c.weight >= 0.15 || c.maxScore >= 20)
      .map((c) => `${c.category}（${c.maxScore}分，权重${(c.weight * 100).toFixed(0)}%）`)
      .join('、')
    scoringContext = `\n## 评分模型参考（交叉引用）\n\n高权重评分类别：${highWeightCategories || '无高权重项'}\n总分：${scoringModel.totalScore}\n\n**规则**：高权重评分项中出现的模糊需求应标记为 risky 而非 ambiguous。\n`
  }

  let mandatoryContext = ''
  if (mandatoryItems && mandatoryItems.length > 0) {
    const mandatoryList = mandatoryItems
      .map((m) => `- ${m.content}（来源页：${m.sourcePages.join(',')}）`)
      .join('\n')
    mandatoryContext = `\n## 必响应项参考（交叉引用）\n\n${mandatoryList}\n\n**规则**：必响应项中涉及的模糊需求自动标记为 risky。\n`
  }

  let sectionContext = ''
  if (tenderSections && tenderSections.length > 0) {
    const sectionList = tenderSections
      .map((s) => `[页${s.pageStart}-${s.pageEnd}] ${s.title}`)
      .join('\n')
    sectionContext = `\n## 招标文件结构\n\n${sectionList}\n`
  }

  return `你是一位资深招标分析师，擅长识别招标文件中的模糊地带和风险区域。请对以下需求清单逐条进行确定性分级。

## 分级标准

### 绿色 — 明确（clear）
需求描述具体、可量化、有明确标准或规范引用、无歧义。

### 黄色 — 模糊（ambiguous）
用词笼统（如"良好的""适当的""先进的"）、无量化指标、缺少验收标准、可多种解读。

### 红色 — 风险（risky）
自相矛盾、超出常规能力范围、隐含陷阱条款、与其他需求冲突、极高标准但无评分权重。

## 输出要求

对每条需求输出：
- requirementId：需求的 id（原样返回）
- certaintyLevel：取值 "clear"、"ambiguous"、"risky"
- reason：分级原因。ambiguous / risky 必须 50-200 字；clear 可以简短说明
- suggestion：定向确认建议。ambiguous / risky 必须 50-200 字；clear 允许为空字符串或"无需补充确认"

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "requirementId": "req-uuid",
    "certaintyLevel": "clear",
    "reason": "需求描述具体，明确要求 99.9% 可用性和双活架构",
    "suggestion": "无需补充确认"
  },
  {
    "requirementId": "req-uuid-2",
    "certaintyLevel": "ambiguous",
    "reason": "'良好的可扩展性'用词笼统，未定义具体的扩展指标",
    "suggestion": "建议向客户确认：1) 预期的系统规模增长范围 2) 是否有具体的性能指标要求"
  }
]
\`\`\`
${scoringContext}${mandatoryContext}${sectionContext}
## 需求清单（共 ${requirements.length} 条）

${requirementsList}

请逐条分析以上所有 ${requirements.length} 条需求，不要遗漏任何一条。`
}
