import { useEffect, useCallback } from 'react'
import { message } from 'antd'
import { useDocumentStore, useProjectStore } from '@renderer/stores'

export function useDocument(projectId: string, flushEditorContent?: () => string | null): void {
  const autoSave = useDocumentStore((s) => s.autoSave)
  const content = useDocumentStore((s) => s.content)
  const saveDocumentSync = useDocumentStore((s) => s.saveDocumentSync)
  const resetDocument = useDocumentStore((s) => s.resetDocument)
  const rootPath = useProjectStore((s) => s.currentProject?.rootPath ?? null)

  // Cmd/Ctrl+S interception: show "已自动保存" toast, don't manual-save (UX-DR27)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (autoSave.lastSavedAt) {
          message.info('已自动保存', 1)
        }
      }
    },
    [autoSave.lastSavedAt]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // beforeunload: force save unsaved content on window close
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const flushedContent = flushEditorContent?.() ?? null
      const hasPendingSerializedChange = flushedContent !== null && flushedContent !== content
      const shouldPersistBeforeClose =
        autoSave.dirty || autoSave.saving || hasPendingSerializedChange

      if (!shouldPersistBeforeClose) {
        return
      }

      if (!rootPath) {
        event.preventDefault()
        event.returnValue = ''
        return
      }

      const didSave = saveDocumentSync(projectId, rootPath, flushedContent ?? content)
      if (!didSave) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [
    autoSave.dirty,
    autoSave.saving,
    content,
    flushEditorContent,
    projectId,
    rootPath,
    saveDocumentSync,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetDocument()
    }
  }, [resetDocument])
}
