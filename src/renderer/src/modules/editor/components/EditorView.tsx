import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Skeleton, Alert, Button } from 'antd'
import { useDocumentStore, useProjectStore } from '@renderer/stores'
import { useDocument } from '@modules/editor/hooks/useDocument'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'
import { useSourceAttributionContext } from '@modules/editor/context/useSourceAttributionContext'
import { useAssetImport } from '@modules/asset/hooks/useAssetImport'
import { AssetImportDialog } from '@modules/asset/components/AssetImportDialog'
import { PlateEditor } from './PlateEditor'
import type {
  ReplaceSectionFn,
  InsertMermaidFn,
  InsertAiDiagramFn,
  UpdateAiDiagramFn,
  InsertAssetFn,
} from './PlateEditor'
import { AiDiagramDialog } from './AiDiagramDialog'
import type { AiDiagramDialogResult } from './AiDiagramDialog'
import { AiDiagramProvider } from '@modules/editor/context/AiDiagramContext'
import type { AiDiagramRegenerateRequest } from '@modules/editor/context/AiDiagramContext'
import { EditorToolbar } from './EditorToolbar'
import type { CurrentSectionInfo } from '@modules/annotation/hooks/useCurrentSection'
import {
  sanitizeGeneratedChapterMarkdown,
  normalizeGeneratedHeadingLevels,
  extractMarkdownSectionContent,
  extractMarkdownHeadings,
  findMarkdownHeading,
  getMarkdownDirectSectionBody,
  isMarkdownDirectBodyEmpty,
} from '@shared/chapter-markdown'
import type {
  ChapterDiagramPatch,
  ChapterHeadingLocator,
  BatchSectionStatus,
} from '@shared/chapter-types'

interface EditorViewProps {
  projectId: string
  currentSection?: CurrentSectionInfo | null
  onInsertAssetReady?: (fn: InsertAssetFn | null) => void
}

export function EditorView({
  projectId,
  currentSection,
  onInsertAssetReady,
}: EditorViewProps): React.JSX.Element {
  const { modal } = App.useApp()
  const loading = useDocumentStore((s) => s.loading)
  const error = useDocumentStore((s) => s.error)
  const content = useDocumentStore((s) => s.content)
  const loadedProjectId = useDocumentStore((s) => s.loadedProjectId)
  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const syncFlushRef = useRef<(() => string) | null>(null)
  const replaceSectionRef = useRef<ReplaceSectionFn | null>(null)
  const insertMermaidRef = useRef<InsertMermaidFn | null>(null)
  const insertAiDiagramRef = useRef<InsertAiDiagramFn | null>(null)
  const updateAiDiagramRef = useRef<UpdateAiDiagramFn | null>(null)
  const insertAssetRef = useRef<InsertAssetFn | null>(null)
  const selectionCheckFrameRef = useRef<number | null>(null)
  const pointerSelectingRef = useRef(false)
  const consumedTerminalKeysRef = useRef<Set<string>>(new Set())
  const consumedStreamRevisionsRef = useRef<Map<string, number>>(new Map())
  const clearedRegenerateKeysRef = useRef<Set<string>>(new Set())
  const [replaceSectionVersion, setReplaceSectionVersion] = useState(0)
  const [insertMermaidAvailable, setInsertMermaidAvailable] = useState(false)
  const [insertAiDiagramAvailable, setInsertAiDiagramAvailable] = useState(false)
  const [aiDiagramDialogOpen, setAiDiagramDialogOpen] = useState(false)
  const [aiDiagramInitials, setAiDiagramInitials] = useState<AiDiagramRegenerateRequest | null>(
    null
  )
  const [hasEditorSelection, setHasEditorSelection] = useState(false)
  const chapterGen = useChapterGenerationContext()
  const chapterStatuses = chapterGen?.statuses
  const sourceAttr = useSourceAttributionContext()

  const registerSyncFlush = useCallback((flush: (() => string) | null): void => {
    syncFlushRef.current = flush
  }, [])

  const registerReplaceSection = useCallback((fn: ReplaceSectionFn | null): void => {
    replaceSectionRef.current = fn
    setReplaceSectionVersion((version) => version + 1)
  }, [])

  const registerInsertMermaid = useCallback((fn: InsertMermaidFn | null): void => {
    insertMermaidRef.current = fn
    setInsertMermaidAvailable(fn !== null)
  }, [])

  const handleInsertMermaid = useCallback(() => {
    insertMermaidRef.current?.()
  }, [])

  const registerInsertAiDiagram = useCallback((fn: InsertAiDiagramFn | null): void => {
    insertAiDiagramRef.current = fn
    setInsertAiDiagramAvailable(fn !== null)
  }, [])

  const registerUpdateAiDiagram = useCallback((fn: UpdateAiDiagramFn | null): void => {
    updateAiDiagramRef.current = fn
  }, [])

  const handleInsertAiDiagram = useCallback(() => {
    setAiDiagramInitials(null)
    setAiDiagramDialogOpen(true)
  }, [])

  const handleAiDiagramSuccess = useCallback(
    (result: AiDiagramDialogResult) => {
      const currentProjectId = useProjectStore.getState().currentProject?.id

      if (aiDiagramInitials?.diagramId) {
        // Regenerate: update existing node in place
        const { diagramId, assetFileName: previousAssetFileName } = aiDiagramInitials
        updateAiDiagramRef.current?.(diagramId, {
          assetFileName: result.assetFileName,
          prompt: result.prompt,
          style: result.style,
          diagramType: result.diagramType,
          svgContent: result.svgContent,
          svgPersisted: true,
          generationError: undefined,
          lastModified: new Date().toISOString(),
        })

        if (
          currentProjectId &&
          previousAssetFileName &&
          previousAssetFileName !== result.assetFileName
        ) {
          void window.api
            .aiDiagramDeleteAsset({
              projectId: currentProjectId,
              assetFileName: previousAssetFileName,
            })
            .catch(() => {
              console.warn('旧 AI diagram 资产删除失败 (best-effort)')
            })
        }
      } else {
        insertAiDiagramRef.current?.({
          diagramId: result.diagramId,
          assetFileName: result.assetFileName,
          caption: '',
          prompt: result.prompt,
          style: result.style,
          diagramType: result.diagramType,
          svgContent: result.svgContent,
          svgPersisted: true,
        })
      }

      setAiDiagramDialogOpen(false)
    },
    [aiDiagramInitials]
  )

  const handleAiDiagramRegenerate = useCallback((request: AiDiagramRegenerateRequest) => {
    setAiDiagramInitials(request)
    setAiDiagramDialogOpen(true)
  }, [])

  const aiDiagramContextValue = useMemo(
    () => ({ requestRegenerate: handleAiDiagramRegenerate }),
    [handleAiDiagramRegenerate]
  )

  const registerInsertAsset = useCallback(
    (fn: InsertAssetFn | null): void => {
      insertAssetRef.current = fn
      onInsertAssetReady?.(fn)
    },
    [onInsertAssetReady]
  )

  const currentProjectName = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? null
  )
  const { isOpen: importOpen, importContext, openImport, closeImport } = useAssetImport()

  const sanitizeGeneratedContent = useCallback(
    (target: { title: string; level: 1 | 2 | 3 | 4; occurrenceIndex: number }, content: string) => {
      const deduped = sanitizeGeneratedChapterMarkdown(content, target)
      return normalizeGeneratedHeadingLevels(deduped, target.level)
    },
    []
  )

  const applyDiagramPatchToSection = useCallback(
    (sectionContent: string, patch: ChapterDiagramPatch): string | null => {
      const marker = `{#diagram-placeholder:${patch.placeholderId}}`
      const lines = sectionContent.split('\n')
      let replaced = false
      const nextLines = lines.map((line) => {
        if (!line.includes(marker)) return line
        replaced = true
        return patch.markdown
      })

      return replaced ? nextLines.join('\n') : null
    },
    []
  )

  const handleImportAsset = useCallback(() => {
    // Only trigger if selection is inside the Plate editor content area
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text) return

    const editorContent = document.querySelector('[data-testid="plate-editor-content"]')
    if (!editorContent) return

    const anchorInEditor = sel?.anchorNode && editorContent.contains(sel.anchorNode)
    const focusInEditor = sel?.focusNode && editorContent.contains(sel.focusNode)
    if (!anchorInEditor || !focusInEditor) return

    openImport({
      selectedText: text,
      sectionTitle: currentSection?.label ?? '',
      sourceProject: currentProjectName,
      sourceSection: currentSection?.label ?? null,
    })
  }, [currentSection, currentProjectName, openImport])

  // Track whether there's a valid selection inside the editor
  useEffect(() => {
    const scheduleSelectionCheck = (): void => {
      if (selectionCheckFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionCheckFrameRef.current)
      }
      selectionCheckFrameRef.current = window.requestAnimationFrame(() => {
        selectionCheckFrameRef.current = null
        checkSelection()
      })
    }

    const checkSelection = (): void => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!text) {
        setHasEditorSelection(false)
        return
      }
      const editorContent = document.querySelector('[data-testid="plate-editor-content"]')
      if (!editorContent) {
        setHasEditorSelection(false)
        return
      }
      const inEditor =
        sel?.anchorNode &&
        editorContent.contains(sel.anchorNode) &&
        sel?.focusNode &&
        editorContent.contains(sel.focusNode)
      setHasEditorSelection(Boolean(inEditor))
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const editorContent = document.querySelector('[data-testid="plate-editor-content"]')
      pointerSelectingRef.current = Boolean(
        editorContent && event.target instanceof Node && editorContent.contains(event.target)
      )
    }

    const handlePointerUp = (): void => {
      const wasPointerSelecting = pointerSelectingRef.current
      pointerSelectingRef.current = false
      if (wasPointerSelecting) {
        scheduleSelectionCheck()
      }
    }

    const handleSelectionChange = (): void => {
      if (pointerSelectingRef.current) return
      scheduleSelectionCheck()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    return () => {
      if (selectionCheckFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionCheckFrameRef.current)
      }
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
    }
  }, [])

  const flushEditorContent = useCallback((): string | null => syncFlushRef.current?.() ?? null, [])

  useDocument(projectId, flushEditorContent)

  useEffect(() => {
    loadDocument(projectId)
  }, [projectId, loadDocument])

  // Hydrate persisted source attributions from sidecar on mount
  useEffect(() => {
    if (sourceAttr) {
      void sourceAttr.loadPersistedState()
    }
    // Only run on mount / projectId change, not when sourceAttr ref changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const triggerSummaryExtraction = useCallback(
    (
      parentTarget: ChapterHeadingLocator,
      operationType: string | undefined,
      batchSections: BatchSectionStatus[] | undefined
    ): void => {
      const markdownSnapshot = useDocumentStore.getState().content
      if (!markdownSnapshot) return

      const fire = (locator: ChapterHeadingLocator): void => {
        // Pre-extract directBody in the renderer so only the chapter-sized
        // body crosses IPC and lands in tasks.input — a whole-document
        // snapshot would accumulate as SQLite bloat across every refresh.
        const directBody = getMarkdownDirectSectionBody(markdownSnapshot, locator)
        // Symmetric with the read-side filter (chapter-generation-service
        // `buildGeneratedChaptersContext` skips empty-direct-body headings):
        // a cache entry whose body is blank, guidance-only (`> ...`), or the
        // skip placeholder never contributes to any prompt — summarising it
        // burns tokens, a queue slot, and a sidecar row for nothing.
        if (isMarkdownDirectBodyEmpty(directBody)) return
        void window.api.chapterSummaryExtract({ projectId, locator, directBody }).catch(() => {
          /* best-effort — summary cache failures must not block generation */
        })
      }

      fire(parentTarget)

      if (operationType !== 'batch-generate') return

      // Batch path: fan out exactly over the skeleton plan's completed
      // sections. Iterating every descendant heading instead would also hit
      // sub-sub-headings that appeared inside each generated child — those
      // are summarised via their containing batch section, not individually,
      // and running an AI summary per nested heading multiplies queue depth
      // and token cost far beyond what the batch actually produced.
      const completedSections = (batchSections ?? []).filter((s) => s.phase === 'completed')
      if (completedSections.length === 0) return

      const headings = extractMarkdownHeadings(markdownSnapshot)
      const parent = findMarkdownHeading(headings, parentTarget)
      if (!parent) return
      const parentIdx = headings.findIndex((h) => h.lineIndex === parent.lineIndex)
      if (parentIdx < 0) return

      // Headings physically between the parent and the next same-or-shallower
      // sibling. Skeleton-matched scanning is restricted to this window so
      // later chapters cannot be mis-claimed as batch children.
      let parentEndIdx = headings.length
      for (let i = parentIdx + 1; i < headings.length; i++) {
        if (headings[i].level <= parent.level) {
          parentEndIdx = i
          break
        }
      }

      const consumed = new Set<number>()
      for (const section of completedSections) {
        for (let i = parentIdx + 1; i < parentEndIdx; i++) {
          if (consumed.has(i)) continue
          const inner = headings[i]
          if (inner.level !== section.level) continue
          if (inner.title !== section.title) continue
          consumed.add(i)
          fire({
            title: inner.title,
            level: inner.level,
            occurrenceIndex: inner.occurrenceIndex,
          })
          break
        }
      }
    },
    [projectId]
  )

  useEffect(() => {
    if (!chapterGen || !chapterStatuses || !replaceSectionRef.current) return
    if (loadedProjectId !== projectId || content.length === 0) return

    const consumedRevisions = consumedStreamRevisionsRef.current
    const clearedKeys = clearedRegenerateKeysRef.current

    // Clear old content immediately when regeneration starts
    for (const [key, status] of chapterStatuses) {
      if (
        status.operationType === 'regenerate' &&
        !clearedKeys.has(key) &&
        !status.streamedContent &&
        !status.generatedContent &&
        status.phase !== 'completed' &&
        status.phase !== 'failed' &&
        status.phase !== 'conflicted'
      ) {
        console.debug(
          `[gen-debug:editorEffect] clearing section for regen: "${status.target.title}" phase=${status.phase}`
        )
        const didClear = replaceSectionRef.current(status.target, '')
        if (didClear) {
          clearedKeys.add(key)
          // Reset conflict-detection baseline so the cleared section isn't treated as manual edit
          chapterGen.notifySectionCleared(status.target)
        }
      }
    }

    for (const [key, status] of chapterStatuses) {
      const revision = status.streamRevision ?? 0
      if (revision === 0 || !status.streamedContent) {
        consumedRevisions.delete(key)
        continue
      }

      if (consumedRevisions.get(key) === revision) continue

      let didReplace = false
      if (status.latestDiagramPatch) {
        const currentMarkdown = useDocumentStore.getState().content
        const currentSectionContent = extractMarkdownSectionContent(currentMarkdown, status.target)
        console.debug(
          `[gen-debug:streamPatch] "${status.target.title}" diagramPatch placeholderId=${status.latestDiagramPatch.placeholderId}, sectionLen=${currentSectionContent.length}`
        )
        const patchedSection = applyDiagramPatchToSection(
          currentSectionContent,
          status.latestDiagramPatch
        )

        if (patchedSection) {
          didReplace = replaceSectionRef.current(
            status.target,
            sanitizeGeneratedContent(status.target, patchedSection)
          )
        }
      } else {
        console.debug(
          `[gen-debug:streamReplace] "${status.target.title}" rev=${revision}, streamedLen=${status.streamedContent.length}`
        )
        didReplace = replaceSectionRef.current(
          status.target,
          sanitizeGeneratedContent(status.target, status.streamedContent)
        )
      }

      if (didReplace) {
        consumedRevisions.set(key, revision)
        console.debug(
          `[gen-debug:streamReplace] "${status.target.title}" replaced successfully, advancing baseline`
        )
        // Advance conflict-detection baseline so this streaming update is not mistaken for a manual edit
        chapterGen.advanceBaseline(status.target)
      }
    }

    for (const key of Array.from(consumedRevisions.keys())) {
      if (!chapterStatuses.has(key)) {
        consumedRevisions.delete(key)
      }
    }

    // Clean up cleared-keys tracking for finished/removed entries
    for (const key of Array.from(clearedKeys)) {
      if (!chapterStatuses.has(key)) {
        clearedKeys.delete(key)
      }
    }
  }, [
    applyDiagramPatchToSection,
    chapterGen,
    chapterStatuses,
    content,
    loadedProjectId,
    projectId,
    replaceSectionVersion,
    sanitizeGeneratedContent,
  ])

  // Watch for completed chapters and inject content into editor
  useEffect(() => {
    if (!chapterGen || !chapterStatuses) return
    const consumedKeys = consumedTerminalKeysRef.current

    for (const [key, status] of chapterStatuses) {
      if (!['completed', 'conflicted'].includes(status.phase)) {
        consumedKeys.delete(key)
        continue
      }

      if (consumedKeys.has(key)) continue

      if (
        status.phase === 'completed' &&
        status.generatedContent &&
        replaceSectionRef.current &&
        loadedProjectId === projectId &&
        content.length > 0
      ) {
        const generatedContent = sanitizeGeneratedContent(status.target, status.generatedContent)
        console.debug(
          `[gen-debug:terminal] "${status.target.title}" phase=completed, replacing section, sanitizedLen=${generatedContent.length}`
        )
        const didReplace = replaceSectionRef.current(status.target, generatedContent)
        if (!didReplace) {
          console.warn(
            `[gen-debug:terminal] "${status.target.title}" replaceSection returned false — heading not found?`
          )
          consumedKeys.delete(key)
          continue
        }
        consumedKeys.add(key)
        // Trigger source attribution after successful replace
        if (sourceAttr) {
          void sourceAttr.triggerAttribution(status.target, generatedContent)
          void sourceAttr.triggerBaselineValidation(status.target, generatedContent)
        }
        // Story 3.12: fire-and-forget chapter-summary cache refresh.
        // Pre-extracting directBody in the renderer decouples extraction from
        // the 1s autosave debounce (disk may still hold the pre-edit document)
        // while keeping the queue payload chapter-sized instead of
        // whole-document.
        triggerSummaryExtraction(status.target, status.operationType, status.batchSections)
        chapterGen.dismissError(status.target)
        continue
      }

      if (status.phase === 'conflicted' && status.generatedContent) {
        console.warn(
          `[gen-debug:terminal] "${status.target.title}" phase=CONFLICTED — showing conflict modal. generatedLen=${status.generatedContent.length}`
        )
        if (!replaceSectionRef.current || loadedProjectId !== projectId || content.length === 0) {
          consumedKeys.delete(key)
          continue
        }

        consumedKeys.add(key)
        modal.confirm({
          title: '章节已被修改',
          content: `章节 "${status.target.title}" 在 AI 生成期间被手动修改。是否仍要替换为 AI 生成的内容？`,
          okText: '替换',
          cancelText: '保留手动编辑',
          onOk: () => {
            if (!replaceSectionRef.current || !status.generatedContent) {
              consumedKeys.delete(key)
              return
            }
            const generatedContent = sanitizeGeneratedContent(
              status.target,
              status.generatedContent
            )
            const didReplace = replaceSectionRef.current(status.target, generatedContent)
            if (!didReplace) {
              consumedKeys.delete(key)
              return
            }
            consumedKeys.delete(key)
            // Trigger source attribution after conflict resolution replace
            if (sourceAttr) {
              void sourceAttr.triggerAttribution(status.target, generatedContent)
              void sourceAttr.triggerBaselineValidation(status.target, generatedContent)
            }
            // Story 3.12: conflict-replace path refreshes summary cache too,
            // using the freshly-applied document snapshot (see note above).
            triggerSummaryExtraction(status.target, status.operationType, status.batchSections)
            chapterGen.dismissError(status.target)
          },
          onCancel: () => {
            consumedKeys.delete(key)
            chapterGen.dismissError(status.target)
          },
        })
      }
    }

    for (const key of Array.from(consumedKeys)) {
      if (!chapterStatuses.has(key)) {
        consumedKeys.delete(key)
      }
    }
  }, [
    chapterGen,
    chapterStatuses,
    content,
    loadedProjectId,
    modal,
    projectId,
    replaceSectionVersion,
    sanitizeGeneratedContent,
    sourceAttr,
    triggerSummaryExtraction,
  ])

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
    <div className="flex h-full flex-col" data-testid="editor-view">
      <EditorToolbar
        projectId={projectId}
        onInsertMermaid={handleInsertMermaid}
        insertMermaidDisabled={!insertMermaidAvailable}
        onInsertAiDiagram={handleInsertAiDiagram}
        insertAiDiagramDisabled={!insertAiDiagramAvailable}
        onImportAsset={handleImportAsset}
        importAssetDisabled={!hasEditorSelection}
      />
      <div className="flex-1 overflow-y-auto" data-editor-scroll-container="true">
        <AiDiagramProvider value={aiDiagramContextValue}>
          <PlateEditor
            initialContent={content}
            projectId={projectId}
            onSyncFlushReady={registerSyncFlush}
            onReplaceSectionReady={registerReplaceSection}
            onInsertMermaidReady={registerInsertMermaid}
            onInsertAiDiagramReady={registerInsertAiDiagram}
            onUpdateAiDiagramReady={registerUpdateAiDiagram}
            onInsertAssetReady={registerInsertAsset}
          />
        </AiDiagramProvider>
      </div>
      <AssetImportDialog open={importOpen} context={importContext} onClose={closeImport} />
      {aiDiagramDialogOpen ? (
        <AiDiagramDialog
          open={aiDiagramDialogOpen}
          onClose={() => setAiDiagramDialogOpen(false)}
          onSuccess={handleAiDiagramSuccess}
          initialPrompt={aiDiagramInitials?.prompt}
          initialStyle={aiDiagramInitials?.style}
          initialType={aiDiagramInitials?.diagramType}
          initialCaption={aiDiagramInitials?.caption}
          initialDiagramId={aiDiagramInitials?.diagramId}
          initialAssetFileName={aiDiagramInitials?.assetFileName}
        />
      ) : null}
    </div>
  )
}
