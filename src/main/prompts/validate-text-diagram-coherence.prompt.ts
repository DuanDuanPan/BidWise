export interface ValidateTextDiagramCoherenceContext {
  chapterTitle: string
  chapterMarkdown: string
  diagramSummaries: string[]
}

export function validateTextDiagramCoherencePrompt(
  context: ValidateTextDiagramCoherenceContext
): string {
  return `## 任务
请检查章节正文与图表是否一致，并返回 JSON。

## 章节标题
${context.chapterTitle}

## 章节正文
${context.chapterMarkdown}

## 图表摘要
${context.diagramSummaries.map((item) => `- ${item}`).join('\n')}

## 校验要求
1. 必须检查术语是否一致、关键组件是否被图表覆盖、图表位置是否合理。
2. 请至少指出 1 个潜在风险点；如果整体通过，可把它写成“轻微风险/建议”。
3. 只输出 JSON，格式如下：
{
  "pass": true,
  "issues": [
    {
      "type": "terminology|coverage|placement|minor-risk",
      "description": "问题描述",
      "suggestion": "修正建议"
    }
  ],
  "checked_items": ["组件覆盖", "术语统一", "位置合理性"]
}`
}

export const VALIDATE_TEXT_DIAGRAM_COHERENCE_SYSTEM_PROMPT =
  '你是一个严苛的技术文档一致性审查员。必须输出严格 JSON，不要输出任何额外文字。'
