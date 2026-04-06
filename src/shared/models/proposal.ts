import type { SectionWeightEntry } from '../template-types'
import type { SourceAttribution, BaselineValidation } from '../source-attribution-types'

/** 方案文档数据模型 */
export interface ProposalDocument {
  projectId: string
  content: string // Markdown 文本
  lastSavedAt: string // ISO-8601
  version: number
}

/** proposal.meta.json 结构 */
export interface ProposalMetadata {
  version: string // schema 版本 "1.0"
  projectId: string
  annotations: [] // Alpha 阶段空数组占位，Epic 4 填充
  scores: [] // Alpha 阶段空数组占位，Epic 7 填充
  sourceAttributions: SourceAttribution[]
  baselineValidations: BaselineValidation[]
  sectionWeights?: SectionWeightEntry[]
  templateId?: string
  lastSavedAt: string // ISO-8601
}

/** 自动保存状态 */
export interface AutoSaveState {
  dirty: boolean
  saving: boolean
  lastSavedAt: string | null
  error: string | null
}
