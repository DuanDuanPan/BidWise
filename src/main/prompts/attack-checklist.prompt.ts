/**
 * Prompt for generating pre-review attack checklist based on project context (Story 7.5)
 */

export interface AttackChecklistPromptContext {
  requirements: string
  scoringCriteria: string
  mandatoryItems?: string
  strategySeed?: string
  proposalType?: string
  industry?: string
}

export const ATTACK_CHECKLIST_SYSTEM_PROMPT = `你是一位资深投标评审战略分析师，拥有 20 年以上投标评审经验。你的目标是帮助投标团队在正式撰写方案前发现所有潜在的攻击面和薄弱环节，让撰写人员能够进行防御性写作。

请严格按照 JSON 数组格式输出结果，不要添加任何额外文字说明。`

export function attackChecklistPrompt(context: AttackChecklistPromptContext): string {
  const sections: string[] = []

  sections.push(`## 任务

请扮演以下多重角色审视该投标项目，逐一找出方案可能的薄弱点，并为每个薄弱点给出具体的攻击场景和防御建议：

1. **评标委员会成员** — 从打分标准出发，找出可能失分的地方
2. **竞争对手** — 从竞品优势角度，找出方案相对薄弱的地方
3. **最终用户/客户** — 从实际使用角度，找出方案可能无法满足的地方
4. **行业专家** — 从行业最佳实践角度，找出方案不够专业的地方

## 攻击分析要求

1. **具体化**：每个攻击场景必须具体到可操作的层面，而非抽象维度
2. **差异化**：8-15 条攻击之间不能重叠，每条必须覆盖不同的薄弱点
3. **防御导向**：每条攻击都必须附带可操作的防御建议，帮助撰写人员预防
4. **严重性分级**：根据对中标概率的影响程度标记 critical/major/minor
5. **章节定位**：如果能判断应在哪个章节进行防御，请指明目标章节
6. **覆盖维度**：确保覆盖以下维度（如适用）：
   - 技术方案可行性
   - 实施计划合理性
   - 成本控制与报价依据
   - 合规性与*项覆盖
   - 竞对优势对比
   - 团队能力与资质
   - 运维复杂度
   - 行业适配性`)

  sections.push(`## 项目需求摘要

${context.requirements}`)

  sections.push(`## 评分标准

${context.scoringCriteria}`)

  if (context.mandatoryItems) {
    sections.push(`## 必响应项/*项

${context.mandatoryItems}`)
  }

  if (context.strategySeed) {
    sections.push(`## 策略种子（参考）

${context.strategySeed}`)
  }

  if (context.proposalType) {
    sections.push(`## 投标类型

${context.proposalType}`)
  }

  if (context.industry) {
    sections.push(`## 行业

${context.industry}`)
  }

  sections.push(`## 输出格式

请严格输出 JSON 数组，每个条目包含以下字段：

\`\`\`json
[
  {
    "category": "攻击分类（如：合规性/技术方案/实施计划/成本/团队/运维/差异化）",
    "attackAngle": "具体的攻击场景描述（2-3句话，说明攻击角度和可能导致的后果）",
    "severity": "critical | major | minor",
    "defenseSuggestion": "具体的防御建议（说明如何在方案中预防这个攻击）",
    "targetSection": "建议在哪个章节进行防御（如：系统架构设计、项目实施计划、运维方案等，可选）"
  }
]
\`\`\`

**严重性标准：**
- \`critical\`: 可能直接导致废标或重大失分（如*项遗漏、资质不足）
- \`major\`: 可能导致明显失分或评委质疑（如论证不充分、对比缺失）
- \`minor\`: 可能导致小幅失分或印象减分（如表述不专业、细节遗漏）

请生成 8-15 条差异化攻击条目。`)

  return sections.join('\n\n')
}
