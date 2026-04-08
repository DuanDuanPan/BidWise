import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPlateEditor, Plate, PlateContent, usePlateEditor } from 'platejs/react'
import type { Value } from 'platejs'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { deserializeFromMarkdown, serializeToMarkdown } from '@modules/editor/serializer'
import { useDocumentStore } from '@renderer/stores'
import { replaceMarkdownSection } from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'
import { MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'

export type ReplaceSectionFn = (target: ChapterHeadingLocator, markdownContent: string) => boolean
export type InsertDrawioFn = () => void
export type InsertMermaidFn = () => void

interface PlateEditorProps {
  initialContent: string
  projectId: string
  onSyncFlushReady?: (flush: (() => string) | null) => void
  onReplaceSectionReady?: (fn: ReplaceSectionFn | null) => void
  onInsertDrawioReady?: (fn: InsertDrawioFn | null) => void
  onInsertMermaidReady?: (fn: InsertMermaidFn | null) => void
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function PlateEditor({
  initialContent,
  projectId,
  onSyncFlushReady,
  onReplaceSectionReady,
  onInsertDrawioReady,
  onInsertMermaidReady,
}: PlateEditorProps): React.JSX.Element {
  const updateContent = useDocumentStore((s) => s.updateContent)
  const serializeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleCallbackRef = useRef<number | null>(null)
  const latestLoadedMarkdownRef = useRef(initialContent)
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
    latestLoadedMarkdownRef.current = initialContent
  }, [initialContent])

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

  /**
   * Replace a section's content by locating its heading in the current markdown,
   * splicing in new content, and re-setting the editor value.
   */
  const replaceSectionContent: ReplaceSectionFn = useCallback(
    (target: ChapterHeadingLocator, markdownContent: string) => {
      clearPendingSerialization()

      const markdownCandidates = [
        serializeToMarkdown(editor),
        latestLoadedMarkdownRef.current,
        latestSerializedMarkdownRef.current,
      ]

      let newMarkdown: string | null = null
      for (const markdown of markdownCandidates) {
        if (!markdown) continue
        newMarkdown = replaceMarkdownSection(markdown, target, markdownContent)
        if (newMarkdown) break
      }

      if (!newMarkdown) return false

      // Re-set editor and persist
      const tempEditor = createPlateEditor({ plugins: editorPlugins })
      const newNodes = deserializeFromMarkdown(tempEditor, newMarkdown) as Value
      editor.tf.setValue(newNodes)
      hasAppliedExternalContentRef.current = false
      latestLoadedMarkdownRef.current = newMarkdown
      latestSerializedMarkdownRef.current = newMarkdown
      updateContent(newMarkdown, projectId)
      return true
    },
    [clearPendingSerialization, editor, projectId, updateContent]
  )

  // Track the latest non-empty selection for insert operations
  const lastSelectionRef = useRef(editor.selection)

  useEffect(() => {
    if (editor.selection) {
      lastSelectionRef.current = editor.selection
    }
  })

  const insertDrawio: InsertDrawioFn = useCallback(() => {
    // Use current selection, last known selection, or fall back to end of document
    const at = editor.selection ?? lastSelectionRef.current ?? [editor.children.length]

    const shortId = generateShortId()
    const diagramId = crypto.randomUUID()
    const assetFileName = `diagram-${shortId}.drawio`

    editor.tf.insertNodes(
      {
        type: DRAWIO_ELEMENT_TYPE,
        diagramId,
        assetFileName,
        caption: '',
        children: [{ text: '' }],
      },
      { at, select: true }
    )
  }, [editor])

  const insertMermaid: InsertMermaidFn = useCallback(() => {
    const at = editor.selection ?? lastSelectionRef.current ?? [editor.children.length]

    const shortId = generateShortId()
    const diagramId = crypto.randomUUID()
    const assetFileName = `mermaid-${shortId}.svg`

    editor.tf.insertNodes(
      {
        type: MERMAID_ELEMENT_TYPE,
        diagramId,
        assetFileName,
        source: '',
        caption: '',
        children: [{ text: '' }],
      },
      { at, select: true }
    )
  }, [editor])

  useEffect(() => {
    onReplaceSectionReady?.(replaceSectionContent)
    return () => onReplaceSectionReady?.(null)
  }, [replaceSectionContent, onReplaceSectionReady])

  useEffect(() => {
    onSyncFlushReady?.(flushEditorContent)
    return () => onSyncFlushReady?.(null)
  }, [flushEditorContent, onSyncFlushReady])

  useEffect(() => {
    onInsertDrawioReady?.(insertDrawio)
    return () => onInsertDrawioReady?.(null)
  }, [insertDrawio, onInsertDrawioReady])

  useEffect(() => {
    onInsertMermaidReady?.(insertMermaid)
    return () => onInsertMermaidReady?.(null)
  }, [insertMermaid, onInsertMermaidReady])

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
