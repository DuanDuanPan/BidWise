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
