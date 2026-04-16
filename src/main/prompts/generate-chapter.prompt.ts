/**
 * Generate chapter (章节生成) prompt template.
 * Injects rich context: chapter title, requirements, scoring weights,
 * mandatory items, adjacent chapter summaries, guidance text, and optional strategy seed.
 */

/** Detect compliance matrix / requirement response table chapters */
const COMPLIANCE_MATRIX_RE = /对照表|响应矩阵|响应表$|符合性说明$|偏离表|compliance\s*matrix/i
const DIAGRAM_HEAVY_CHAPTER_RE =
  /架构|技术方案|系统设计|模块设计|部署|拓扑|数据流|流程|接口|集成|实施计划|迁移|安全体系/i
const DIAGRAM_LIGHT_CHAPTER_RE = /背景|概述|承诺|报价|说明|目标|优势|团队|资质/i
const DIAGRAM_RELATION_GUIDANCE_RE =
  /关系|分类体系|分层|交互|协作|调用|依赖|流转|链路|拓扑|总览|全景|结构图|关系图/i
const DIAGRAM_DIMENSION_HINTS = new Set(['process-flow', 'interface', 'deployment'])

export function isComplianceMatrixChapter(title: string): boolean {
  return COMPLIANCE_MATRIX_RE.test(title)
}

export interface DiagramSuggestionOptions {
  guidanceText?: string
  dimensions?: string[]
}

export function shouldSuggestDiagrams(
  title: string,
  options: DiagramSuggestionOptions = {}
): boolean {
  if (isComplianceMatrixChapter(title)) return false

  const guidanceText = options.guidanceText?.trim() ?? ''
  const combinedText = `${title} ${guidanceText}`.trim()
  const hasStructuralGuidance = DIAGRAM_RELATION_GUIDANCE_RE.test(combinedText)
  const hasStructuralDimensions = (options.dimensions ?? []).some((dimension) =>
    DIAGRAM_DIMENSION_HINTS.has(dimension)
  )

  if (
    DIAGRAM_LIGHT_CHAPTER_RE.test(title) &&
    !DIAGRAM_HEAVY_CHAPTER_RE.test(combinedText) &&
    !hasStructuralGuidance &&
    !hasStructuralDimensions
  ) {
    return false
  }

  if (DIAGRAM_HEAVY_CHAPTER_RE.test(combinedText) || hasStructuralGuidance) {
    return true
  }

  return hasStructuralDimensions
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
  const diagramsPreferred = shouldSuggestDiagrams(context.chapterTitle, {
    guidanceText: context.guidanceText,
  })

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
   - 子标题必须从 ${context.chapterLevel + 1} 级标题开始，最深不得超过 ${maxSubLevel} 级标题。禁止输出 ${context.chapterLevel} 级或更高级别（数字更小）的标题
3. 适当使用列表和表格增强可读性
4. 内容需覆盖招标需求中与本章节相关的要点
5. 必须回应所有列出的必响应条款
6. 避免与前后章节内容重复
7. 直接输出 Markdown 正文，不要包含章节主标题
8. 第一行不得重复输出「${context.chapterTitle}」作为 H1/H2/H3/H4 或普通文本，例如不要输出\u201C## ${context.chapterTitle}\u201D
9. 严格限定在「${context.chapterTitle}」的主题范围内撰写，文档大纲中的其他章节会独立生成，不要在本章节中涉及其他章节的内容
10. 在正式输出前先自检：是否覆盖了关键需求、是否遗漏必响应条款、是否出现章节越界内容；自检过程不要显式输出
11. 控制篇幅在合理范围内，聚焦核心要点，避免不必要的重复和冗余展开`)

    if (diagramsPreferred) {
      sections.push(`## 图表插入要求
1. 如果本章节存在明显的结构关系、流程关系、分层关系、时序关系或部署关系，请在合适位置插入 1-3 个图表占位符。
2. 占位符必须严格使用如下格式，不要改写、不要加代码围栏：
   %%DIAGRAM:skill:图表标题:图表描述的UTF-8 Base64编码%%
   第二段的类型标识必须固定写 skill（不要写 mermaid、C4Container、architecture-beta 等具体语法名）。
3. 第四段必须是纯 base64 字符串，只能包含 A-Z、a-z、0-9、+、/、=；不要输出 \`base64(...)\` 包装、不要换行、不要加解释文字。不要输出未编码的中文描述。
4. 后续系统会根据语义自动选择合适的图表风格和类型（架构图、流程图、时序图等），你只需在描述中说明图表意图即可。
5. 图表描述必须具体说明图表包含哪些组件、分组、关系和关键连线约束。例如：描述一个三层架构图时需要说明每层包含哪些组件、层之间的数据流方向和协议。
6. 图表标题必须简洁清晰，图表描述必须具体到组件/阶段/数据流，不要写抽象词。
7. 占位符应紧跟在相关段落之后，不要集中堆到文末。
8. 绝对不要直接输出 \`\`\`mermaid 或 \`\`\`xml 代码块。程序只能识别 %%DIAGRAM%% 占位符，直接嵌入的代码块不会被正确渲染。`)
      sections.push(`## 图表输出红线
任何三反引号代码块中的结构图、ASCII 盒线图、伪图表都会被判定为图表输出失败。图表内容只能通过 %%DIAGRAM%% 占位符交给程序生成。`)
    } else {
      sections.push(`## 图表策略
本章节以文字说明为主。除非确实无法清楚表达结构关系，否则不要输出任何图表占位符。`)
    }
  }

  return sections.join('\n\n')
}

export const GENERATE_CHAPTER_SYSTEM_PROMPT =
  '你是一个专业技术方案撰写助手（Professional Proposal Writing Assistant）。你擅长根据招标文件需求、评分标准和投标策略，撰写高质量的投标书章节内容。你的输出必须是结构化的 Markdown 格式。'

// ─── Skeleton-Expand prompts ───

export const SKELETON_GENERATION_SYSTEM_PROMPT =
  '你是一个专业技术方案结构规划助手。你的任务是根据招标需求和章节主题，规划详细设计章节的子章节结构。你必须输出严格的 JSON 格式。'

/** Generic B/S web design dimension checklist (Story A) */
export const DEFAULT_DIMENSION_CHECKLIST = `设计维度检查清单（根据实际需求选择性应用，不要强行套用所有维度）：
- functional: 功能设计（业务流程、功能模块、用例场景）
- ui: 界面设计（页面布局、交互设计、用户体验）
- process-flow: 流程设计（业务流程图、审批流、数据流）
- data-model: 数据模型（数据库设计、实体关系、数据字典）
- interface: 接口设计（API 规范、系统集成、第三方对接）
- security: 安全设计（权限控制、数据安全、审计日志）
- deployment: 部署设计（部署架构、运维方案、高可用设计）`

export interface SkeletonPromptContext {
  chapterTitle: string
  chapterLevel: number
  requirements: string
  scoringWeights?: string
  documentOutline?: string
  dimensionChecklist: string
}

export function generateSkeletonPrompt(context: SkeletonPromptContext): string {
  const sections: string[] = []

  sections.push(`## 章节标题：${context.chapterTitle}（${context.chapterLevel}级标题）`)
  sections.push(`## 招标需求\n${context.requirements}`)

  if (context.scoringWeights) {
    sections.push(`## 评分标准与权重\n${context.scoringWeights}`)
  }

  if (context.documentOutline) {
    sections.push(`## 文档完整大纲\n${context.documentOutline}`)
  }

  sections.push(`## 设计维度参考\n${context.dimensionChecklist}`)

  sections.push(`## 任务
分析上述需求，确定本章节应覆盖的功能模块/子系统，为每个模块选择适用的设计维度。

## 输出要求
输出严格 JSON，格式如下（不要包含任何其他文字）：
{
  "sections": [
    {
      "title": "子章节标题（如：用户管理模块 - 功能设计）",
      "level": ${context.chapterLevel + 1},
      "dimensions": ["functional", "ui"],
      "guidanceHint": "简要说明该子章节应聚焦的内容"
    }
  ]
}

注意：
1. level 必须在 ${context.chapterLevel + 1} 到 4 之间（含）
2. 每个子章节的 title 应清晰体现模块名和设计维度
3. dimensions 数组包含该子章节关联的设计维度标识
4. 根据实际需求灵活规划，不要机械地为每个模块都生成所有维度的子章节
5. 子章节数量建议 3-10 个，避免过于细碎`)

  return sections.join('\n\n')
}

export interface SubChapterPromptContext extends GenerateChapterContext {
  dimensionFocus: string
  previousSectionsSummary?: string
  siblingSectionTitles?: string[]
}

export function generateSubChapterPrompt(context: SubChapterPromptContext): string {
  const basePrompt = generateChapterPrompt(context)

  const extras: string[] = []

  extras.push(`## 设计维度聚焦\n本子章节应重点围绕以下设计维度展开：${context.dimensionFocus}`)

  if (context.previousSectionsSummary) {
    extras.push(
      `## 已生成的同级子章节摘要（避免重复，保持衔接）\n${context.previousSectionsSummary}`
    )
  }

  const siblingSectionTitles = (context.siblingSectionTitles ?? []).filter(
    (title) => title !== context.chapterTitle
  )
  if (siblingSectionTitles.length > 0) {
    extras.push(`## 同级子章节边界
你当前正在撰写父章节下的一个独立子章节。以下同级子章节会由系统分别生成：
- ${siblingSectionTitles.join('\n- ')}
当前输出只覆盖「${context.chapterTitle}」。
对于其他同级子章节，只保留与当前主题直接相关的衔接一句，不展开其实现细节、流程、指标、管理要求或验收内容。
如果继续细分小节，子标题从 ${context.chapterLevel + 1} 级标题开始。不要输出 ${context.chapterLevel} 级标题。`)
  }

  return basePrompt + '\n\n' + extras.join('\n\n')
}
