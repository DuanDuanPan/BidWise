import { useState, useEffect, useCallback, useRef } from 'react'
import { Alert, Button, Modal, Spin, Typography, List } from 'antd'
import { useDocumentStore } from '@renderer/stores'
import { TemplateSelector } from './TemplateSelector'
import { SkeletonEditor } from './SkeletonEditor'
import type { TemplateSummary, ProposalTemplate, SkeletonSection } from '@shared/template-types'

const { Title } = Typography

type ViewPhase = 'checking' | 'select-template' | 'edit-skeleton' | 'has-content'

interface SolutionDesignViewProps {
  projectId: string
  onEnterProposalWriting: () => void
}

function extractH1Titles(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => /^# /.test(line))
    .map((line) => line.replace(/^# /, '').trim())
}

function skeletonToMarkdown(sections: SkeletonSection[]): string {
  const lines: string[] = []
  function render(section: SkeletonSection): void {
    const hashes = '#'.repeat(section.level)
    lines.push(`${hashes} ${section.title}`)
    lines.push('')
    if (section.guidanceText) {
      lines.push(`> ${section.guidanceText}`)
      lines.push('')
    }
    for (const child of section.children) {
      render(child)
    }
  }
  for (const s of sections) {
    render(s)
  }
  return lines.join('\n')
}

export function SolutionDesignView({
  projectId,
  onEnterProposalWriting,
}: SolutionDesignViewProps): React.JSX.Element {
  const [phase, setPhase] = useState<ViewPhase>('checking')
  const [error, setError] = useState<string | null>(null)

  // Template selection state
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<ProposalTemplate | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Skeleton editing state
  const [skeleton, setSkeleton] = useState<SkeletonSection[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)

  // Debounce timer for persist
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistingRef = useRef(false)
  const pendingPersistRef = useRef<SkeletonSection[] | null>(null)

  // Existing content summary
  const [h1Titles, setH1Titles] = useState<string[]>([])

  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const updateContent = useDocumentStore((s) => s.updateContent)
  const documentContent = useDocumentStore((s) => s.content)
  const documentLoading = useDocumentStore((s) => s.loading)

  // Reset state when projectId changes to avoid stale phase from previous project
  useEffect(() => {
    setPhase('checking')
    setError(null)
    setSkeleton([])
    setSelectedTemplateId(null)
    setPreviewTemplate(null)
    setTemplateId('')
    setOverwriteConfirmed(false)
    setH1Titles([])
  }, [projectId])

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
      setH1Titles(extractH1Titles(content))
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

  // Generate skeleton
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
        setSkeleton(res.data.skeleton)
        setTemplateId(selectedTemplateId)
        updateContent(res.data.markdown, projectId, { scheduleSave: false })
        setPhase('edit-skeleton')
      } else {
        if (res.error.code === 'SKELETON_OVERWRITE_REQUIRED') {
          Modal.confirm({
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
  }, [selectedTemplateId, projectId, overwriteConfirmed, updateContent])

  // Auto-retry generate after overwrite confirmed
  useEffect(() => {
    if (overwriteConfirmed) {
      void handleGenerate()
      setOverwriteConfirmed(false)
    }
  }, [overwriteConfirmed, handleGenerate])

  // Debounced persist for skeleton edits
  const doPersist = useCallback(
    async (sections: SkeletonSection[]) => {
      persistingRef.current = true
      try {
        await window.api.templatePersistSkeleton({
          projectId,
          templateId,
          skeleton: sections,
        })
      } catch (err) {
        // Non-fatal, skeleton is in memory
        console.warn('Skeleton persist failed:', err)
      } finally {
        persistingRef.current = false
        // If there's a pending persist, run it
        const pending = pendingPersistRef.current
        if (pending) {
          pendingPersistRef.current = null
          void doPersist(pending)
        }
      }
    },
    [projectId, templateId]
  )

  const handleSkeletonUpdate = useCallback(
    (updated: SkeletonSection[]) => {
      setSkeleton(updated)
      // Sync markdown to store for outline/word count
      const markdown = skeletonToMarkdown(updated)
      updateContent(markdown, projectId, { scheduleSave: false })
      // Debounced persist
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null
        if (persistingRef.current) {
          pendingPersistRef.current = updated
        } else {
          void doPersist(updated)
        }
      }, 1000)
    },
    [projectId, updateContent, doPersist]
  )

  const handleConfirmSkeleton = useCallback(async () => {
    // Wait for pending persist
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
      await doPersist(skeleton)
    }
    // Wait if currently persisting
    while (persistingRef.current) {
      await new Promise((r) => setTimeout(r, 100))
    }
    onEnterProposalWriting()
  }, [skeleton, doPersist, onEnterProposalWriting])

  const handleRegenerate = useCallback(() => {
    Modal.confirm({
      title: '重新选择模板',
      content: '重新生成骨架将覆盖当前编辑内容，是否继续？',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setPhase('select-template')
        setSkeleton([])
        setSelectedTemplateId(null)
        setPreviewTemplate(null)
        setOverwriteConfirmed(true)
      },
    })
  }, [])

  const handleReselectFromHasContent = useCallback(() => {
    Modal.confirm({
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
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

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
        <div className="mx-auto w-full max-w-xl" data-testid="has-content-view">
          <Title level={4} className="mb-4">
            已有方案结构
          </Title>
          <List
            bordered
            dataSource={h1Titles}
            renderItem={(title) => <List.Item>{title}</List.Item>}
            locale={{ emptyText: '无章节结构' }}
            className="mb-6"
          />
          <div className="flex gap-3">
            <Button
              type="primary"
              onClick={onEnterProposalWriting}
              data-testid="continue-writing-btn"
            >
              继续撰写
            </Button>
            <Button onClick={handleReselectFromHasContent} data-testid="reselect-template-btn">
              重新选择模板
            </Button>
          </div>
        </div>
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

      {phase === 'edit-skeleton' && (
        <SkeletonEditor
          skeleton={skeleton}
          onUpdate={handleSkeletonUpdate}
          onConfirm={handleConfirmSkeleton}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  )
}
