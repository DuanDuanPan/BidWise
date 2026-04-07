/**
 * Ask System (向系统提问) prompt template.
 * Used by the generate agent in ask-system mode to answer user questions
 * about a specific chapter in the proposal document.
 */

export interface AskSystemContext {
  chapterTitle: string
  chapterLevel: number
  sectionContent: string
  userQuestion: string
  language?: string
}

export const ASK_SYSTEM_SYSTEM_PROMPT = `你是 BidWise 标智的方案顾问 AI。用户正在编辑投标方案文档的某个章节，并就该章节内容向你提问。

你的回答应当：
1. 基于提供的章节内容回答，不要编造不存在的内容
2. 简洁专业，直接回答用户问题
3. 如果问题超出当前章节上下文范围，说明限制并给出你能提供的最佳建议
4. 使用与用户相同的语言回复`

export function askSystemPrompt(context: AskSystemContext): string {
  const lang = context.language ?? '中文'

  const sections: string[] = []

  sections.push(`## 当前章节：${context.chapterTitle}（${context.chapterLevel}级标题）`)

  if (context.sectionContent) {
    sections.push(`## 章节内容\n${context.sectionContent}`)
  } else {
    sections.push('## 章节内容\n（当前章节暂无内容）')
  }

  sections.push(`## 用户提问\n${context.userQuestion}`)

  sections.push(`请用${lang}回答上述问题。回答应直接、专业，不超过 500 字。`)

  return sections.join('\n\n')
}
