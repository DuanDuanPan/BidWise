/**
 * Traceability mapping prompt template (Story 2.8)
 *
 * Maps requirements to proposal sections with coverage assessment.
 */

export interface TraceabilityPromptContext {
  requirements: Array<{
    id: string
    sequenceNumber: number
    description: string
    category: string
  }>
  sections: Array<{
    sectionId: string
    title: string
    level: number
  }>
  existingManualLinks?: Array<{
    requirementId: string
    sectionId: string
    coverageStatus: string
  }>
}

export function generateTraceabilityPrompt(context: TraceabilityPromptContext): string {
  const requirementsList = context.requirements
    .map((r) => `- [${r.id}] #${r.sequenceNumber} (${r.category}): ${r.description}`)
    .join('\n')

  const sectionsList = context.sections
    .map((s) => `- [${s.sectionId}] ${'#'.repeat(s.level)} ${s.title}`)
    .join('\n')

  const manualLinksSection =
    context.existingManualLinks && context.existingManualLinks.length > 0
      ? `
## 已有手动映射（请勿冲突）

以下映射由用户手动创建，你的输出应避免与这些映射产生冲突的自动映射：

${context.existingManualLinks.map((l) => `- 需求 ${l.requirementId} → 章节 ${l.sectionId} (${l.coverageStatus})`).join('\n')}
`
      : ''

  return `你是一位资深售前合规工程师，擅长分析招标需求与投标方案之间的追溯关系。你的任务是将每条招标需求映射到方案章节，评估覆盖程度。

## 招标需求清单

${requirementsList}

## 方案章节列表

${sectionsList}
${manualLinksSection}
## 映射规则

1. **仅返回存在映射关系的条目**——如果某条需求在所有章节中都没有对应内容，不要为其伪造映射
2. 一条需求可以映射到多个章节（一对多）
3. 一个章节也可以被多条需求映射（多对一）
4. 覆盖状态评估标准：
   - \`covered\`：该章节明确回应了这条需求的核心要求
   - \`partial\`：该章节涉及了这条需求的部分内容，但不够完整
   - \`uncovered\`：该需求明确需要在此章节回应，但目前章节内容缺失或不足
5. 置信度标准：0.9+ 非常确定，0.7-0.9 较确定，0.5-0.7 推测性

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "requirementId": "需求ID",
    "sectionMappings": [
      {
        "sectionId": "章节ID",
        "coverageStatus": "covered|partial|uncovered",
        "confidence": 0.85,
        "reason": "简要说明映射理由（20-50字）"
      }
    ]
  }
]
\`\`\`

字段说明：
- **requirementId**：必须是上方需求清单中的有效 ID
- **sectionId**：必须是上方章节列表中的有效 ID
- **coverageStatus**：\`covered\` | \`partial\` | \`uncovered\`
- **confidence**：0-1 之间的置信度
- **reason**：简要说明为什么这条需求与该章节相关

请仔细分析每条需求的核心要求，然后匹配最相关的方案章节。`
}
