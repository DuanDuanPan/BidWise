import { useCallback, useMemo, useState } from 'react'
import { PlateElement, useEditorRef } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'
import { SyncOutlined, BranchesOutlined } from '@ant-design/icons'
import { App, Button, List, Modal, Progress, Tag, Tooltip } from 'antd'
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
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import { resolveSectionIdFromLocator } from '@shared/chapter-identity'
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

const headingClassNames: Record<number, string> = {
  1: [
    'mb-6 mt-10 rounded-2xl border border-[#D7E5FF]',
    'bg-[linear-gradient(90deg,_#F7FAFF_0%,_#FFFFFF_85%)] px-5 py-4',
    'text-[22px] font-semibold leading-[1.35] tracking-[0.01em] text-[#102A43]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
  ].join(' '),
  2: 'mb-4 mt-8 border-b border-[#D8E4F0] pb-2 text-[18px] font-semibold leading-[1.45] text-[#16324F]',
  3: 'mb-3 mt-6 border-l-2 border-[#8FB8FF] pl-3 text-[15px] font-semibold leading-[1.6] text-[#284B73]',
  4: 'mb-2 mt-4 text-[14px] font-semibold leading-[1.6] tracking-[0.02em] text-[#4A5B71]',
}

function getHeadingClassName(level: number): string {
  return headingClassNames[level] ?? headingClassNames[4]
}

function ChapterAwareHeading(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const text = extractText(element).trim()
  const level = getHeadingLevel(element.type as string)
  const chapterGen = useChapterGenerationContext()
  const content = useDocumentStore((s) => s.content)
  const sectionIndex = useDocumentStore((s) => s.sectionIndex)
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

  // Compute locator — validate against markdown, include H1-H4
  const locator = useMemo(() => {
    if (!text || level < 1 || level > 4) return null
    return computeLocator(content, text, level, occurrenceIndex)
  }, [content, text, level, occurrenceIndex])

  // Story 11.1: bridge to canonical UUID when sectionIndex is available.
  // Persistence callers (skeletonConfirm) prefer this over locator keys.
  const resolvedSectionId = useMemo(() => {
    if (!locator || sectionIndex.length === 0) return undefined
    return resolveSectionIdFromLocator(sectionIndex, locator)
  }, [locator, sectionIndex])

  const sourceAttr = useSourceAttributionContext()

  const statusKey = locator ? locatorKey(locator) : null
  const status = statusKey ? chapterGen?.statuses.get(statusKey) : undefined
  const isGenerating = Boolean(
    status && !['completed', 'failed', 'conflicted'].includes(status.phase)
  )
  const hasFailed =
    status?.phase === 'failed' || (status?.phase === 'batch-generating' && Boolean(status?.error))
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

  const { modal: appModal } = App.useApp()
  const [skeletonPreviewOpen, setSkeletonPreviewOpen] = useState(false)

  const handleGenerate = useCallback(() => {
    if (!chapterGen || !locator) return
    void chapterGen.startGeneration(locator)
  }, [chapterGen, locator])

  const handleSkeletonGenerate = useCallback(() => {
    if (!chapterGen || !locator) return

    // F9: overwrite confirmation when chapter has content
    if (!chapterEmpty) {
      appModal.confirm({
        title: '确认分治生成',
        content: '该章节已有内容，分治生成将替换现有内容，是否继续？',
        okText: '继续',
        cancelText: '取消',
        onOk: () => {
          void chapterGen.startSkeletonGenerate(locator)
        },
      })
      return
    }

    void chapterGen.startSkeletonGenerate(locator)
  }, [chapterGen, locator, chapterEmpty, appModal])

  const handleConfirmAndBatch = useCallback(() => {
    if (!chapterGen || !locator || !status?.skeletonPlan) return
    // Story 11.1: prefer UUID `sectionId` when resolvable so
    // `confirmedSkeletons` is keyed canonically. Fall back to locator key for
    // brand-new headings not yet present in sectionIndex — main-side
    // `_normalizeSectionId` handles both shapes.
    const sectionId = resolvedSectionId ?? locatorKey(locator)
    const plan = { ...status.skeletonPlan, confirmedAt: new Date().toISOString() }
    void chapterGen.confirmSkeleton(locator, sectionId, plan).then((confirmed) => {
      if (confirmed) {
        void chapterGen.startBatchGenerate(locator, sectionId)
      }
    })
    setSkeletonPreviewOpen(false)
  }, [chapterGen, locator, resolvedSectionId, status])

  const handleRegenerateSkeleton = useCallback(() => {
    if (!chapterGen || !locator) return
    setSkeletonPreviewOpen(false)
    void chapterGen.startSkeletonGenerate(locator)
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

  const handleManualEdit = useCallback(() => {
    if (!chapterGen || !locator) return
    chapterGen.manualEdit(locator)
  }, [chapterGen, locator])

  // Open skeleton preview when skeleton is ready
  const isSkeletonReady = status?.phase === 'skeleton-ready' && status?.skeletonPlan

  // Extract batch progress info
  const batchProgress = useMemo(() => {
    if (status?.phase !== 'batch-generating' && status?.phase !== 'batch-composing') return null
    return status.message
  }, [status?.phase, status?.message])

  const canAct = chapterGen && locator && projectId && !isBusy && !hasFailed && level >= 2
  const showGenerateButton = canAct && chapterEmpty
  const showRegenerateButton = canAct && !chapterEmpty
  const canActSkeleton = chapterGen && locator && projectId && !isBusy && !hasFailed
  const showSkeletonButton = canActSkeleton && (level === 1 || level === 2)

  return (
    <div
      data-heading-text={text}
      data-heading-level={level}
      data-heading-occurrence={occurrenceIndex}
      data-heading-locator-key={locator ? createChapterLocatorKey(locator) : undefined}
      data-heading-section-id={resolvedSectionId}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <PlateElement {...props} className={getHeadingClassName(level)}>
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
          {showSkeletonButton && hovering && (
            <span contentEditable={false} className="inline-flex">
              <Tooltip title="适用于包含多个功能模块的复合型章节" placement="top">
                <Button
                  type="text"
                  size="small"
                  icon={<BranchesOutlined />}
                  onClick={handleSkeletonGenerate}
                  className="text-text-tertiary hover:text-brand"
                  aria-label="分治生成"
                  data-testid="chapter-skeleton-btn"
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
            onManualEdit={handleManualEdit}
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

      {isSkeletonReady && (
        <div contentEditable={false} className="my-2">
          <Button
            type="link"
            size="small"
            icon={<BranchesOutlined />}
            onClick={() => setSkeletonPreviewOpen(true)}
            data-testid="skeleton-preview-trigger"
          >
            查看骨架结构
          </Button>
        </div>
      )}

      {status?.skeletonPlan && (
        <Modal
          open={skeletonPreviewOpen}
          title="骨架结构预览"
          onCancel={() => setSkeletonPreviewOpen(false)}
          footer={[
            <Button key="regen" onClick={handleRegenerateSkeleton}>
              重新生成骨架
            </Button>,
            <Button key="confirm" type="primary" onClick={handleConfirmAndBatch}>
              确认并生成
            </Button>,
          ]}
          width={640}
          data-testid="skeleton-preview-modal"
        >
          <List
            dataSource={status.skeletonPlan.sections}
            renderItem={(section) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <span>
                      {'  '.repeat(
                        Math.max(0, section.level - status.skeletonPlan!.parentLevel - 1)
                      )}
                      {section.title}
                    </span>
                  }
                  description={section.guidanceHint}
                />
                <div className="flex flex-wrap gap-1">
                  {section.dimensions.map((d) => (
                    <Tag key={d} color="blue">
                      {d}
                    </Tag>
                  ))}
                </div>
              </List.Item>
            )}
          />
        </Modal>
      )}

      {(status?.phase === 'batch-generating' || status?.phase === 'batch-composing') &&
        !status?.error && (
          <div contentEditable={false} className="my-2 px-4">
            <Progress
              percent={status.progress}
              size="small"
              status="active"
              format={() => batchProgress ?? `${status.progress}%`}
            />
          </div>
        )}
    </div>
  )
}

export function OutlineHeadingElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const text = extractText(element).trim()
  const level = getHeadingLevel(element.type as string)
  const content = useDocumentStore((s) => s.content)
  const sectionIndex = useDocumentStore((s) => s.sectionIndex)
  const editor = useEditorRef()

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

  const locator = useMemo(() => {
    if (!text || level < 1 || level > 4) return null
    return computeLocator(content, text, level, occurrenceIndex)
  }, [content, text, level, occurrenceIndex])

  // Story 11.1: emit canonical UUID `sectionId` on the DOM marker so
  // renderer hooks (useCurrentSection, skeletonConfirm callers) can read
  // either form.
  const resolvedSectionId = useMemo(() => {
    if (!locator || sectionIndex.length === 0) return undefined
    return resolveSectionIdFromLocator(sectionIndex, locator)
  }, [locator, sectionIndex])

  return (
    <div
      data-heading-text={text}
      data-heading-level={level}
      data-heading-occurrence={occurrenceIndex}
      data-heading-locator-key={locator ? createChapterLocatorKey(locator) : undefined}
      data-heading-section-id={resolvedSectionId}
    >
      <PlateElement {...props} className={getHeadingClassName(level)}>
        {children}
      </PlateElement>
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
