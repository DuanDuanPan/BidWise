/**
 * Chapter generation shared types — consumed by chapter-generation-service,
 * IPC handlers, and renderer hooks/components (Story 3.4).
 */

/** Heading locator — uniquely identifies a chapter section within proposal.md */
export interface ChapterHeadingLocator {
  title: string
  level: 1 | 2 | 3 | 4
  occurrenceIndex: number
}

/**
 * Project-level stable chapter identity (UUID v4). Story 11.1.
 *
 * `sectionId` persists across structure edits (rename, move, reorder). Every
 * cross-service reference (annotations, traceability, source attributions,
 * chapter summaries, notifications, confirmed skeletons) uses this value.
 *
 * Template `s1.1`-style keys remain as `templateSectionKey` (read-side only),
 * and `ChapterHeadingLocator` remains the runtime view used by markdown /
 * DOM bridging code paths.
 */
export type StableSectionId = string

/**
 * Canonical per-chapter identity record stored in
 * `proposal.meta.json.sectionIndex`. Story 11.1.
 *
 * Consumers derive locator keys / display numbers / tree paths at read time;
 * persistence anywhere downstream uses `sectionId` as the foreign key.
 */
export interface ChapterIdentityEntry {
  sectionId: StableSectionId
  parentSectionId?: StableSectionId
  order: number
  title: string
  level: 1 | 2 | 3 | 4
  occurrenceIndex: number
  templateSectionKey?: string
  headingLocator: ChapterHeadingLocator
}

/** In-memory tree built from a flat `sectionIndex[]` at read time. */
export interface ChapterTreeNode extends ChapterIdentityEntry {
  children: ChapterTreeNode[]
}

// ─── Story 11.4: Soft-delete + Undo snapshot ─────────────────────────────────

/**
 * Structural anchor used to re-insert a deleted subtree on Undo. Carries both
 * the outline-level parent/sibling pointers (`sectionId`-based) and the
 * markdown-level locator of the sibling heading that preceded the deleted
 * subtree in `proposal.md`. At restore time the service prefers the outline
 * anchor; the markdown locator is a narrow fallback used only when the
 * sibling sectionId can no longer be resolved in the live sectionIndex.
 */
export interface RestoreAnchor {
  parentSectionId: StableSectionId | null
  previousSiblingSectionId: StableSectionId | null
  previousHeadingLocator: ChapterHeadingLocator | null
}

/**
 * Sidecar / SQLite rows that must be fully restored by Undo. Each field is a
 * snapshot of the state as it was at `deletedAt`, scoped to the deleted
 * sectionIds. Types intentionally loose (unknown[]) to keep `chapter-types.ts`
 * free of cross-module imports — the service layer narrows on deserialize.
 */
export interface PendingStructureDeletionCascade {
  sectionWeights: unknown[]
  confirmedSkeletonsBySectionId: Record<string, unknown>
  annotations: unknown[]
  sourceAttributions: unknown[]
  baselineValidations: unknown[]
  chapterSummaries: unknown[]
  traceabilityLinks: unknown[]
  sqliteAnnotations: unknown[]
  sqliteTraceabilityLinks: unknown[]
  sqliteNotifications: unknown[]
}

/** Staged = journal written but live delete not yet committed; active = Undo window visible. */
export type PendingStructureDeletionStage = 'staged' | 'active'

/**
 * Persisted Undo snapshot. Lives in
 * `proposal.meta.json.pendingStructureDeletions[]`. Only the single active
 * entry is surfaced to the renderer as `activePendingDeletion`; staged
 * entries are invisible to renderer + startup cleanup.
 */
export interface PendingStructureDeletionSnapshot {
  deletionId: string
  stage: PendingStructureDeletionStage
  deletedAt: string
  expiresAt: string
  rootSectionId: StableSectionId
  sectionIds: StableSectionId[]
  firstTitle: string
  subtreeMarkdown: string
  sectionIndexEntries: ChapterIdentityEntry[]
  /** Opaque pointer so storage types stay in sync with ProposalMetadata.sectionIndex. */
  restoreAnchor: RestoreAnchor
  totalWordCount: number
  cascade: PendingStructureDeletionCascade
}

/**
 * Renderer-facing summary. Mirrors the fields the Undo toast and
 * `chapterStructureStore.activePendingDeletion` actually need, without
 * leaking full cascade payloads to the UI.
 *
 * `sectionIndexEntries` carries the structural rows of the deleted subtree so
 * the renderer tree build can merge them back during the 5-second Undo window.
 * Main-side scrubs them from the live `sectionIndex`, so without this payload
 * the pending-delete visual state would have no tree rows to attach to.
 */
export interface PendingStructureDeletionSummary {
  deletionId: string
  deletedAt: string
  expiresAt: string
  rootSectionId: StableSectionId
  sectionIds: StableSectionId[]
  firstTitle: string
  totalWordCount: number
  subtreeSize: number
  sectionIndexEntries: ChapterIdentityEntry[]
}

/** Phase state machine for chapter generation */
export type ChapterGenerationPhase =
  | 'queued'
  | 'analyzing'
  | 'generating-text'
  | 'validating-text'
  | 'generating-diagrams'
  | 'validating-diagrams'
  | 'composing'
  | 'validating-coherence'
  | 'annotating-sources'
  | 'skeleton-generating'
  | 'skeleton-ready'
  | 'batch-generating'
  | 'batch-composing'
  | 'conflicted'
  | 'completed'
  | 'failed'

// ─── Skeleton-Expand types ───

/** Known design dimensions for skeleton generation */
export const KNOWN_DIMENSIONS = [
  'functional',
  'ui',
  'process-flow',
  'data-model',
  'interface',
  'security',
  'deployment',
] as const

/** Design dimension — string for extensibility, KNOWN_DIMENSIONS for common values */
export type DesignDimension = string

/** A single section in a skeleton-expand plan */
export interface SkeletonExpandSection {
  title: string
  level: number
  dimensions: string[]
  guidanceHint?: string
}

/** Confirmed skeleton plan for a chapter */
export interface SkeletonExpandPlan {
  parentTitle: string
  parentLevel: number
  sections: SkeletonExpandSection[]
  dimensionChecklist: string[]
  confirmedAt: string
}

/** Progress payload for batch sub-chapter generation (legacy single-task batch) */
export interface SkeletonBatchProgressPayload {
  kind: 'skeleton-batch'
  completedCount: number
  totalCount: number
  completedSections: string[]
  failedSections: Array<{ title: string; error: string }>
}

/** Per-section status within a progressive batch */
export type BatchSectionPhase = 'pending' | 'generating' | 'completed' | 'failed' | 'retrying'

/** Status of a single section within a progressive batch orchestration */
export interface BatchSectionStatus {
  index: number
  title: string
  level: number
  phase: BatchSectionPhase
  content?: string
  taskId?: string
  error?: string
  retryCount?: number
  retryInSeconds?: number
}

/** Progress payload for progressive batch: one section completed */
export interface BatchSectionProgressPayload {
  kind: 'batch-section-complete'
  batchId: string
  sectionIndex: number
  sectionMarkdown: string
  assembledSnapshot: string
  completedCount: number
  totalCount: number
  /** TaskId of the next sub-chapter task (for progress routing) */
  nextTaskId?: string
  /** Index of the next section being generated */
  nextSectionIndex?: number
}

/** Progress payload for progressive batch: all sections done */
export interface BatchCompletePayload {
  kind: 'batch-complete'
  batchId: string
  assembledMarkdown: string
  completedCount: number
  totalCount: number
  failedSections: Array<{ index: number; title: string; error: string }>
}

/** Progress payload for progressive batch: a section is retrying after failure */
export interface BatchSectionRetryingPayload {
  kind: 'batch-section-retrying'
  batchId: string
  sectionIndex: number
  sectionTitle: string
  retryCount: number
  maxRetries: number
  retryInSeconds: number
  /** TaskId of the newly dispatched retry task (for progress routing) */
  newTaskId?: string
}

/** Progress payload for progressive batch: a section failed */
export interface BatchSectionFailedPayload {
  kind: 'batch-section-failed'
  batchId: string
  sectionIndex: number
  sectionTitle: string
  error: string
  completedCount: number
  totalCount: number
}

/** IPC input for chapter:skeleton-generate */
export interface SkeletonGenerateInput {
  projectId: string
  target: ChapterHeadingLocator
}

/** IPC output for chapter:skeleton-generate */
export interface SkeletonGenerateOutput {
  taskId: string
}

/** IPC input for chapter:skeleton-confirm */
export interface SkeletonConfirmInput {
  projectId: string
  sectionId: string
  plan: SkeletonExpandPlan
}

/** IPC input for chapter:batch-generate */
export interface BatchGenerateInput {
  projectId: string
  target: ChapterHeadingLocator
  sectionId: string
}

/** IPC output for chapter:batch-generate (progressive mode returns batchId + first taskId) */
export interface BatchGenerateOutput {
  taskId: string
  batchId?: string
}

/** IPC input for chapter:batch-retry-section */
export interface BatchRetrySectionInput {
  projectId: string
  batchId: string
  /** Section index to retry. If omitted, service auto-detects first failed section. */
  sectionIndex?: number
}

/** IPC output for chapter:batch-retry-section */
export interface BatchRetrySectionOutput {
  taskId: string
  batchId: string
  sectionIndex: number
}

/** IPC input for chapter:batch-skip-section */
export interface BatchSkipSectionInput {
  projectId: string
  batchId: string
  /** Section index to skip. If omitted, service auto-detects first failed section. */
  sectionIndex?: number
}

/** IPC output for chapter:batch-skip-section */
export interface BatchSkipSectionOutput {
  batchId: string
  skippedSectionIndex: number
  nextTaskId?: string
  nextSectionIndex?: number
  /** Assembled markdown of all sections so far (for editor snapshot update) */
  assembledSnapshot?: string
}

export interface ChapterDiagramPatch {
  placeholderId: string
  markdown: string
}

export interface ChapterStreamProgressPayload {
  kind: 'chapter-stream'
  markdown: string
  patch?: ChapterDiagramPatch
}

/** IPC input for chapter:generate */
export interface ChapterGenerateInput {
  projectId: string
  target: ChapterHeadingLocator
}

/** IPC input for chapter:regenerate */
export interface ChapterRegenerateInput {
  projectId: string
  target: ChapterHeadingLocator
  additionalContext: string
}

/** IPC output for chapter:generate and chapter:regenerate */
export interface ChapterGenerateOutput {
  taskId: string
}

/** Status of a single chapter generation task (renderer-side tracking) */
export interface ChapterGenerationStatus {
  target: ChapterHeadingLocator
  phase: ChapterGenerationPhase
  progress: number
  taskId: string
  message?: string
  error?: string
  generatedContent?: string
  baselineDigest?: string
  /** Tracks which operation started this task, so retry uses the correct path */
  operationType?: 'generate' | 'regenerate' | 'skeleton-generate' | 'batch-generate'
  /** Stored for regeneration retry */
  additionalContext?: string
  /** Snapshot of section content at task start, for conflict detection */
  baselineSectionContent?: string
  /** Latest progressively streamed markdown for this section */
  streamedContent?: string
  /** Incremented on each progressive content update */
  streamRevision?: number
  /** Latest incremental diagram patch to apply over the streamed section */
  latestDiagramPatch?: ChapterDiagramPatch
  /** Skeleton plan for skeleton-expand flow */
  skeletonPlan?: SkeletonExpandPlan
  /** Progressive batch orchestration ID */
  batchId?: string
  /** Per-section statuses for progressive batch */
  batchSections?: BatchSectionStatus[]
  /** Whether the chapter section is locked during batch generation */
  locked?: boolean
}
