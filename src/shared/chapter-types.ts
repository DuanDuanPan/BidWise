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

/** Phase state machine for chapter generation */
export type ChapterGenerationPhase =
  | 'queued'
  | 'analyzing'
  | 'matching-assets'
  | 'generating'
  | 'annotating-sources'
  | 'conflicted'
  | 'completed'
  | 'failed'

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
}
