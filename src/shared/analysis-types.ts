/**
 * Analysis module shared types — tender import & parsing (Story 2.3)
 */

/** Supported tender file formats */
export type TenderFormat = 'pdf' | 'docx' | 'doc'

/** Metadata about an imported tender document */
export interface TenderMeta {
  originalFileName: string
  format: TenderFormat
  fileSize: number
  pageCount: number
  importedAt: string
  parseCompletedAt?: string
}

/** A detected section within a tender document */
export interface TenderSection {
  id: string
  title: string
  content: string
  pageStart: number
  pageEnd: number
  level: number
}

/** Full parsed tender result — input for downstream stories (2.5, 2.6) */
export interface ParsedTender {
  meta: TenderMeta
  sections: TenderSection[]
  rawText: string
  totalPages: number
  /** true when low text density detected (scanned pages) — triggers OCR prompt in Story 2.4 */
  hasScannedContent: boolean
}

/** IPC input for analysis:import-tender */
export interface ImportTenderInput {
  projectId: string
  filePath: string
}

/** IPC output for analysis:import-tender — async, returns task ID immediately */
export interface ImportTenderResult {
  taskId: string
}

/** IPC input for analysis:get-tender */
export interface GetTenderInput {
  projectId: string
}

// ─── Story 2.5: Requirement Extraction & Scoring Model ───

export type RequirementCategory =
  | 'technical'
  | 'implementation'
  | 'service'
  | 'qualification'
  | 'commercial'
  | 'other'

export interface RequirementItem {
  id: string
  sequenceNumber: number
  description: string
  sourcePages: number[]
  category: RequirementCategory
  priority: 'high' | 'medium' | 'low'
  status: 'extracted' | 'confirmed' | 'modified' | 'deleted'
}

export interface ScoringSubItem {
  id: string
  name: string
  maxScore: number
  description: string
  sourcePages: number[]
}

export interface ScoringCriterion {
  id: string
  category: string
  maxScore: number
  weight: number
  subItems: ScoringSubItem[]
  reasoning: string
  status: 'extracted' | 'confirmed' | 'modified'
}

export interface ScoringModel {
  projectId: string
  totalScore: number
  criteria: ScoringCriterion[]
  extractedAt: string
  confirmedAt: string | null
  version: number
}

export interface ExtractionResult {
  requirements: RequirementItem[]
  scoringModel: ScoringModel
}

export interface ExtractRequirementsInput {
  projectId: string
}

export interface ExtractionTaskResult {
  taskId: string
}

export interface GetRequirementsInput {
  projectId: string
}

export interface GetScoringModelInput {
  projectId: string
}

export interface UpdateRequirementInput {
  id: string
  patch: Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
}

export interface UpdateScoringModelInput {
  projectId: string
  criterionId: string
  patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
}

export interface ConfirmScoringModelInput {
  projectId: string
}

// ─── Story 2.6: Mandatory Item Detection ───

export type MandatoryItemStatus = 'detected' | 'confirmed' | 'dismissed'

export interface MandatoryItem {
  id: string
  content: string
  sourceText: string
  sourcePages: number[]
  confidence: number
  status: MandatoryItemStatus
  linkedRequirementId: string | null
  detectedAt: string
  updatedAt: string
}

export interface MandatoryItemSummary {
  total: number
  confirmed: number
  dismissed: number
  pending: number
}

export interface MandatoryItemsSnapshot {
  projectId: string
  items: MandatoryItem[]
  detectedAt: string
}

export interface DetectMandatoryInput {
  projectId: string
}

export interface DetectMandatoryResult {
  taskId: string
}

export interface GetMandatoryItemsInput {
  projectId: string
}

export interface GetMandatorySummaryInput {
  projectId: string
}

export interface UpdateMandatoryItemInput {
  id: string
  patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
}

export interface AddMandatoryItemInput {
  projectId: string
  content: string
  sourceText?: string
  sourcePages?: number[]
}
