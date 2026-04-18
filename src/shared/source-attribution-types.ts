/**
 * Source attribution & baseline validation shared types (Story 3.5).
 * Consumed by source-attribution-service, IPC handlers, renderer hooks/components.
 */

import type { ChapterHeadingLocator } from './chapter-types'

// ─── Source types ───

export type SourceType =
  | 'asset-library'
  | 'knowledge-base'
  | 'ai-inference'
  | 'no-source'
  | 'user-edited'

// ─── Paragraph model ───

export interface RenderableParagraph {
  paragraphIndex: number
  text: string
  digest: string
}

// ─── Source Attribution ───

export interface SourceAttribution {
  id: string
  /** Story 11.1: canonical project-level chapter UUID. Optional for legacy v1. */
  sectionId?: string
  sectionLocator: ChapterHeadingLocator
  paragraphIndex: number
  paragraphDigest: string
  sourceType: SourceType
  sourceRef?: string
  snippet?: string
  confidence: number
}

// ─── Baseline Validation ───

export interface BaselineValidation {
  id: string
  /** Story 11.1: canonical project-level chapter UUID. Optional for legacy v1. */
  sectionId?: string
  sectionLocator: ChapterHeadingLocator
  paragraphIndex: number
  claim: string
  claimDigest: string
  baselineRef?: string
  matched: boolean
  mismatchReason?: string
}

// ─── Aggregated result ───

export interface SourceAttributionResult {
  attributions: SourceAttribution[]
  baselineValidations: BaselineValidation[]
}

// ─── IPC input/output types ───

export interface AttributeSourcesInput {
  projectId: string
  target: ChapterHeadingLocator
  content: string
}

export interface ValidateBaselineInput {
  projectId: string
  target: ChapterHeadingLocator
  content: string
}

export interface GetSourceAttributionsInput {
  projectId: string
  target: ChapterHeadingLocator
}

export interface SourceTaskOutput {
  taskId: string
}

export interface GetSourceAttributionsOutput {
  attributions: SourceAttribution[]
  baselineValidations: BaselineValidation[]
}
