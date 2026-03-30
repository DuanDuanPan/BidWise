import { useCallback, useEffect, useRef } from 'react'
import { Skeleton, Alert, Button } from 'antd'
import { useDocumentStore } from '@renderer/stores'
import { useDocument } from '@modules/editor/hooks/useDocument'
import { PlateEditor } from './PlateEditor'

interface EditorViewProps {
  projectId: string
}

export function EditorView({ projectId }: EditorViewProps): React.JSX.Element {
  const loading = useDocumentStore((s) => s.loading)
  const error = useDocumentStore((s) => s.error)
  const content = useDocumentStore((s) => s.content)
  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const syncFlushRef = useRef<(() => string) | null>(null)

  const registerSyncFlush = useCallback((flush: (() => string) | null): void => {
    syncFlushRef.current = flush
  }, [])

  const flushEditorContent = useCallback((): string | null => syncFlushRef.current?.() ?? null, [])

  useDocument(projectId, flushEditorContent)

  useEffect(() => {
    loadDocument(projectId)
  }, [projectId, loadDocument])

  if (loading) {
    return (
      <div className="mx-auto max-w-[800px] p-6" data-testid="editor-skeleton">
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[800px] p-6" data-testid="editor-error">
        <Alert
          type="error"
          message="文档加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => loadDocument(projectId)}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto"
      data-testid="editor-view"
      data-editor-scroll-container="true"
    >
      {/* Toolbar area reserved for Story 3.2 */}
      <PlateEditor
        initialContent={content}
        projectId={projectId}
        onSyncFlushReady={registerSyncFlush}
      />
    </div>
  )
}
