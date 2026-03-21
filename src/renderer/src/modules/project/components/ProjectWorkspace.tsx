import { Spin, Result, Button } from 'antd'
import { ArrowLeftOutlined, SettingOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useCurrentProject } from '../hooks/useCurrentProject'
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
import { SOP_STAGES } from '../types'

export function ProjectWorkspace(): React.JSX.Element {
  const navigate = useNavigate()
  const { projectId, currentProject, loading, error } = useCurrentProject()

  const { currentStageKey, stageStatuses, navigateToStage } = useSopNavigation(
    projectId,
    currentProject?.sopStage
  )

  useSopKeyboardNav(navigateToStage)

  const { outlineCollapsed, sidebarCollapsed, isCompact, toggleOutline, toggleSidebar } =
    useWorkspaceLayout()
  useWorkspaceKeyboard(toggleSidebar, toggleOutline)

  const currentStageName = SOP_STAGES.find((s) => s.key === currentStageKey)?.label

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
            disabled
            title="全局搜索（即将推出）"
            aria-label="全局搜索（即将推出）"
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
        left={<OutlinePanel collapsed={outlineCollapsed} onToggle={toggleOutline} />}
        center={
          currentStageKey === 'requirements-analysis' && projectId ? (
            <AnalysisView projectId={projectId} />
          ) : (
            <StageGuidePlaceholder stageKey={currentStageKey} />
          )
        }
        right={
          <AnnotationPanel
            collapsed={sidebarCollapsed}
            isCompact={isCompact}
            onToggle={toggleSidebar}
          />
        }
        statusBar={<StatusBar currentStageName={currentStageName} />}
      />
    </div>
  )
}
