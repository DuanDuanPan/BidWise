/**
 * Prompt for adversarial review execution — single role attacks proposal (Story 7.3)
 */

import type { AdversarialIntensity } from '@shared/adversarial-types'

export interface AdversarialReviewPromptContext {
  roleName: string
  rolePerspective: string
  attackFocus: string[]
  intensity: AdversarialIntensity
  roleDescription: string
  proposalContent: string
  scoringCriteria?: string
  mandatoryItems?: string
}

const INTENSITY_CONFIG: Record<AdversarialIntensity, { temperature: number; instruction: string }> =
  {
    high: {
      temperature: 0.8,
      instruction:
        '你的审查强度为【高】：请以最严格、最挑剔的标准审查方案，不放过任何潜在问题，大胆提出批评和质疑。发现数量不限。',
    },
    medium: {
      temperature: 0.6,
      instruction:
        '你的审查强度为【中】：请平衡地审查方案，关注重要问题和明显薄弱环节，同时考虑方案的合理性。',
    },
    low: {
      temperature: 0.4,
      instruction: '你的审查强度为【低】：请仅关注关键性问题和明显的硬伤，忽略次要问题。',
    },
  }

export function buildAdversarialReviewPrompt(context: AdversarialReviewPromptContext): {
  prompt: string
  temperature: number
  maxTokens: number
} {
  const intensityConfig = INTENSITY_CONFIG[context.intensity]
  const sections: string[] = []

  sections.push(`## 你的角色

你是「${context.roleName}」。${context.roleDescription}

**审查视角：** ${context.rolePerspective}

**攻击焦点：**
${context.attackFocus.map((f) => `- ${f}`).join('\n')}

${intensityConfig.instruction}`)

  sections.push(`## 任务

请从你的角色视角出发，对以下投标方案进行攻击性审查。找出方案中的薄弱点、遗漏、逻辑漏洞和可改进之处。`)

  sections.push(`## 投标方案内容

${context.proposalContent}`)

  if (context.scoringCriteria) {
    sections.push(`## 评分标准（参考）

${context.scoringCriteria}`)
  }

  if (context.mandatoryItems) {
    sections.push(`## 必响应项（参考）

${context.mandatoryItems}`)
  }

  sections.push(`## 输出格式

请严格输出 JSON 数组，不要添加任何额外文字说明。每条攻击发现包含以下字段：

\`\`\`json
[
  {
    "severity": "critical | major | minor",
    "sectionRef": "所涉章节标题或编号（如无法确定写 null）",
    "content": "攻击发现的具体内容描述",
    "suggestion": "改进建议（可选，写 null 表示无建议）",
    "reasoning": "攻击理由和分析逻辑（可选，写 null 表示无需解释）"
  }
]
\`\`\`

**字段说明：**
- \`severity\`: 严重程度 — \`critical\`=致命缺陷/可能导致废标, \`major\`=重要问题/影响得分, \`minor\`=次要问题/建议改进
- \`sectionRef\`: 发现问题所在的章节引用
- \`content\`: 具体问题描述，需清晰指出问题所在
- \`suggestion\`: 具体可操作的改进建议
- \`reasoning\`: 为什么这是一个问题，分析逻辑

如果方案在你的审查范围内没有发现问题，请返回空数组 \`[]\`。`)

  return {
    prompt: sections.join('\n\n'),
    temperature: intensityConfig.temperature,
    maxTokens: 4096,
  }
}
