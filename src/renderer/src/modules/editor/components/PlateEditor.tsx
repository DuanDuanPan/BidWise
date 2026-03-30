import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPlateEditor, Plate, PlateContent, usePlateEditor } from 'platejs/react'
import type { Value } from 'platejs'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { deserializeFromMarkdown, serializeToMarkdown } from '@modules/editor/serializer'
import { useDocumentStore } from '@renderer/stores'

interface PlateEditorProps {
  initialContent: string
  projectId: string
  onSyncFlushReady?: (flush: (() => string) | null) => void
}

export function PlateEditor({
  initialContent,
  projectId,
  onSyncFlushReady,
}: PlateEditorProps): React.JSX.Element {
  const updateContent = useDocumentStore((s) => s.updateContent)
  const serializeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleCallbackRef = useRef<number | null>(null)
  const latestSerializedMarkdownRef = useRef(initialContent)
  const hasAppliedExternalContentRef = useRef(false)

  // Deserialize markdown → Plate nodes using a temporary editor instance
  const initialNodes = useMemo(() => {
    const tempEditor = createPlateEditor({ plugins: editorPlugins })
    return deserializeFromMarkdown(tempEditor, initialContent) as Value
  }, [initialContent])

  const editor = usePlateEditor({
    plugins: editorPlugins,
  })

  const clearPendingSerialization = useCallback((): void => {
    if (serializeTimerRef.current) {
      clearTimeout(serializeTimerRef.current)
      serializeTimerRef.current = null
    }
    if (idleCallbackRef.current !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackRef.current)
      idleCallbackRef.current = null
    }
  }, [])

  const commitSerializedMarkdown = useCallback((): string => {
    const markdown = serializeToMarkdown(editor)
    latestSerializedMarkdownRef.current = markdown
    updateContent(markdown, projectId)
    return markdown
  }, [editor, projectId, updateContent])

  useEffect(() => {
    if (
      hasAppliedExternalContentRef.current &&
      latestSerializedMarkdownRef.current === initialContent
    ) {
      return
    }

    editor.tf.setValue(initialNodes)
    hasAppliedExternalContentRef.current = true
    latestSerializedMarkdownRef.current = initialContent
  }, [editor, initialContent, initialNodes])

  const handleValueChange = useCallback(
    ({ value: _value }: { editor: unknown; value: Value }) => {
      clearPendingSerialization()
      serializeTimerRef.current = setTimeout(() => {
        const runSerialization = (): void => {
          idleCallbackRef.current = null
          commitSerializedMarkdown()
        }

        if (typeof window.requestIdleCallback === 'function') {
          idleCallbackRef.current = window.requestIdleCallback(runSerialization, { timeout: 150 })
          return
        }

        runSerialization()
      }, 300)
    },
    [clearPendingSerialization, commitSerializedMarkdown]
  )

  const flushEditorContent = useCallback((): string => {
    clearPendingSerialization()

    const markdown = serializeToMarkdown(editor)
    latestSerializedMarkdownRef.current = markdown
    updateContent(markdown, projectId, { scheduleSave: false })
    return markdown
  }, [clearPendingSerialization, editor, projectId, updateContent])

  useEffect(() => {
    onSyncFlushReady?.(flushEditorContent)
    return () => onSyncFlushReady?.(null)
  }, [flushEditorContent, onSyncFlushReady])

  useEffect(() => {
    return () => {
      clearPendingSerialization()
    }
  }, [clearPendingSerialization])

  return (
    <Plate editor={editor} onValueChange={handleValueChange}>
      <PlateContent
        className="mx-auto max-w-[800px] text-sm leading-[1.8] focus:outline-none [&_h1]:text-2xl [&_h1]:leading-[1.4] [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:leading-[1.4] [&_h2]:font-semibold [&_h3]:text-base [&_h3]:leading-[1.5] [&_h3]:font-semibold [&_h4]:text-sm [&_h4]:leading-[1.5] [&_h4]:font-semibold"
        style={{
          fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
          minHeight: '100%',
          padding: '24px 0',
        }}
        placeholder="开始撰写方案..."
        data-testid="plate-editor-content"
      />
    </Plate>
  )
}
