/** 文风模板类型定义 — Story 3.6 */

export type WritingStyleId = string

/** 文风模板完整结构（运行时使用） */
export interface WritingStyleTemplate {
  id: WritingStyleId
  name: string // 显示名，如"军工文风"
  description: string // 简短描述
  version: string
  toneGuidance: string // 语气要求描述（注入 prompt）
  vocabularyRules: string[] // 用语规范（如"使用'系统'而非'软件'"）
  forbiddenWords: string[] // 禁用词列表
  sentencePatterns: string[] // 句式约束（如"多用被动句式"）
  exampleSnippet?: string // 示例段落，帮助 AI 理解文风
  source: 'built-in' | 'company'
}

/**
 * JSON 文件只保存模板内容；source 必须由 service 根据加载目录派生，不能信任文件自声明。
 */
export type WritingStyleFileData = Omit<WritingStyleTemplate, 'source'>

/** IPC 输出：文风列表 */
export interface ListWritingStylesOutput {
  styles: WritingStyleTemplate[]
}

/** IPC 输入：获取单个文风 */
export interface GetWritingStyleInput {
  styleId: WritingStyleId
}

/** IPC 输出：获取单个文风 */
export interface GetWritingStyleOutput {
  style: WritingStyleTemplate | null
}

/** IPC 输入：更新项目文风选择 */
export interface UpdateProjectWritingStyleInput {
  projectId: string
  writingStyleId: WritingStyleId
}

/** IPC 输出：更新项目文风选择 */
export interface UpdateProjectWritingStyleOutput {
  writingStyleId: WritingStyleId
}
