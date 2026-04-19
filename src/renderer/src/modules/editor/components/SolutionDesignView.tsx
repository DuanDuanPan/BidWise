import { useState, useEffect, useCallback, useMemo } from 'react'
import { Alert, App, Button, Spin } from 'antd'
import { useDocumentStore } from '@renderer/stores'
import { TemplateSelector } from './TemplateSelector'
import { StructureDesignWorkspace } from '@modules/structure-design/components/StructureDesignWorkspace'
import type { TemplateSummary, ProposalTemplate } from '@shared/template-types'

type ViewPhase = 'checking' | 'select-template' | 'has-content'

interface SolutionDesignViewProps {
  projectId: string
  onEnterProposalWriting: () => void
}

/**
 * Solution-design entry. After Story 11.9 unification the "edit-skeleton"
 * phase is gone: `templateGenerateSkeleton` already writes the canonical
 * `proposal.md` + `proposal.meta.json.sectionIndex`, so the generated
 * skeleton is immediately loaded through `documentStore.loadDocument` and
 * the user drops straight into `has-content`. Structural edits (insert /
 * indent / delete / rename / move) all flow through
 * `chapterStructureStore` per-mutation, removing the old in-memory draft
 * + debounced `templatePersistSkeleton` round-trip.
 */
export function SolutionDesignView({
  projectId,
  onEnterProposalWriting,
}: SolutionDesignViewProps): React.JSX.Element {
  const { modal } = App.useApp()
  const [phase, setPhase] = useState<ViewPhase>('checking')
  const [error, setError] = useState<string | null>(null)

  // Template selection state
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<ProposalTemplate | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)

  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const documentContent = useDocumentStore((s) => s.content)
  const documentLoading = useDocumentStore((s) => s.loading)

  // Story 11.9 AC6: has-content CTA label depends on
  //   (a) templateId presence — only template-backed projects go through the
  //       "first confirm" ceremony; non-template imports always see 继续撰写.
  //   (b) firstSkeletonConfirmedAt absence — once persisted, any return visit
  //       to has-content means user already confirmed at least once.
  const [metaTemplateId, setMetaTemplateId] = useState<string | undefined>(undefined)
  const [firstSkeletonConfirmedAt, setFirstSkeletonConfirmedAt] = useState<string | undefined>(
    undefined
  )
  // Gate the label + CTA until metadata lands so a fast first-paint click can't
  // resolve against uninitialised signals and skip the mark-confirmed write.
  const [metaLoaded, setMetaLoaded] = useState(false)
  const hasContentConfirmLabel = useMemo(() => {
    if (!metaLoaded) return '加载中…'
    if (metaTemplateId && !firstSkeletonConfirmedAt) return '确认骨架，开始撰写'
    return '继续撰写'
  }, [metaLoaded, metaTemplateId, firstSkeletonConfirmedAt])

  // Reset state when projectId changes to avoid stale phase from previous project
  useEffect(() => {
    setPhase('checking')
    setError(null)
    setSelectedTemplateId(null)
    setPreviewTemplate(null)
    setOverwriteConfirmed(false)
    setMetaTemplateId(undefined)
    setFirstSkeletonConfirmedAt(undefined)
    setMetaLoaded(false)
  }, [projectId])

  // Load proposal metadata sidecar when entering has-content so the CTA label
  // reflects live `templateId` + `firstSkeletonConfirmedAt` state. Re-runs per
  // project; tolerates missing sidecar by leaving both signals undefined (→
  // default `继续撰写`).
  useEffect(() => {
    if (phase !== 'has-content') return
    let cancelled = false
    async function loadMeta(): Promise<void> {
      try {
        const res = await window.api.documentGetMetadata({ projectId })
        if (cancelled) return
        if (res.success) {
          setMetaTemplateId(res.data.templateId)
          setFirstSkeletonConfirmedAt(res.data.firstSkeletonConfirmedAt)
        }
      } catch {
        // Non-critical — label falls back to 继续撰写.
      } finally {
        if (!cancelled) setMetaLoaded(true)
      }
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [phase, projectId])

  // Step 1: Check if proposal has content
  useEffect(() => {
    let cancelled = false
    async function check(): Promise<void> {
      await loadDocument(projectId)
      if (cancelled) return
      // Content is now in store, we'll check in the next effect
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [projectId, loadDocument])

  // Determine phase once document is loaded
  useEffect(() => {
    if (documentLoading || phase !== 'checking') return
    const content = documentContent.trim()
    if (content) {
      setPhase('has-content')
    } else {
      setPhase('select-template')
    }
  }, [documentLoading, documentContent, phase])

  // Load templates when entering select-template phase
  useEffect(() => {
    if (phase !== 'select-template') return
    let cancelled = false
    async function load(): Promise<void> {
      setTemplatesLoading(true)
      setError(null)
      try {
        const res = await window.api.templateList()
        if (cancelled) return
        if (res.success) {
          setTemplates(res.data)
        } else {
          setError(res.error.message)
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setTemplatesLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [phase])

  // Load preview when template selected
  const handleSelectTemplate = useCallback(async (id: string) => {
    setSelectedTemplateId(id)
    setPreviewLoading(true)
    try {
      const res = await window.api.templateGet({ templateId: id })
      if (res.success) {
        setPreviewTemplate(res.data)
      }
    } catch {
      // Preview is non-critical
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  // Generate skeleton → refresh store → drop straight into has-content.
  // `templateGenerateSkeleton` writes proposal.md + proposal.meta.json.sectionIndex
  // on the main side, so `loadDocument` picks both up and every downstream
  // consumer (StructureDesignWorkspace, chapter-structure-store, outline
  // parser) sees the new tree without any in-memory draft round-trip.
  const handleGenerate = useCallback(async () => {
    if (!selectedTemplateId) return
    setGenerating(true)
    setError(null)
    try {
      const res = await window.api.templateGenerateSkeleton({
        projectId,
        templateId: selectedTemplateId,
        overwriteExisting: overwriteConfirmed,
      })
      if (res.success) {
        // Force the has-content metadata effect to re-fetch so CTA label /
        // firstSkeletonConfirmedAt reflect the freshly-generated skeleton.
        setMetaLoaded(false)
        setMetaTemplateId(undefined)
        setFirstSkeletonConfirmedAt(undefined)
        await loadDocument(projectId)
        setPhase('has-content')
      } else {
        if (res.error.code === 'SKELETON_OVERWRITE_REQUIRED') {
          modal.confirm({
            title: '覆盖确认',
            content: '重新生成骨架将覆盖当前方案内容，是否继续？',
            okText: '确认覆盖',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
              setOverwriteConfirmed(true)
            },
          })
        } else {
          setError(res.error.message)
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [selectedTemplateId, projectId, overwriteConfirmed, loadDocument, modal])

  // Auto-retry generate after overwrite confirmed
  useEffect(() => {
    if (overwriteConfirmed) {
      void handleGenerate()
      setOverwriteConfirmed(false)
    }
  }, [overwriteConfirmed, handleGenerate])

  const handleConfirmHasContent = useCallback(async () => {
    // Story 11.9 AC6: always mark the first-confirm signal. The IPC is
    // idempotent (no-op after the first write), so dropping the label-based
    // guard avoids the race where a first-paint click fires before metadata
    // loads and leaves firstSkeletonConfirmedAt empty for the next visit.
    try {
      await window.api.documentMarkSkeletonConfirmed({ projectId })
    } catch {
      /* non-fatal */
    }
    onEnterProposalWriting()
  }, [projectId, onEnterProposalWriting])

  const handleReselectFromHasContent = useCallback(() => {
    modal.confirm({
      title: '重新选择模板',
      content: '重新生成骨架将覆盖当前方案内容，是否继续？',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setOverwriteConfirmed(true)
        setPhase('select-template')
      },
    })
  }, [modal])

  // --- Render ---

  if (phase === 'checking' || documentLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="solution-design-loading"
      >
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-6" data-testid="solution-design-view">
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
          className="mb-4"
          action={
            <Button size="small" onClick={() => setError(null)}>
              重试
            </Button>
          }
          data-testid="solution-design-error"
        />
      )}

      {phase === 'has-content' && (
        <StructureDesignWorkspace
          projectId={projectId}
          onConfirmSkeleton={handleConfirmHasContent}
          confirmLabel={hasContentConfirmLabel}
          confirmLoading={!metaLoaded}
          onReselectTemplate={handleReselectFromHasContent}
        />
      )}

      {phase === 'select-template' && (
        <TemplateSelector
          templates={templates}
          loading={templatesLoading}
          selectedId={selectedTemplateId}
          previewTemplate={previewTemplate}
          previewLoading={previewLoading}
          generating={generating}
          onSelect={handleSelectTemplate}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  )
}
