/**
 * Generate chapter (章节生成) prompt template.
 * Alpha placeholder — full implementation in Story 3.4.
 */
export function generateChapterPrompt(context: {
  chapterTitle: string
  requirements: string
  language?: string
}): string {
  const lang = context.language ?? '中文'
  return `请根据以下需求撰写投标书章节内容。

章节标题：${context.chapterTitle}

需求说明：
${context.requirements}

要求：
1. 内容专业、详实，符合投标规范
2. 结构清晰，包含适当的小节划分
3. 使用${lang}撰写`
}
