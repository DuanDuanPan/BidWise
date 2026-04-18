import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPlateEditor, Plate, PlateContent, usePlateEditor } from 'platejs/react'
import type { Value } from 'platejs'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { deserializeFromMarkdown, serializeToMarkdown } from '@modules/editor/serializer'
import { useDocumentStore } from '@renderer/stores'
import {
  createContentDigest,
  replaceMarkdownSection,
  extractMarkdownHeadings,
  findMarkdownHeading,
} from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { DocumentSaveDebugContext } from '@shared/ipc-types'
import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'
import { MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'
import { MERMAID_DEFAULT_TEMPLATE } from '@shared/mermaid-types'
import { AI_DIAGRAM_ELEMENT_TYPE } from '@modules/editor/plugins/aiDiagramPlugin'
import type { AiDiagramElementData } from '@shared/ai-diagram-types'

export type ReplaceSectionFn = (target: ChapterHeadingLocator, markdownContent: string) => boolean
export type InsertDrawioFn = () => void
export type InsertMermaidFn = () => void
export type InsertAiDiagramFn = (data: AiDiagramElementData) => void
export type UpdateAiDiagramFn = (diagramId: string, data: Partial<AiDiagramElementData>) => boolean
export type InsertAssetFn = (
  content: string,
  options?: { targetSection?: ChapterHeadingLocator | null }
) => boolean

interface PlateEditorProps {
  initialContent: string
  projectId: string
  onSyncFlushReady?: (flush: (() => string) | null) => void
  onReplaceSectionReady?: (fn: ReplaceSectionFn | null) => void
  onInsertDrawioReady?: (fn: InsertDrawioFn | null) => void
  onInsertMermaidReady?: (fn: InsertMermaidFn | null) => void
  onInsertAiDiagramReady?: (fn: InsertAiDiagramFn | null) => void
  onUpdateAiDiagramReady?: (fn: UpdateAiDiagramFn | null) => void
  onInsertAssetReady?: (fn: InsertAssetFn | null) => void
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10)
}

const plateContentClassName = [
  'mx-auto max-w-[800px] text-[14px] leading-[1.9] text-[#4E5B6A] focus:outline-none',
  '[&_p]:my-4 [&_p]:text-[14px] [&_p]:leading-[1.9] [&_p]:text-[#4E5B6A]',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-[#4E5B6A]',
  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-[#4E5B6A]',
  '[&_li]:my-2 [&_li]:pl-1 [&_li]:leading-[1.85]',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-[#91Caff] [&_blockquote]:bg-[#F5F9FF] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-[#4E5B6A]',
  '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
  '[&_thead]:bg-[#F5F5F5]',
  '[&_th]:border [&_th]:border-[#D9D9D9] [&_th]:px-3 [&_th]:py-2 [&_th]:align-top [&_th]:font-semibold [&_th]:text-[#1F1F1F]',
  '[&_td]:border [&_td]:border-[#D9D9D9] [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#1F2937] [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:text-[#F5F5F5]',
  '[&_code]:rounded [&_code]:bg-[#F5F5F5] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through',
].join(' ')

const plateContentStyle = {
  fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  minHeight: '100%',
  padding: '24px 0',
}

function findSuspiciousHeadingLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .flatMap((line, index) => (/^(#{1,4})\s+.*>\s*\S/.test(line) ? [`${index + 1}: ${line}`] : []))
    .slice(0, 6)
}

function collectHeadingWindow(
  markdown: string,
  locator: ChapterHeadingLocator,
  label: 'target' | 'next'
): string[] {
  const lines = markdown.split('\n')
  const headings = extractMarkdownHeadings(markdown)
  const heading = findMarkdownHeading(headings, locator)
  if (!heading) return []

  const start = Math.max(0, heading.lineIndex - 1)
  const end = Math.min(lines.length, heading.lineIndex + 4)
  return [
    `[${label}] ${locator.level}:${locator.title}:${locator.occurrenceIndex}`,
    ...lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`),
  ]
}

function collectSectionWindows(markdown: string, target?: ChapterHeadingLocator): string[] {
  if (!target) return []

  const headings = extractMarkdownHeadings(markdown)
  const targetHeading = findMarkdownHeading(headings, target)
  if (!targetHeading) return []

  const windows = collectHeadingWindow(markdown, target, 'target')
  const targetIndex = headings.findIndex(
    (heading) =>
      heading.lineIndex === targetHeading.lineIndex &&
      heading.level === targetHeading.level &&
      heading.occurrenceIndex === targetHeading.occurrenceIndex
  )
  const nextHeading = headings[targetIndex + 1]
  if (!nextHeading) return windows

  return [
    ...windows,
    ...collectHeadingWindow(
      markdown,
      {
        title: nextHeading.title,
        level: nextHeading.level,
        occurrenceIndex: nextHeading.occurrenceIndex,
      },
      'next'
    ),
  ]
}

function buildSaveDebugContext(
  source: string,
  markdown: string,
  target?: ChapterHeadingLocator,
  extra?: Partial<DocumentSaveDebugContext>
): DocumentSaveDebugContext {
  return {
    source,
    target: target ?? null,
    contentDigest: createContentDigest(markdown),
    contentLength: markdown.length,
    sectionWindow: collectSectionWindows(markdown, target),
    suspiciousHeadings: findSuspiciousHeadingLines(markdown),
    ...extra,
  }
}

function emitSaveDebug(context: DocumentSaveDebugContext): void {
  console.info(`[editor-save-debug] ${context.source}`, context)
}

export function PlateEditor({
  initialContent,
  projectId,
  onSyncFlushReady,
  onReplaceSectionReady,
  onInsertDrawioReady,
  onInsertMermaidReady,
  onInsertAiDiagramReady,
  onUpdateAiDiagramReady,
  onInsertAssetReady,
}: PlateEditorProps): React.JSX.Element {
  const updateContent = useDocumentStore((s) => s.updateContent)
  // Story 11.3: freeze the editor while a chapter-structure mutation is in
  // flight. Without this, the user can keep typing during the mutation
  // window — those characters show briefly, then vanish when the returning
  // snapshot triggers `editor.tf.setValue(initialNodes)` below.
  const editingLocked = useDocumentStore((s) => s.editingLocked)
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
    const prevDigest = createContentDigest(latestSerializedMarkdownRef.current)
    const newDigest = createContentDigest(markdown)
    console.debug(
      `[gen-debug:serialize] debounced-serialize prevDigest=${prevDigest}, newDigest=${newDigest}, lenDelta=${markdown.length - latestSerializedMarkdownRef.current.length}, changed=${prevDigest !== newDigest}`
    )
    latestSerializedMarkdownRef.current = markdown
    const debugContext = buildSaveDebugContext('plate:debounced-serialize', markdown)
    emitSaveDebug(debugContext)
    updateContent(markdown, projectId, { debugContext })
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

    const prevLen = latestSerializedMarkdownRef.current.length
    const nextLen = initialContent.length
    if (hasAppliedExternalContentRef.current && prevLen > 200 && nextLen < 10) {
      console.warn(
        `[plate-editor] external setValue shrink: prevLen=${prevLen}, nextLen=${nextLen}, projectId=${projectId}`
      )
    }

    editor.tf.setValue(initialNodes)
    hasAppliedExternalContentRef.current = true
    latestSerializedMarkdownRef.current = initialContent
  }, [editor, initialContent, initialNodes, projectId])

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
    const debugContext = buildSaveDebugContext('plate:flush-sync', markdown)
    emitSaveDebug(debugContext)
    updateContent(markdown, projectId, { scheduleSave: false, debugContext })
    return markdown
  }, [clearPendingSerialization, editor, projectId, updateContent])

  const suppressSelectionAutoScroll = useCallback((): void => {
    // Slate restores the previous DOM selection on some click paths and, by default,
    // scrolls that stale caret back into view. We suppress that auto-scroll and let
    // explicit chapter navigation plus direct user scrolling control the viewport.
  }, [])

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
      let candidateIdx = -1
      for (let ci = 0; ci < markdownCandidates.length; ci++) {
        const markdown = markdownCandidates[ci]
        if (!markdown) continue
        newMarkdown = replaceMarkdownSection(markdown, target, markdownContent)
        if (newMarkdown) {
          candidateIdx = ci
          break
        }
      }

      if (!newMarkdown) {
        console.warn(
          `[gen-debug:replaceSection] "${target.title}" heading not found in any candidate`
        )
        return false
      }

      console.debug(
        `[gen-debug:replaceSection] "${target.title}" matched candidate=${candidateIdx}, insertLen=${markdownContent.length}, newDocLen=${newMarkdown.length}`
      )

      // Re-set editor and persist
      const tempEditor = createPlateEditor({ plugins: editorPlugins })
      const newNodes = deserializeFromMarkdown(tempEditor, newMarkdown) as Value
      editor.tf.setValue(newNodes)
      // Persist the editor's canonical markdown form so downstream baseline/conflict
      // detection sees the same content that Plate will later debounce-save.
      let persistedMarkdown = newMarkdown
      try {
        persistedMarkdown = serializeToMarkdown(editor)
      } catch (error) {
        console.warn(
          `[gen-debug:replaceSection] "${target.title}" canonical serialize failed; falling back to pre-serialized markdown`,
          error
        )
      }
      // The editor already has the updated nodes locally. Mark this content as applied
      // so the next store-driven prop sync does not hydrate the same markdown again.
      hasAppliedExternalContentRef.current = true
      latestLoadedMarkdownRef.current = persistedMarkdown
      latestSerializedMarkdownRef.current = persistedMarkdown
      const debugContext = buildSaveDebugContext(
        'plate:replace-section',
        persistedMarkdown,
        target,
        {
          note: `insertedContentLength=${markdownContent.length}; persistedContentLength=${persistedMarkdown.length}`,
          candidateDigests: markdownCandidates
            .filter((markdown): markdown is string => Boolean(markdown))
            .map((markdown, index) => `candidate-${index}:${createContentDigest(markdown)}`),
        }
      )
      emitSaveDebug(debugContext)
      updateContent(persistedMarkdown, projectId, { debugContext })
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
        source: MERMAID_DEFAULT_TEMPLATE,
        caption: '',
        svgPersisted: false,
        children: [{ text: '' }],
      },
      { at, select: true }
    )
  }, [editor])

  const insertAiDiagram: InsertAiDiagramFn = useCallback(
    (data: AiDiagramElementData) => {
      const at = editor.selection ?? lastSelectionRef.current ?? [editor.children.length]

      editor.tf.insertNodes(
        {
          type: AI_DIAGRAM_ELEMENT_TYPE,
          ...data,
          svgPersisted: false,
          children: [{ text: '' }],
        },
        { at, select: true }
      )
    },
    [editor]
  )

  const updateAiDiagram: UpdateAiDiagramFn = useCallback(
    (diagramId: string, data: Partial<AiDiagramElementData>) => {
      for (let i = 0; i < editor.children.length; i++) {
        const child = editor.children[i] as Record<string, unknown>
        if (child.type === AI_DIAGRAM_ELEMENT_TYPE && child.diagramId === diagramId) {
          editor.tf.setNodes(data, { at: [i] })
          return true
        }
      }
      return false
    },
    [editor]
  )

  const insertAsset: InsertAssetFn = useCallback(
    (assetContent: string, options?: { targetSection?: ChapterHeadingLocator | null }) => {
      // Build paragraph nodes from content (split on double newlines)
      const paragraphs = assetContent
        .split(/\n\n+/)
        .filter((p) => p.trim())
        .map((p) => ({ type: 'p' as const, children: [{ text: p.trim() }] }))

      if (paragraphs.length === 0) return false

      // Priority 1: current editor selection
      if (editor.selection) {
        editor.tf.insertNodes(paragraphs, { at: editor.selection })
        return true
      }

      // Priority 2: last known selection
      if (lastSelectionRef.current) {
        editor.tf.insertNodes(paragraphs, { at: lastSelectionRef.current })
        return true
      }

      // Priority 3: end of target section
      if (options?.targetSection) {
        const currentMarkdown = serializeToMarkdown(editor)
        const headings = extractMarkdownHeadings(currentMarkdown)
        const heading = findMarkdownHeading(headings, options.targetSection)
        if (heading) {
          // Find the node index in editor.children corresponding to the section end
          const lines = currentMarkdown.split('\n')
          let endLineIndex = lines.length
          for (const candidate of headings) {
            if (candidate.lineIndex > heading.lineIndex && candidate.level <= heading.level) {
              endLineIndex = candidate.lineIndex
              break
            }
          }
          // Approximate: insert at the proportional editor node position
          const ratio = endLineIndex / Math.max(lines.length, 1)
          const insertIndex = Math.min(
            Math.floor(ratio * editor.children.length),
            editor.children.length
          )
          editor.tf.insertNodes(paragraphs, { at: [insertIndex] })
          return true
        }
      }

      // Priority 4: end of document
      editor.tf.insertNodes(paragraphs, { at: [editor.children.length] })
      return true
    },
    [editor]
  )

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
    onInsertAiDiagramReady?.(insertAiDiagram)
    return () => onInsertAiDiagramReady?.(null)
  }, [insertAiDiagram, onInsertAiDiagramReady])

  useEffect(() => {
    onUpdateAiDiagramReady?.(updateAiDiagram)
    return () => onUpdateAiDiagramReady?.(null)
  }, [updateAiDiagram, onUpdateAiDiagramReady])

  useEffect(() => {
    onInsertAssetReady?.(insertAsset)
    return () => onInsertAssetReady?.(null)
  }, [insertAsset, onInsertAssetReady])

  useEffect(() => {
    return () => {
      clearPendingSerialization()
    }
  }, [clearPendingSerialization])

  return (
    <Plate editor={editor} readOnly={editingLocked} onValueChange={handleValueChange}>
      <PlateContent
        className={plateContentClassName}
        style={plateContentStyle}
        placeholder="开始撰写方案..."
        scrollSelectionIntoView={suppressSelectionAutoScroll}
        data-testid="plate-editor-content"
      />
    </Plate>
  )
}
