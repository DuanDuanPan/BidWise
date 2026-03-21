import type { ParsedTender } from '@shared/analysis-types'

export interface AnalysisViewProps {
  projectId: string
}

export interface TenderUploadZoneProps {
  projectId: string
  disabled?: boolean
}

export interface ParseProgressPanelProps {
  progress: number
  message: string
  onCancel?: () => void
  onViewResult: () => void
  completed: boolean
}

export interface TenderResultSummaryProps {
  parsedTender: ParsedTender
}
