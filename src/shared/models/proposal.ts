import type { SectionWeightEntry, ProposalSectionIndexEntry } from '../template-types'
import type { AnnotationRecord } from '../annotation-types'
import type { SourceAttribution, BaselineValidation } from '../source-attribution-types'
import type { WritingStyleId } from '../writing-style-types'
import type { SkeletonExpandPlan, PendingStructureDeletionSnapshot } from '../chapter-types'

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
  /**
   * Story 11.4: persisted soft-delete Undo journal. Holds at most one `active`
   * entry plus zero-or-one `staged` entry that is mid-commit. The journal is
   * drained by `cleanupPendingDeletionsOnStartup()` on every process start.
   */
  pendingStructureDeletions?: PendingStructureDeletionSnapshot[]
  /** Story 11.1: chapter identity schema version; absent == v1 (legacy). */
  chapterIdentitySchemaVersion?: ChapterIdentitySchemaVersion
  /**
   * Story 11.9: first time the user explicitly confirmed the skeleton and left
   * `edit-skeleton` for `proposal-writing`. Written once (idempotent) by
   * `document:mark-skeleton-confirmed`; consumed by `SolutionDesignView` to
   * derive the `has-content` CTA label between
   * `确认骨架，开始撰写` (first confirm pending) and `继续撰写` (already confirmed).
   */
  firstSkeletonConfirmedAt?: string
  lastSavedAt: string // ISO-8601
}

/** 自动保存状态 */
export interface AutoSaveState {
  dirty: boolean
  saving: boolean
  lastSavedAt: string | null
  error: string | null
}
