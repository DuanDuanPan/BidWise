import type { AutoSaveState } from '@shared/models/proposal'

export interface EditorViewProps {
  projectId: string
}

export interface PlateEditorProps {
  initialContent: string
  projectId: string
}

export type AutoSaveIndicatorStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export interface AutoSaveIndicatorProps {
  autoSave: AutoSaveState
  onRetry?: () => void
}
