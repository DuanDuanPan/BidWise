/**
 * Generate chapter (章节生成) prompt template.
 * Injects rich context: chapter title, requirements, scoring weights,
 * mandatory items, adjacent chapter summaries, guidance text, and optional strategy seed.
 */

/** Detect compliance matrix / requirement response table chapters */
const COMPLIANCE_MATRIX_RE = /对照表|响应矩阵|响应表$|符合性说明$|偏离表|compliance\s*matrix/i

export function isComplianceMatrixChapter(title: string): boolean {
  return COMPLIANCE_MATRIX_RE.test(title)
}

export interface GenerateChapterContext {
  chapterTitle: string
  chapterLevel: number
  requirements: string
  guidanceText?: string
  scoringWeights?: string
  mandatoryItems?: string
  writingStyle?: string
  documentOutline?: string
  adjacentChaptersBefore?: string
  adjacentChaptersAfter?: string
  strategySeed?: string
  additionalContext?: string
  terminologyContext?: string
  language?: string
}

export function generateChapterPrompt(context: GenerateChapterContext): string {
  const lang = context.language ?? '中文'
  const isMatrix = isComplianceMatrixChapter(context.chapterTitle)

  const sections: string[] = []

  sections.push(`## 章节标题：${context.chapterTitle}（${context.chapterLevel}级标题）`)

  // For compliance matrix chapters, override guidanceText with index-table semantics
  if (isMatrix) {
    sections.push(
      `## 编写指导\n本章节是需求响应对照索引表。以 Markdown 表格形式逐条列出每条招标需求的响应方式和对应详细章节位置，不要在本表中展开详细的技术方案或解决方案，详细内容由各专项章节独立撰写。`
    )
  } else if (context.guidanceText) {
    sections.push(`## 编写指导\n${context.guidanceText}`)
  }

  sections.push(`## 招标需求\n${context.requirements}`)

  if (context.scoringWeights) {
    sections.push(`## 评分标准与权重\n${context.scoringWeights}`)
  }

  if (context.mandatoryItems) {
    sections.push(`## 必响应条款\n以下条款必须在章节中明确回应：\n${context.mandatoryItems}`)
  }

  if (context.writingStyle) {
    sections.push(`## 写作风格要求\n${context.writingStyle}`)
  }

  if (context.documentOutline) {
    sections.push(
      `## 文档完整大纲（仅撰写当前章节，其他章节会单独生成）\n${context.documentOutline}`
    )
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

  if (context.terminologyContext) {
    sections.push(`## 行业术语规范\n${context.terminologyContext}`)
  }

  if (context.additionalContext) {
    sections.push(`## 补充说明\n${context.additionalContext}`)
  }

  if (isMatrix) {
    sections.push(`## 输出要求
1. 使用${lang}撰写，符合投标规范
2. 以 Markdown 表格形式输出，表格列为：序号 | 招标需求条目 | 需求类别 | 响应说明 | 详见章节
3. 「响应说明」列简要说明响应方式（不超过两句话），不要展开详细技术方案
4. 「详见章节」列指向文档大纲中对应的详细章节名称
5. 每条招标需求对应表格中的一行，确保全部需求均有对应
6. 如果存在必响应条款，在对应需求行的「响应说明」列中标注"★必响应"；若有未被需求覆盖的必响应条款，在表格末尾追加对应行
7. 表格前可用一小段引言概括对照表的目的，表格后无需总结
8. 直接输出 Markdown 正文，不要包含章节主标题
9. 第一行不得重复输出「${context.chapterTitle}」作为 H1/H2/H3/H4 或普通文本，例如不要输出\u201C## ${context.chapterTitle}\u201D`)
  } else {
    const maxSubLevel = context.chapterLevel + 2

    sections.push(`## 输出要求
1. 使用${lang}撰写，内容专业、详实，符合投标规范
2. 根据章节内容的复杂度和性质选择合适的结构：
   - 如果章节内容简短概括性强（如 建设目标、项目背景、项目概述、服务承诺 等），用1-2段精炼文字即可，不要强行拆分子标题
   - 如果章节内容需要展开详述（如 技术方案、实施计划、安全保障、系统架构 等），可使用子标题划分小节
   - 子标题层级不得超过 ${maxSubLevel} 级标题（即当前 ${context.chapterLevel} 级标题最深只能再往下拆 2 级）
3. 适当使用列表和表格增强可读性
4. 内容需覆盖招标需求中与本章节相关的要点
5. 必须回应所有列出的必响应条款
6. 避免与前后章节内容重复
7. 直接输出 Markdown 正文，不要包含章节主标题
8. 第一行不得重复输出「${context.chapterTitle}」作为 H1/H2/H3/H4 或普通文本，例如不要输出\u201C## ${context.chapterTitle}\u201D
9. 严格限定在「${context.chapterTitle}」的主题范围内撰写，文档大纲中的其他章节会独立生成，不要在本章节中涉及其他章节的内容`)
  }

  return sections.join('\n\n')
}

export const GENERATE_CHAPTER_SYSTEM_PROMPT =
  '你是一个专业技术方案撰写助手（Professional Proposal Writing Assistant）。你擅长根据招标文件需求、评分标准和投标策略，撰写高质量的投标书章节内容。你的输出必须是结构化的 Markdown 格式。'
