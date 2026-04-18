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

/**
 * Chapter identity schema versions (Story 11.1).
 *
 * - `1` (or missing): legacy — sectionId may be template key (`s1.1`), locator
 *   key (`2:公司简介:0`), or title-hash fallback. confirmedSkeletons keyed by
 *   locator key.
 * - `2`: project-level UUID v4 for every sectionId; confirmedSkeletons keyed
 *   by UUID; sidecar + SQLite references normalized.
 */
export const CHAPTER_IDENTITY_SCHEMA_LATEST = 2 as const
export type ChapterIdentitySchemaVersion = 1 | 2

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
  /** Story 11.1: keyed by project-level UUID `sectionId` (v2+). */
  confirmedSkeletons?: Record<string, SkeletonExpandPlan>
  /** Story 11.1: chapter identity schema version; absent == v1 (legacy). */
  chapterIdentitySchemaVersion?: ChapterIdentitySchemaVersion
  lastSavedAt: string // ISO-8601
}

/** 自动保存状态 */
export interface AutoSaveState {
  dirty: boolean
  saving: boolean
  lastSavedAt: string | null
  error: string | null
}
