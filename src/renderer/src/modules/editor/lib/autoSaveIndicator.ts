import type { AutoSaveIndicatorProps, AutoSaveIndicatorStatus } from '@modules/editor/types'

export function getAutoSaveIndicatorStatus({
  dirty,
  saving,
  error,
}: AutoSaveIndicatorProps['autoSave']): AutoSaveIndicatorStatus {
  if (error) {
    return 'error'
  }
  if (saving) {
    return 'saving'
  }
  if (dirty) {
    return 'unsaved'
  }
  return 'saved'
}
