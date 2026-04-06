import { Spin, Result, Button } from 'antd'
import {
  ArrowLeftOutlined,
  SettingOutlined,
  SearchOutlined,
  FileSearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
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
import { ChapterGenerationProvider } from '@modules/editor/context/ChapterGenerationContext'
import { scrollToHeading } from '@modules/editor/lib/scrollToHeading'
import { commandRegistry, useCommandPalette } from '@renderer/shared/command-palette'
import { formatShortcut } from '@renderer/shared/lib/platform'
import { useDocumentStore } from '@renderer/stores'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { SOP_STAGES } from '../types'
import type { ChapterGenerationPhase } from '@shared/chapter-types'

export function ProjectWorkspace(): React.JSX.Element {
  const navigate = useNavigate()
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

  const currentStageName = SOP_STAGES.find((s) => s.key === currentStageKey)?.label
  const isProposalWriting = currentStageKey === 'proposal-writing' && Boolean(projectId)
  const isSolutionDesign = currentStageKey === 'solution-design' && Boolean(projectId)
  const showOutline = (isProposalWriting || isSolutionDesign) && Boolean(projectId)
  const showWordCount = isProposalWriting || isSolutionDesign
  const outline = useDocumentOutline(showOutline ? documentContent : '')
  const wordCount = useWordCount(documentContent)
  const showAutoSaveIndicator = isProposalWriting
  const chapterGen = useChapterGeneration(projectId ?? '')

  // Build chapter phase map for outline tree status icons
  const chapterPhases = useMemo(() => {
    const map = new Map<string, ChapterGenerationPhase>()
    for (const [key, status] of chapterGen.statuses) {
      map.set(key, status.phase)
    }
    return map
  }, [chapterGen.statuses])

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
              icon={<SearchOutlined />}
              className="text-text-tertiary"
              onClick={() => setCommandPaletteOpen(true)}
              title={formatShortcut('Ctrl+K')}
              aria-label="命令面板"
              data-testid="search-btn"
            />
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
              <AnalysisView projectId={projectId} />
            ) : isSolutionDesign && projectId ? (
              <SolutionDesignView
                projectId={projectId}
                onEnterProposalWriting={() => navigateToStage('proposal-writing')}
              />
            ) : isProposalWriting && projectId ? (
              <EditorView projectId={projectId} />
            ) : (
              <StageGuidePlaceholder stageKey={currentStageKey} />
            )
          }
          right={
            <AnnotationPanel
              collapsed={sidebarCollapsed}
              isCompact={isCompact}
              onToggle={toggleSidebar}
              projectId={isProposalWriting ? projectId : undefined}
            />
          }
          statusBar={
            <StatusBar
              currentStageName={currentStageName}
              wordCount={showWordCount ? wordCount : undefined}
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
      </div>
    </ChapterGenerationProvider>
  )
}
