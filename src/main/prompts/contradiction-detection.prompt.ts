/**
 * Prompt for contradiction detection among adversarial findings (Story 7.3)
 */

export interface FindingSummary {
  id: string
  roleId: string
  roleName: string
  content: string
  sectionRef: string | null
}

export interface ContradictionPair {
  findingIdA: string
  findingIdB: string
  contradictionReason: string
}

export function buildContradictionDetectionPrompt(context: { findings: FindingSummary[] }): {
  prompt: string
  temperature: number
  maxTokens: number
} {
  const findingsList = context.findings
    .map(
      (f) =>
        `- ID: ${f.id} | 角色: ${f.roleName} | 章节: ${f.sectionRef ?? '无'} | 内容: ${f.content}`
    )
    .join('\n')

  const prompt = `## 任务

请分析以下来自不同对抗评审角色的攻击发现，识别其中存在矛盾观点的 finding 对。

矛盾定义：两个不同角色对同一主题或相关议题提出了相互矛盾、冲突或对立的观点。例如：
- 角色 A 建议"增加微服务架构"而角色 B 批评"运维复杂度太高"
- 角色 A 认为"方案技术深度不足"而角色 B 认为"方案过度设计"
- 角色 A 建议"增加更多案例"而角色 B 认为"篇幅过长需要精简"

注意：同一角色内部的不同发现不算矛盾；只关注**不同角色之间**的矛盾。

## 全部攻击发现

${findingsList}

## 输出格式

请严格输出 JSON 数组，不要添加任何额外文字说明。每对矛盾包含：

\`\`\`json
[
  {
    "findingIdA": "finding-id-1",
    "findingIdB": "finding-id-2",
    "contradictionReason": "矛盾原因简述"
  }
]
\`\`\`

如果没有发现矛盾，请返回空数组 \`[]\`。`

  return {
    prompt,
    temperature: 0.3,
    maxTokens: 2048,
  }
}
