import { useCallback, useMemo, useState } from 'react'
import { PlateElement, useEditorRef } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'
import { SyncOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'
import { useSourceAttributionContext } from '@modules/editor/context/useSourceAttributionContext'
import { useDocumentStore } from '@renderer/stores'
import { ChapterGenerateButton } from './ChapterGenerateButton'
import { ChapterGenerationProgress } from './ChapterGenerationProgress'
import { InlineErrorBar } from './InlineErrorBar'
import { RegenerateDialog } from './RegenerateDialog'
import { locatorKey } from '@modules/editor/hooks/useChapterGeneration'
import {
  extractMarkdownHeadings,
  findMarkdownHeading,
  isMarkdownSectionEmpty,
} from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

function extractText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) {
    return (n.children as unknown[]).map(extractText).join('')
  }
  return ''
}

function computeLocator(
  markdown: string,
  title: string,
  level: number,
  elementIndex: number
): ChapterHeadingLocator | null {
  const locator = { title, level: level as 1 | 2 | 3 | 4, occurrenceIndex: elementIndex }
  return findMarkdownHeading(extractMarkdownHeadings(markdown), locator) ? locator : null
}

function getHeadingLevel(elementType: string): number {
  switch (elementType) {
    case 'h1':
      return 1
    case 'h2':
      return 2
    case 'h3':
      return 3
    case 'h4':
      return 4
    default:
      return 0
  }
}

function ChapterAwareHeading(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const text = extractText(element).trim()
  const level = getHeadingLevel(element.type as string)
  const chapterGen = useChapterGenerationContext()
  const content = useDocumentStore((s) => s.content)
  const editor = useEditorRef()
  const [hovering, setHovering] = useState(false)
  const [regenerateOpen, setRegenerateOpen] = useState(false)

  // Compute occurrence index by counting same-title-and-level headings before this element
  const occurrenceIndex = useMemo(() => {
    let count = 0
    for (const node of editor.children) {
      if (node === element) return count
      const nodeType = (node as Record<string, unknown>).type
      if (nodeType === element.type && extractText(node).trim() === text) {
        count++
      }
    }
    return 0
  }, [editor.children, element, text])

  // Compute locator — validate against markdown, include H2-H4
  const locator = useMemo(() => {
    if (!text || level < 2 || level > 4) return null
    return computeLocator(content, text, level, occurrenceIndex)
  }, [content, text, level, occurrenceIndex])

  const sourceAttr = useSourceAttributionContext()

  const statusKey = locator ? locatorKey(locator) : null
  const status = statusKey ? chapterGen?.statuses.get(statusKey) : undefined
  const isGenerating = Boolean(
    status && !['completed', 'failed', 'conflicted'].includes(status.phase)
  )
  const hasFailed = status?.phase === 'failed'
  const sectionState = statusKey && sourceAttr ? sourceAttr.sections.get(statusKey) : undefined

  const followUpProgress = useMemo(() => {
    if (!sectionState) return null
    if (sectionState.attributionPhase === 'running') return 92
    if (sectionState.baselinePhase === 'running') return 96
    return null
  }, [sectionState])

  // Get projectId from the chapter generation context
  const projectId = chapterGen?.currentProjectId

  // Compute secondary note for baseline validation progress
  const secondaryNote = useMemo(() => {
    if (!sectionState) return undefined

    if (sectionState.attributionPhase === 'running') return '来源标注分析中...'
    if (sectionState.baselinePhase === 'running') return '基线验证中...'
    if (sectionState.attributionPhase === 'completed' && sectionState.baselinePhase === 'completed')
      return '来源标注与基线验证已完成'
    return undefined
  }, [sectionState])

  const progressPhase =
    isGenerating && status ? status.phase : followUpProgress !== null ? 'annotating-sources' : null
  const progressValue = isGenerating && status ? status.progress : followUpProgress
  const isBusy = progressPhase !== null

  // Determine if chapter content is empty or guidance-only
  const chapterEmpty = useMemo(() => {
    if (!locator) return true
    return isMarkdownSectionEmpty(content, locator)
  }, [content, locator])

  const handleGenerate = useCallback(() => {
    if (!chapterGen || !locator) return
    void chapterGen.startGeneration(locator)
  }, [chapterGen, locator])

  const handleRegenerate = useCallback(
    (additionalContext: string) => {
      if (!chapterGen || !locator) return
      void chapterGen.startRegeneration(locator, additionalContext)
      setRegenerateOpen(false)
    },
    [chapterGen, locator]
  )

  const handleRetry = useCallback(() => {
    if (!chapterGen || !locator) return
    void chapterGen.retry(locator)
  }, [chapterGen, locator])

  const handleDismiss = useCallback(() => {
    if (!chapterGen || !locator) return
    chapterGen.dismissError(locator)
  }, [chapterGen, locator])

  const canAct = chapterGen && locator && projectId && !isBusy && !hasFailed && level >= 2
  const showGenerateButton = canAct && chapterEmpty
  const showRegenerateButton = canAct && !chapterEmpty

  return (
    <div
      data-heading-text={text}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <PlateElement {...props}>
        <span className="relative inline-flex items-center gap-1">
          {children}
          {showGenerateButton && hovering && (
            <span contentEditable={false} className="inline-flex">
              <ChapterGenerateButton onClick={handleGenerate} />
            </span>
          )}
          {showRegenerateButton && hovering && (
            <span contentEditable={false} className="inline-flex">
              <Tooltip title="重新生成章节" placement="top">
                <Button
                  type="text"
                  size="small"
                  icon={<SyncOutlined />}
                  onClick={() => setRegenerateOpen(true)}
                  className="text-text-tertiary hover:text-brand"
                  aria-label="重新生成章节"
                  data-testid="chapter-regenerate-btn"
                />
              </Tooltip>
            </span>
          )}
        </span>
      </PlateElement>

      {progressPhase !== null && progressValue !== null && (
        <div contentEditable={false} className="my-2">
          <ChapterGenerationProgress
            phase={progressPhase}
            progress={progressValue}
            secondaryNote={secondaryNote}
          />
        </div>
      )}

      {hasFailed && status?.error && (
        <div contentEditable={false} className="my-2">
          <InlineErrorBar
            error={status.error}
            onRetry={handleRetry}
            onManualEdit={handleDismiss}
            onSkip={handleDismiss}
          />
        </div>
      )}

      {locator && (
        <RegenerateDialog
          open={regenerateOpen}
          chapterTitle={text}
          onConfirm={handleRegenerate}
          onCancel={() => setRegenerateOpen(false)}
        />
      )}
    </div>
  )
}

export function OutlineHeadingElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const text = extractText(element).trim()

  return (
    <div data-heading-text={text}>
      <PlateElement {...props}>{children}</PlateElement>
    </div>
  )
}

export function ChapterHeadingElement(props: PlateElementProps): React.JSX.Element {
  return <ChapterAwareHeading {...props} />
}

export const OutlineH1Element = OutlineHeadingElement
export const OutlineH2Element = OutlineHeadingElement
export const OutlineH3Element = OutlineHeadingElement
export const OutlineH4Element = OutlineHeadingElement
