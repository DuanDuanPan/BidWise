import type { SectionWeightEntry, ProposalSectionIndexEntry } from '../template-types'
import type { AnnotationRecord } from '../annotation-types'
import type { SourceAttribution, BaselineValidation } from '../source-attribution-types'
import type { WritingStyleId } from '../writing-style-types'
import type { SkeletonExpandPlan } from '../chapter-types'

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
  annotations: AnnotationRecord[]
  scores: [] // Alpha 阶段空数组占位，Epic 7 填充
  sourceAttributions: SourceAttribution[]
  baselineValidations: BaselineValidation[]
  sectionWeights?: SectionWeightEntry[]
  sectionIndex?: ProposalSectionIndexEntry[]
  templateId?: string
  writingStyleId?: WritingStyleId
  confirmedSkeletons?: Record<string, SkeletonExpandPlan>
  lastSavedAt: string // ISO-8601
}

/** 自动保存状态 */
export interface AutoSaveState {
  dirty: boolean
  saving: boolean
  lastSavedAt: string | null
  error: string | null
}
