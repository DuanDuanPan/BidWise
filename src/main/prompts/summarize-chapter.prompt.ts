/**
 * Summarize chapter prompt (Story 3.12).
 *
 * Produces a structured JSON summary of a chapter's direct body, used to build
 * the global summary context (`generatedChaptersContext`) for later chapter
 * generation calls.
 */
import { CHAPTER_SUMMARY_MAX_LENGTH } from '@shared/chapter-summary-types'

export interface SummarizeChapterContext {
  chapterTitle: string
  chapterLevel: number
  /** Direct body (excluding sub-sections) — see getMarkdownDirectSectionBody */
  directBody: string
}

export const SUMMARIZE_CHAPTER_SYSTEM_PROMPT =
  '你是投标方案章节摘要助手。你的唯一任务是为给定章节的直属正文生成简短结构化摘要，便于其它章节生成时对齐承诺、数字、术语和语气。你必须严格输出 JSON，不加代码围栏、不加解释文字。'

export function summarizeChapterPrompt(context: SummarizeChapterContext): string {
  const title = context.chapterTitle.trim()
  const level = context.chapterLevel
  const body = context.directBody.trim() || '（本章直属正文为空）'

  return `## 章节标题：${title}（${level} 级标题）

## 章节直属正文（不含子章节）
${body}

## 输出要求
严格输出如下 JSON（不加代码围栏、不加解释文字）：
{
  "key_commitments": ["承诺1", "承诺2"],
  "numbers": [{"label": "工期", "value": "180 天"}],
  "terms": ["术语1", "术语2"],
  "tone": "正式/专业/强调可靠性"
}

约束：
1. key_commitments 为该章节对甲方的具体承诺条款；无承诺用空数组。
2. numbers 为数字化承诺或指标（工期、精度、并发、SLA 等）；无数字用空数组。
3. terms 为本章引入的关键术语或专有名词；无则空数组。
4. tone 为本章写作语气的一句话概括。
5. 序列化后总长度尽量控制在 ${CHAPTER_SUMMARY_MAX_LENGTH} 字符以内；超出时优先舍弃 numbers 中次要条目。
6. 禁止输出除上述 JSON 以外的任何字符（包括 \`\`\`json 代码围栏、解释性文字、多余空白行）。`
}
