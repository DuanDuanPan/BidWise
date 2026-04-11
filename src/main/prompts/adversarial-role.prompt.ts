/**
 * Prompt for generating adversarial review roles based on project context (Story 7.2)
 */

export interface AdversarialRolePromptContext {
  requirements: string
  scoringCriteria: string
  strategySeeds?: string
  proposalType?: string
  mandatoryItems?: string
}

export function adversarialRolePrompt(context: AdversarialRolePromptContext): string {
  const sections: string[] = []

  sections.push(`## 任务

请根据以下招标项目信息，生成 3-6 个差异化的对抗评审角色。每个角色代表一个独特的审查视角，用于多维度攻击和检验投标方案的薄弱环节。

## 角色设计要求

1. **差异化**：每个角色必须从不同维度出发，避免视角重叠
2. **针对性**：角色的攻击焦点必须基于该项目的实际需求和评分标准，而非泛泛而谈
3. **实用性**：只为确实存在的维度生成角色，不为不适用的维度硬凑
4. **必须覆盖**：合规/评标/竞对等核心视角必须有角色覆盖
5. **中文输出**：角色名称、描述、攻击焦点全部使用中文`)

  sections.push(`## 项目需求摘要

${context.requirements}`)

  sections.push(`## 评分标准

${context.scoringCriteria}`)

  if (context.mandatoryItems) {
    sections.push(`## 必响应项/强制要求

${context.mandatoryItems}`)
  }

  if (context.strategySeeds) {
    sections.push(`## 策略种子（参考）

${context.strategySeeds}`)
  }

  if (context.proposalType) {
    sections.push(`## 投标类型

${context.proposalType}`)
  }

  sections.push(`## 输出格式

请严格输出 JSON 数组，不要添加任何额外文字说明。每个角色对象包含以下字段：

\`\`\`json
[
  {
    "name": "角色名称（中文，2-6字）",
    "perspective": "该角色的审查视角描述（中文，一句话说明角色立场）",
    "attackFocus": ["攻击焦点1", "攻击焦点2", "攻击焦点3"],
    "intensity": "high | medium | low",
    "description": "角色简述（中文，说明该角色的价值和关注重点）",
    "isComplianceRole": false
  }
]
\`\`\`

**字段说明：**
- \`name\`: 角色名称，简短有力
- \`perspective\`: 该角色从什么立场审查方案
- \`attackFocus\`: 3-5 个具体攻击焦点，基于项目实际情况
- \`intensity\`: 攻击强度 — \`high\`=严格审查、\`medium\`=重点关注、\`low\`=辅助提醒
- \`description\`: 一句话说明该角色存在的意义
- \`isComplianceRole\`: 有且仅有一个角色设置为 \`true\`，代表合规审查角色`)

  return sections.join('\n\n')
}
