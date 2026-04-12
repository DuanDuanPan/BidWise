export interface TerminologyEntry {
  id: string
  sourceTerm: string
  targetTerm: string
  normalizedSourceTerm: string
  category: string | null
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTerminologyInput {
  sourceTerm: string
  targetTerm: string
  category?: string
  description?: string
  isActive?: boolean
}

export interface UpdateTerminologyInput {
  id: string
  sourceTerm?: string
  targetTerm?: string
  category?: string | null
  description?: string | null
  isActive?: boolean
}

export interface TerminologyListFilter {
  searchQuery?: string
  category?: string
  isActive?: boolean
}

export interface BatchCreateTerminologyInput {
  entries: CreateTerminologyInput[]
}

export interface BatchCreateResult {
  created: number
  duplicates: string[]
}

export interface TerminologyReplacement {
  sourceTerm: string
  targetTerm: string
  count: number
}

export interface TerminologyApplyResult {
  content: string
  replacements: TerminologyReplacement[]
  totalReplacements: number
}

export interface TerminologyExportData {
  version: '1.0'
  exportedAt: string
  entries: Array<{
    sourceTerm: string
    targetTerm: string
    category: string | null
    description: string | null
    isActive: boolean
  }>
}

export interface TerminologyExportOutput {
  cancelled: boolean
  outputPath?: string
  entryCount: number
}
