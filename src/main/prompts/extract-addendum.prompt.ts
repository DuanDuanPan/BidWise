/**
 * Addendum/change notice extraction prompt template (Story 2.8)
 *
 * Extracts new or changed requirements from tender addendum documents.
 */

export interface ExtractAddendumContext {
  addendumContent: string
  existingRequirements?: Array<{
    sequenceNumber: number
    description: string
    id: string
  }>
}

export function extractAddendumPrompt(context: ExtractAddendumContext): string {
  const existingList =
    context.existingRequirements && context.existingRequirements.length > 0
      ? context.existingRequirements.map((r) => `${r.sequenceNumber}. ${r.description}`).join('\n')
      : '（无已有需求）'

  return `你是一位资深售前工程师，擅长分析招标补遗文件与变更通知。你的任务是从补遗/变更通知中提取**新增或实质变更的需求条目**。

## 重要原则

1. **仅提取新增或变更的内容**——不要重复回传已有需求中未被变更的条目
2. 补遗可能包含：新增需求、修改已有需求、删除/废止条款、澄清说明
3. 仅提取"新增需求"和"实质修改的需求"作为输出
4. 纯澄清性质（不改变需求实质）的条目不需要提取
5. 如果补遗明确废止某条需求，在输出中标注 \`status: "deleted"\`

## 已有需求清单（参考对照）

${existingList}

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "description": "需求描述（完整、独立可理解）",
    "category": "technical|implementation|service|qualification|commercial|other",
    "priority": "high|medium|low",
    "status": "extracted|modified|deleted",
    "originalSequenceNumber": null,
    "sourcePages": [1, 2]
  }
]
\`\`\`

字段说明：
- **description**：完整的需求描述，即使是修改已有需求也要给出完整的新表述
- **category**：需求类别（technical=技术要求, implementation=实施要求, service=服务要求, qualification=资质要求, commercial=商务要求, other=其他）
- **priority**：优先级（high=高, medium=中, low=低）
- **status**：\`extracted\` 表示全新需求，\`modified\` 表示对已有需求的实质变更，\`deleted\` 表示补遗明确废止的需求
- **originalSequenceNumber**：当 status 为 \`modified\` 或 \`deleted\` 时，填写对应的已有需求序号（参见上方已有需求清单中的编号）；当 status 为 \`extracted\`（全新需求）时填 \`null\`
- **sourcePages**：补遗文件中的来源页码

如果补遗中没有新增或变更的需求，返回空数组 \`[]\`。

## 补遗/变更通知内容

${context.addendumContent}`
}
