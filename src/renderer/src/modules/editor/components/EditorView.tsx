import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton, Alert, Button, Modal } from 'antd'
import { useDocumentStore } from '@renderer/stores'
import { useDocument } from '@modules/editor/hooks/useDocument'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'
import { useSourceAttributionContext } from '@modules/editor/context/useSourceAttributionContext'
import { PlateEditor } from './PlateEditor'
import type { ReplaceSectionFn } from './PlateEditor'
import { EditorToolbar } from './EditorToolbar'

interface EditorViewProps {
  projectId: string
}

export function EditorView({ projectId }: EditorViewProps): React.JSX.Element {
  const loading = useDocumentStore((s) => s.loading)
  const error = useDocumentStore((s) => s.error)
  const content = useDocumentStore((s) => s.content)
  const loadedProjectId = useDocumentStore((s) => s.loadedProjectId)
  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const syncFlushRef = useRef<(() => string) | null>(null)
  const replaceSectionRef = useRef<ReplaceSectionFn | null>(null)
  const consumedTerminalKeysRef = useRef<Set<string>>(new Set())
  const [replaceSectionVersion, setReplaceSectionVersion] = useState(0)
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
        const didReplace = replaceSectionRef.current(status.target, status.generatedContent)
        if (!didReplace) {
          consumedKeys.delete(key)
          continue
        }
        consumedKeys.add(key)
        // Trigger source attribution after successful replace
        if (sourceAttr) {
          void sourceAttr.triggerAttribution(status.target, status.generatedContent)
          void sourceAttr.triggerBaselineValidation(status.target, status.generatedContent)
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
        Modal.confirm({
          title: '章节已被修改',
          content: `章节 "${status.target.title}" 在 AI 生成期间被手动修改。是否仍要替换为 AI 生成的内容？`,
          okText: '替换',
          cancelText: '保留手动编辑',
          onOk: () => {
            if (!replaceSectionRef.current || !status.generatedContent) {
              consumedKeys.delete(key)
              return
            }
            const didReplace = replaceSectionRef.current(status.target, status.generatedContent)
            if (!didReplace) {
              consumedKeys.delete(key)
              return
            }
            consumedKeys.delete(key)
            // Trigger source attribution after conflict resolution replace
            if (sourceAttr && status.generatedContent) {
              void sourceAttr.triggerAttribution(status.target, status.generatedContent)
              void sourceAttr.triggerBaselineValidation(status.target, status.generatedContent)
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
    projectId,
    replaceSectionVersion,
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
      <EditorToolbar projectId={projectId} />
      <div className="flex-1 overflow-y-auto" data-editor-scroll-container="true">
        <PlateEditor
          initialContent={content}
          projectId={projectId}
          onSyncFlushReady={registerSyncFlush}
          onReplaceSectionReady={registerReplaceSection}
        />
      </div>
    </div>
  )
}
