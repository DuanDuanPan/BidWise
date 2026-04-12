import { Spin, Result, Button } from 'antd'
import {
  ArrowLeftOutlined,
  SettingOutlined,
  SearchOutlined,
  FileSearchOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { useCurrentProject } from '../hooks/useCurrentProject'
import { useContextRestore } from '../hooks/useContextRestore'
import { useSopNavigation } from '../hooks/useSopNavigation'
import { useSopKeyboardNav } from '../hooks/useSopKeyboardNav'
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout'
import { useWorkspaceKeyboard } from '../hooks/useWorkspaceKeyboard'
import { SopProgressBar } from './SopProgressBar'
import { StageGuidePlaceholder } from './StageGuidePlaceholder'
import { AnalysisView } from '@modules/analysis/components/AnalysisView'
import { WorkspaceLayout } from './WorkspaceLayout'
import { OutlinePanel } from './OutlinePanel'
import { AnnotationPanel } from './AnnotationPanel'
import { StatusBar } from './StatusBar'
import { EditorView } from '@modules/editor/components/EditorView'
import { SolutionDesignView } from '@modules/editor/components/SolutionDesignView'
import { AutoSaveIndicator } from '@modules/editor/components/AutoSaveIndicator'
import { DocumentOutlineTree } from '@modules/editor/components/DocumentOutlineTree'
import { useDocumentOutline } from '@modules/editor/hooks/useDocumentOutline'
import { useWordCount } from '@modules/editor/hooks/useWordCount'
import { useChapterGeneration } from '@modules/editor/hooks/useChapterGeneration'
import { useSourceAttribution } from '@modules/editor/hooks/useSourceAttribution'
import { ChapterGenerationProvider } from '@modules/editor/context/ChapterGenerationContext'
import { SourceAttributionProvider } from '@modules/editor/context/SourceAttributionContext'
import { useCurrentSection } from '@modules/annotation/hooks/useCurrentSection'
import { useAssetRecommendation } from '@modules/asset/hooks/useAssetRecommendation'
import { RecommendationDetailDrawer } from '@modules/asset/components/RecommendationDetailDrawer'
import type { InsertAssetFn } from '@modules/editor/components/PlateEditor'
import { scrollToHeading } from '@modules/editor/lib/scrollToHeading'
import { useExportPreview } from '@modules/export/hooks/useExportPreview'
import { ExportPreviewLoadingOverlay } from '@modules/export/components/ExportPreviewLoadingOverlay'
import { ExportPreviewModal } from '@modules/export/components/ExportPreviewModal'
import { ComplianceGateModal } from '@modules/export/components/ComplianceGateModal'
import { commandRegistry, useCommandPalette } from '@renderer/shared/command-palette'
import { formatShortcut } from '@renderer/shared/lib/platform'
import { isMac } from '@renderer/shared/lib/platform'
import { useDocumentStore, useReviewStore, getReviewProjectState } from '@renderer/stores'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { useComplianceAutoRefresh } from '@modules/review/hooks/useComplianceAutoRefresh'
import { useAdversarialLineup } from '@modules/review/hooks/useAdversarialLineup'
import { useAdversarialReview } from '@modules/review/hooks/useAdversarialReview'
import { AdversarialLineupDrawer } from '@modules/review/components/AdversarialLineupDrawer'
import { AdversarialReviewPanel } from '@modules/review/components/AdversarialReviewPanel'
import { NotificationBell } from '@modules/notification/components/NotificationBell'
import { SOP_STAGES } from '../types'
import type { ChapterGenerationPhase, ChapterHeadingLocator } from '@shared/chapter-types'

interface NotificationRouteState {
  focusAnnotationId?: string
  expandThreadParentId?: string
  focusSectionId?: string
}

export function ProjectWorkspace(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId, currentProject, loading, error } = useCurrentProject()

  const { saveContext, restoreContext } = useContextRestore()

  const { currentStageKey, stageStatuses, navigateToStage } = useSopNavigation(
    projectId,
    currentProject?.sopStage
  )

  // Restore context on mount (session-level cache, non-persistent)
  useEffect(() => {
    if (projectId) {
      restoreContext(projectId)
    }
  }, [projectId, restoreContext])

  // Save context on unmount
  useEffect(() => {
    return () => {
      if (projectId && currentStageKey) {
        saveContext(projectId, {
          sopStage: currentStageKey,
          lastVisitedAt: new Date().toISOString(),
        })
      }
    }
  }, [projectId, currentStageKey, saveContext])

  const {
    open: commandPaletteOpen,
    setOpen: setCommandPaletteOpen,
    registerCommand,
    unregisterCommand,
  } = useCommandPalette()

  useSopKeyboardNav(navigateToStage, commandPaletteOpen)

  // Temporarily override the global stage stubs while the workspace route is mounted.
  useEffect(() => {
    const previousCommands = new Map<string, ReturnType<typeof commandRegistry.getCommand>>()

    for (const stage of SOP_STAGES) {
      const id = `command-palette:stage-${stage.key}`
      previousCommands.set(id, commandRegistry.getCommand(id))
      registerCommand({
        id,
        label: `${stage.label}阶段`,
        category: 'navigation',
        keywords: [stage.label, stage.shortLabel, stage.key, `阶段${stage.stageNumber}`],
        icon: <FileSearchOutlined />,
        shortcut: stage.altKey ? formatShortcut(`Alt+${stage.altKey}`) : undefined,
        action: () => navigateToStage(stage.key),
      })
    }

    return () => {
      for (const stage of SOP_STAGES) {
        const id = `command-palette:stage-${stage.key}`
        const previousCommand = previousCommands.get(id)
        if (previousCommand) {
          registerCommand(previousCommand)
          continue
        }
        unregisterCommand(id)
      }
    }
  }, [navigateToStage, registerCommand, unregisterCommand])

  // Eagerly hydrate document store at workspace mount so that preview availability
  // does not depend on EditorView being rendered (user may land on another tab).
  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const loadedProjectId = useDocumentStore((s) => s.loadedProjectId)

  useEffect(() => {
    if (projectId && loadedProjectId !== projectId) {
      void loadDocument(projectId)
    }
  }, [projectId, loadedProjectId, loadDocument])

  // Export preview integration (Story 8.2)
  const exportPreview = useExportPreview()
  const hasDocumentContent = useDocumentStore((s) => s.content.trim().length > 0)

  const handleTriggerPreview = useCallback(() => {
    if (!projectId || !hasDocumentContent) return
    exportPreview.triggerPreview(projectId)
  }, [projectId, hasDocumentContent, exportPreview])

  // Cmd/Ctrl+E capture-phase handler for export preview
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.key !== 'e') return

      // Don't trigger when command palette is open
      if (commandPaletteOpen) return

      // Don't trigger when focus is in editable fields (including nested elements inside contenteditable)
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('[contenteditable="true"]') != null
      ) {
        return
      }

      e.preventDefault()
      handleTriggerPreview()
    }

    window.addEventListener('keydown', handler, true) // capture phase
    return () => window.removeEventListener('keydown', handler, true)
  }, [commandPaletteOpen, handleTriggerPreview])

  // Override export command in command palette while workspace is mounted
  useEffect(() => {
    const id = 'command-palette:export-document'
    const previous = commandRegistry.getCommand(id)

    registerCommand({
      id,
      label: '导出预览',
      category: 'action',
      keywords: ['导出', '预览', '文档', 'export', 'preview', 'docx'],
      shortcut: formatShortcut('Ctrl+E'),
      action: handleTriggerPreview,
      when: () => hasDocumentContent,
    })

    return () => {
      if (previous) {
        registerCommand(previous)
      } else {
        unregisterCommand(id)
      }
    }
  }, [handleTriggerPreview, hasDocumentContent, registerCommand, unregisterCommand])

  // Adversarial lineup (Story 7.2) — declared before useEffect that references it
  const adversarialLineup = useAdversarialLineup(projectId, currentStageKey)

  // Adversarial review execution (Story 7.3)
  const adversarialReview = useAdversarialReview(projectId)
  const isComplianceReview = currentStageKey === 'compliance-review'

  // Override adversarial review command in command palette while workspace is mounted
  useEffect(() => {
    const id = 'command-palette:start-adversarial-review'
    const previous = commandRegistry.getCommand(id)

    registerCommand({
      id,
      label: '启动对抗评审',
      category: 'action',
      keywords: ['对抗', '评审', '审查', 'review', 'adversarial'],
      action: () => {
        if (adversarialLineup.drawerOpen) return
        const state = useReviewStore.getState()
        const ps = projectId ? getReviewProjectState(state, projectId) : null
        if (ps?.lineup) {
          adversarialLineup.openDrawer()
        } else {
          adversarialLineup.triggerGenerate()
        }
      },
    })

    return () => {
      if (previous) {
        registerCommand(previous)
      } else {
        unregisterCommand(id)
      }
    }
  }, [projectId, adversarialLineup, registerCommand, unregisterCommand])

  const { outlineCollapsed, sidebarCollapsed, isCompact, toggleOutline, toggleSidebar } =
    useWorkspaceLayout()
  const documentContent = useDocumentStore((s) => s.content)
  const autoSave = useDocumentStore((s) => s.autoSave)
  const saveDocument = useDocumentStore((s) => s.saveDocument)
  useWorkspaceKeyboard(toggleSidebar, toggleOutline)

  // Load annotations when entering proposal-writing stage
  const loadAnnotations = useAnnotationStore((s) => s.loadAnnotations)
  useEffect(() => {
    if (currentStageKey === 'proposal-writing' && projectId) {
      void loadAnnotations(projectId)
    }
  }, [currentStageKey, projectId, loadAnnotations])

  // Compliance auto-refresh (Story 7.1)
  useComplianceAutoRefresh(projectId ?? '')

  const reviewProjectState = useReviewStore((s) =>
    projectId ? getReviewProjectState(s, projectId) : null
  )
  const complianceRate = reviewProjectState?.compliance?.complianceRate ?? null
  const complianceLoading = reviewProjectState?.loading ?? false
  const complianceReady = reviewProjectState?.loaded ?? false

  // Notification navigation state
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(null)
  const [expandThreadParentId, setExpandThreadParentId] = useState<string | null>(null)

  // Sync route state → local state (render-time derived state, avoids setState-in-effect)
  const routeState = location.state as NotificationRouteState | null
  const routeAnnotationId = routeState?.focusAnnotationId ?? null
  const [prevRouteAnnotation, setPrevRouteAnnotation] = useState<string | null>(null)
  if (routeAnnotationId && routeAnnotationId !== prevRouteAnnotation) {
    setPrevRouteAnnotation(routeAnnotationId)
    setFocusAnnotationId(routeAnnotationId)
    setExpandThreadParentId(routeState?.expandThreadParentId ?? null)
  }

  // Side effects for cross-project notification navigation (stage switch + state cleanup)
  useEffect(() => {
    const rs = location.state as NotificationRouteState | null
    if (rs?.focusAnnotationId) {
      if (currentStageKey !== 'proposal-writing') {
        navigateToStage('proposal-writing')
      }
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, currentStageKey, navigateToStage, navigate, location.pathname])

  const handleNotificationClick = useCallback(
    (notification: {
      projectId: string
      annotationId: string
      sectionId: string
      type: string
    }) => {
      if (notification.projectId === projectId) {
        // Same project: set focus state directly, ensure we're on proposal-writing
        setFocusAnnotationId(notification.annotationId)
        setExpandThreadParentId(
          notification.type === 'reply-received' ? notification.annotationId : null
        )
        if (currentStageKey !== 'proposal-writing') {
          navigateToStage('proposal-writing')
        }
      } else {
        // Different project: navigate with route state
        navigate(`/project/${notification.projectId}`, {
          state: {
            focusAnnotationId: notification.annotationId,
            expandThreadParentId:
              notification.type === 'reply-received' ? notification.annotationId : undefined,
          } satisfies NotificationRouteState,
        })
      }
    },
    [projectId, currentStageKey, navigateToStage, navigate]
  )

  const currentStageName = SOP_STAGES.find((s) => s.key === currentStageKey)?.label
  const isProposalWriting = currentStageKey === 'proposal-writing' && Boolean(projectId)
  const isSolutionDesign = currentStageKey === 'solution-design' && Boolean(projectId)
  const showOutline = (isProposalWriting || isSolutionDesign) && Boolean(projectId)
  const showWordCount = isProposalWriting || isSolutionDesign
  const outline = useDocumentOutline(showOutline ? documentContent : '')
  const wordCount = useWordCount(documentContent)
  const showAutoSaveIndicator = isProposalWriting
  const chapterGen = useChapterGeneration(projectId ?? '')
  const sourceAttribution = useSourceAttribution(projectId ?? '', documentContent)
  const currentSection = useCurrentSection()

  // Asset recommendation integration (Story 5.2)
  const insertAssetRef = useRef<InsertAssetFn | null>(null)
  const recommendation = useAssetRecommendation(projectId ?? '')
  const [detailDrawerAssetId, setDetailDrawerAssetId] = useState<string | null>(null)

  const handleInsertRecommendation = useCallback(
    async (assetId: string) => {
      try {
        const resp = await window.api.assetGet({ id: assetId })
        if (!resp.success) return
        const ok = insertAssetRef.current?.(resp.data.content, {
          targetSection: recommendation.currentSection?.locator ?? null,
        })
        if (ok) {
          recommendation.accept(assetId)
        }
      } catch {
        // silent
      }
    },
    [recommendation]
  )

  const handleDetailDrawerInsert = useCallback(
    (assetId: string, content: string) => {
      const ok = insertAssetRef.current?.(content, {
        targetSection: recommendation.currentSection?.locator ?? null,
      })
      if (ok) {
        recommendation.accept(assetId)
        setDetailDrawerAssetId(null)
      }
    },
    [recommendation]
  )

  const registerInsertAsset = useCallback((fn: InsertAssetFn | null) => {
    insertAssetRef.current = fn
  }, [])

  // Build chapter phase map for outline tree status icons
  const chapterPhases = useMemo(() => {
    const map = new Map<string, ChapterGenerationPhase>()
    for (const [key, status] of chapterGen.statuses) {
      map.set(key, status.phase)
    }
    for (const [key, state] of sourceAttribution.sections) {
      if (state.attributionPhase === 'running' || state.baselinePhase === 'running') {
        map.set(key, 'annotating-sources')
      }
    }
    return map
  }, [chapterGen.statuses, sourceAttribution.sections])

  // Cross-stage chapter navigation bridge (Story 2.8)
  const pendingLocatorRef = useRef<ChapterHeadingLocator | null>(null)

  const handleNavigateToChapter = useCallback(
    (locator: ChapterHeadingLocator): void => {
      if (currentStageKey !== 'proposal-writing') {
        pendingLocatorRef.current = locator
        navigateToStage('proposal-writing')
      } else {
        scrollToHeading(
          document.querySelector('[data-editor-scroll-container="true"]') as HTMLElement | null,
          locator
        )
      }
    },
    [currentStageKey, navigateToStage]
  )

  // When stage changes to proposal-writing and there's a pending locator, scroll to it
  useEffect(() => {
    if (currentStageKey !== 'proposal-writing' || !pendingLocatorRef.current) {
      return undefined
    }
    const locator = pendingLocatorRef.current
    pendingLocatorRef.current = null
    // Wait for editor to mount
    const timer = setTimeout(() => {
      scrollToHeading(
        document.querySelector('[data-editor-scroll-container="true"]') as HTMLElement | null,
        locator
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [currentStageKey])

  if (loading && !currentProject) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="workspace-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (error || !currentProject) {
    return (
      <div className="flex h-screen items-center justify-center" data-testid="workspace-error">
        <Result
          status="error"
          title="项目加载失败"
          subTitle={error ?? '未找到项目'}
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              返回看板
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <ChapterGenerationProvider value={chapterGen}>
      <SourceAttributionProvider value={sourceAttribution}>
        <div className="bg-bg-global flex h-screen flex-col" data-testid="project-workspace">
          {/* Top nav bar — mirrors Kanban header style */}
          <header className="border-border bg-bg-content flex h-14 shrink-0 items-center justify-between border-b px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-text-tertiary hover:bg-bg-global hover:text-brand flex cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-1 transition-colors"
                onClick={() => navigate('/')}
                aria-label="返回项目看板"
                data-testid="back-to-kanban"
              >
                <ArrowLeftOutlined style={{ fontSize: 16 }} />
              </button>
              <div className="bg-brand flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white">
                标
              </div>
              <span className="text-h4">BidWise 标智</span>
              <span className="text-caption text-text-tertiary">
                / {currentProject.customerName ?? ''}
              </span>
              <span className="text-h4">{currentProject.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="text"
                icon={<EyeOutlined />}
                className="text-text-tertiary"
                disabled={!hasDocumentContent}
                onClick={handleTriggerPreview}
                title={formatShortcut('Ctrl+E')}
                aria-label="预览"
                data-testid="preview-btn"
              />
              <Button
                type="text"
                icon={<SearchOutlined />}
                className="text-text-tertiary"
                onClick={() => setCommandPaletteOpen(true)}
                title={formatShortcut('Ctrl+K')}
                aria-label="命令面板"
                data-testid="search-btn"
              />
              <NotificationBell onNotificationClick={handleNotificationClick} />
              <Button
                type="text"
                icon={<SettingOutlined />}
                className="text-text-tertiary"
                disabled
                title="设置（即将推出）"
                aria-label="设置（即将推出）"
              />
            </div>
          </header>

          {/* SOP Progress Bar */}
          <SopProgressBar
            currentStageKey={currentStageKey}
            stageStatuses={stageStatuses}
            onStageClick={navigateToStage}
          />

          {/* Three-column workspace layout */}
          <WorkspaceLayout
            left={
              <OutlinePanel collapsed={outlineCollapsed} onToggle={toggleOutline}>
                {isProposalWriting ? (
                  <DocumentOutlineTree
                    outline={outline}
                    chapterPhases={chapterPhases}
                    onNodeClick={(node) => {
                      scrollToHeading(
                        document.querySelector(
                          '[data-editor-scroll-container="true"]'
                        ) as HTMLElement | null,
                        node
                      )
                    }}
                  />
                ) : isSolutionDesign && outline.length > 0 ? (
                  <DocumentOutlineTree outline={outline} />
                ) : undefined}
              </OutlinePanel>
            }
            center={
              currentStageKey === 'requirements-analysis' && projectId ? (
                <AnalysisView projectId={projectId} onNavigateToChapter={handleNavigateToChapter} />
              ) : isSolutionDesign && projectId ? (
                <SolutionDesignView
                  projectId={projectId}
                  onEnterProposalWriting={() => navigateToStage('proposal-writing')}
                />
              ) : isProposalWriting && projectId ? (
                <EditorView
                  projectId={projectId}
                  currentSection={recommendation.currentSection}
                  onInsertAssetReady={registerInsertAsset}
                />
              ) : currentStageKey === 'compliance-review' && projectId ? (
                <StageGuidePlaceholder
                  stageKey={currentStageKey}
                  ctaLabel={
                    getReviewProjectState(useReviewStore.getState(), projectId).lineup
                      ? '打开对抗阵容'
                      : '生成对抗阵容'
                  }
                  onPrimaryAction={() => {
                    const ps = getReviewProjectState(useReviewStore.getState(), projectId)
                    if (ps.lineup) {
                      adversarialLineup.openDrawer()
                    } else {
                      adversarialLineup.triggerGenerate()
                    }
                  }}
                  primaryActionLoading={
                    getReviewProjectState(useReviewStore.getState(), projectId).lineupLoading
                  }
                />
              ) : (
                <StageGuidePlaceholder stageKey={currentStageKey} />
              )
            }
            right={
              isComplianceReview && adversarialReview.panelOpen ? (
                <AdversarialReviewPanel
                  session={adversarialReview.reviewSession}
                  loading={adversarialReview.reviewLoading}
                  progress={adversarialReview.reviewProgress}
                  message={adversarialReview.reviewMessage}
                  error={adversarialReview.reviewError}
                  onClose={adversarialReview.closePanel}
                  onAction={adversarialReview.handleFinding}
                  onRetryRole={adversarialReview.retryRole}
                  onRestart={adversarialReview.startReview}
                  onNavigateToSection={(finding) => {
                    if (finding.sectionLocator) {
                      scrollToHeading(
                        document.querySelector(
                          '[data-editor-scroll-container="true"]'
                        ) as HTMLElement | null,
                        finding.sectionLocator
                      )
                    }
                  }}
                />
              ) : (
                <AnnotationPanel
                  collapsed={sidebarCollapsed}
                  isCompact={isCompact}
                  onToggle={toggleSidebar}
                  projectId={isProposalWriting ? projectId : undefined}
                  sopPhase={currentStageKey}
                  currentSection={isProposalWriting ? currentSection : null}
                  focusAnnotationId={focusAnnotationId}
                  expandThreadParentId={expandThreadParentId}
                  recommendationProps={
                    isProposalWriting
                      ? {
                          recommendations: recommendation.recommendations,
                          recommendationLoading: recommendation.loading,
                          acceptedAssetIds: recommendation.acceptedAssetIds,
                          onInsertRecommendation: handleInsertRecommendation,
                          onIgnoreRecommendation: recommendation.ignore,
                          onViewRecommendationDetail: setDetailDrawerAssetId,
                        }
                      : null
                  }
                  attackChecklistProps={
                    (isProposalWriting || isComplianceReview) && projectId
                      ? {
                          projectId,
                          defaultCollapsed: isComplianceReview,
                          onNavigateToChapter: handleNavigateToChapter,
                        }
                      : null
                  }
                />
              )
            }
            statusBar={
              <StatusBar
                currentStageName={currentStageName}
                wordCount={showWordCount ? wordCount : undefined}
                complianceRate={complianceRate}
                complianceLoading={complianceLoading}
                complianceReady={complianceReady}
                leftExtra={
                  showAutoSaveIndicator && projectId ? (
                    <AutoSaveIndicator
                      autoSave={autoSave}
                      onRetry={() => {
                        void saveDocument(projectId)
                      }}
                    />
                  ) : undefined
                }
              />
            }
          />
          {/* Export preview overlay and modal (Story 8.2) */}
          {exportPreview.phase === 'loading' && (
            <ExportPreviewLoadingOverlay
              progress={exportPreview.progress}
              progressMessage={exportPreview.progressMessage}
              onCancel={exportPreview.cancelPreview}
            />
          )}
          <ExportPreviewModal
            open={exportPreview.phase === 'ready' || exportPreview.phase === 'error'}
            docxBase64={exportPreview.docxBase64}
            fileName={exportPreview.previewMeta?.fileName ?? ''}
            pageCount={exportPreview.previewMeta?.pageCount}
            error={exportPreview.error}
            onClose={exportPreview.closePreview}
            onConfirmExport={exportPreview.confirmExport}
            onRetry={exportPreview.retryPreview}
          />
          <ComplianceGateModal
            open={exportPreview.complianceGateOpen}
            gateData={exportPreview.complianceGateData}
            onClose={exportPreview.closeComplianceGate}
            onForceExport={exportPreview.forceExport}
          />
          <RecommendationDetailDrawer
            assetId={detailDrawerAssetId}
            matchScore={
              recommendation.recommendations.find((r) => r.assetId === detailDrawerAssetId)
                ?.matchScore
            }
            accepted={
              detailDrawerAssetId ? recommendation.acceptedAssetIds.has(detailDrawerAssetId) : false
            }
            open={detailDrawerAssetId !== null}
            onClose={() => setDetailDrawerAssetId(null)}
            onInsert={handleDetailDrawerInsert}
          />
          {/* Adversarial lineup Drawer (Story 7.2) + Review trigger (Story 7.3) */}
          {projectId && (
            <AdversarialLineupDrawer
              open={adversarialLineup.drawerOpen}
              projectId={projectId}
              onClose={adversarialLineup.closeDrawer}
              onGenerate={adversarialLineup.triggerGenerate}
              onUpdateRoles={(roles) => {
                const ps = getReviewProjectState(useReviewStore.getState(), projectId)
                if (ps.lineup) {
                  void adversarialLineup.updateRoles({ lineupId: ps.lineup.id, roles })
                }
              }}
              onConfirm={() => {
                const ps = getReviewProjectState(useReviewStore.getState(), projectId)
                if (ps.lineup) {
                  void adversarialLineup.confirmLineup({ lineupId: ps.lineup.id })
                }
              }}
              onStartReview={adversarialReview.startReview}
              onViewReviewResults={adversarialReview.openPanel}
              onGenerateChecklist={() => {
                void useReviewStore.getState().startAttackChecklistGeneration(projectId)
              }}
            />
          )}
        </div>
      </SourceAttributionProvider>
    </ChapterGenerationProvider>
  )
}
