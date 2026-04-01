/**
 * Generate chapter (章节生成) prompt template.
 * Injects rich context: chapter title, requirements, scoring weights,
 * mandatory items, adjacent chapter summaries, guidance text, and optional strategy seed.
 */

export interface GenerateChapterContext {
  chapterTitle: string
  chapterLevel: number
  requirements: string
  guidanceText?: string
  scoringWeights?: string
  mandatoryItems?: string
  adjacentChaptersBefore?: string
  adjacentChaptersAfter?: string
  strategySeed?: string
  additionalContext?: string
  language?: string
}

export function generateChapterPrompt(context: GenerateChapterContext): string {
  const lang = context.language ?? '中文'

  const sections: string[] = []

  sections.push(`## 章节标题：${context.chapterTitle}（${context.chapterLevel}级标题）`)

  if (context.guidanceText) {
    sections.push(`## 编写指导\n${context.guidanceText}`)
  }

  sections.push(`## 招标需求\n${context.requirements}`)

  if (context.scoringWeights) {
    sections.push(`## 评分标准与权重\n${context.scoringWeights}`)
  }

  if (context.mandatoryItems) {
    sections.push(`## 必响应条款\n以下条款必须在章节中明确回应：\n${context.mandatoryItems}`)
  }

  if (context.adjacentChaptersBefore) {
    sections.push(`## 前序章节摘要（避免重复）\n${context.adjacentChaptersBefore}`)
  }

  if (context.adjacentChaptersAfter) {
    sections.push(`## 后续章节摘要（避免前置）\n${context.adjacentChaptersAfter}`)
  }

  if (context.strategySeed) {
    sections.push(`## 投标策略参考\n${context.strategySeed}`)
  }

  if (context.additionalContext) {
    sections.push(`## 补充说明\n${context.additionalContext}`)
  }

  sections.push(`## 输出要求
1. 使用${lang}撰写，内容专业、详实，符合投标规范
2. 结构清晰，使用 H3/H4 子标题划分小节
3. 适当使用列表和表格增强可读性
4. 内容需覆盖招标需求中与本章节相关的要点
5. 必须回应所有列出的必响应条款
6. 避免与前后章节内容重复
7. 直接输出 Markdown 正文，不要包含章节主标题`)

  return sections.join('\n\n')
}

export const GENERATE_CHAPTER_SYSTEM_PROMPT =
  '你是一个专业技术方案撰写助手（Professional Proposal Writing Assistant）。你擅长根据招标文件需求、评分标准和投标策略，撰写高质量的投标书章节内容。你的输出必须是结构化的 Markdown 格式。'
