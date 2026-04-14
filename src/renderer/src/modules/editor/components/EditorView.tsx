import { useCallback, useEffect, useRef, useState } from 'react'
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
  InsertDrawioFn,
  InsertMermaidFn,
  InsertAssetFn,
} from './PlateEditor'
import { EditorToolbar } from './EditorToolbar'
import type { CurrentSectionInfo } from '@modules/annotation/hooks/useCurrentSection'
import {
  sanitizeGeneratedChapterMarkdown,
  normalizeGeneratedHeadingLevels,
  extractMarkdownSectionContent,
} from '@shared/chapter-markdown'
import type { ChapterDiagramPatch } from '@shared/chapter-types'

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
  const insertDrawioRef = useRef<InsertDrawioFn | null>(null)
  const insertMermaidRef = useRef<InsertMermaidFn | null>(null)
  const insertAssetRef = useRef<InsertAssetFn | null>(null)
  const consumedTerminalKeysRef = useRef<Set<string>>(new Set())
  const consumedStreamRevisionsRef = useRef<Map<string, number>>(new Map())
  const clearedRegenerateKeysRef = useRef<Set<string>>(new Set())
  const [replaceSectionVersion, setReplaceSectionVersion] = useState(0)
  const [insertDrawioAvailable, setInsertDrawioAvailable] = useState(false)
  const [insertMermaidAvailable, setInsertMermaidAvailable] = useState(false)
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

  const registerInsertDrawio = useCallback((fn: InsertDrawioFn | null): void => {
    insertDrawioRef.current = fn
    setInsertDrawioAvailable(fn !== null)
  }, [])

  const registerInsertMermaid = useCallback((fn: InsertMermaidFn | null): void => {
    insertMermaidRef.current = fn
    setInsertMermaidAvailable(fn !== null)
  }, [])

  const handleInsertDrawio = useCallback(() => {
    insertDrawioRef.current?.()
  }, [])

  const handleInsertMermaid = useCallback(() => {
    insertMermaidRef.current?.()
  }, [])

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
    document.addEventListener('selectionchange', checkSelection)
    document.addEventListener('mouseup', checkSelection)
    return () => {
      document.removeEventListener('selectionchange', checkSelection)
      document.removeEventListener('mouseup', checkSelection)
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
        didReplace = replaceSectionRef.current(
          status.target,
          sanitizeGeneratedContent(status.target, status.streamedContent)
        )
      }

      if (didReplace) {
        consumedRevisions.set(key, revision)
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
        const didReplace = replaceSectionRef.current(status.target, generatedContent)
        if (!didReplace) {
          consumedKeys.delete(key)
          continue
        }
        consumedKeys.add(key)
        // Trigger source attribution after successful replace
        if (sourceAttr) {
          void sourceAttr.triggerAttribution(status.target, generatedContent)
          void sourceAttr.triggerBaselineValidation(status.target, generatedContent)
        }
        chapterGen.dismissError(status.target)
        continue
      }

      if (status.phase === 'conflicted' && status.generatedContent) {
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
        onInsertDrawio={handleInsertDrawio}
        insertDrawioDisabled={!insertDrawioAvailable}
        onInsertMermaid={handleInsertMermaid}
        insertMermaidDisabled={!insertMermaidAvailable}
        onImportAsset={handleImportAsset}
        importAssetDisabled={!hasEditorSelection}
      />
      <div className="flex-1 overflow-y-auto" data-editor-scroll-container="true">
        <PlateEditor
          initialContent={content}
          projectId={projectId}
          onSyncFlushReady={registerSyncFlush}
          onReplaceSectionReady={registerReplaceSection}
          onInsertDrawioReady={registerInsertDrawio}
          onInsertMermaidReady={registerInsertMermaid}
          onInsertAssetReady={registerInsertAsset}
        />
      </div>
      <AssetImportDialog open={importOpen} context={importContext} onClose={closeImport} />
    </div>
  )
}
