/**
 * Attack checklist shared types — consumed by attack-checklist-service,
 * review-handlers, reviewStore, and UI components (Story 7.5)
 */

import type { FindingSeverity } from './adversarial-types'
import type { ChapterHeadingLocator } from './chapter-types'

// ─── Enums & Primitives ───

export type AttackChecklistItemSeverity = FindingSeverity

export type AttackChecklistItemStatus = 'unaddressed' | 'addressed' | 'dismissed'

export type AttackChecklistStatus = 'generating' | 'generated' | 'failed'

// ─── Domain Models ───

export interface AttackChecklistItem {
  id: string
  checklistId: string
  category: string
  attackAngle: string
  severity: AttackChecklistItemSeverity
  defenseSuggestion: string
  targetSection: string | null
  targetSectionLocator: ChapterHeadingLocator | null
  status: AttackChecklistItemStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AttackChecklist {
  id: string
  projectId: string
  status: AttackChecklistStatus
  items: AttackChecklistItem[]
  generationSource: 'llm' | 'fallback'
  warningMessage: string | null
  generatedAt: string
  createdAt: string
  updatedAt: string
}

// ─── IPC Input/Output ───

export interface GenerateAttackChecklistInput {
  projectId: string
}

export interface UpdateChecklistItemStatusInput {
  itemId: string
  status: AttackChecklistItemStatus
}

// ─── LLM Output ───

export type AttackChecklistLLMOutput = Array<{
  category: string
  attackAngle: string
  severity: string
  defenseSuggestion: string
  targetSection?: string
}>
