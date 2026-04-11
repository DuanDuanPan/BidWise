import { useState, useCallback, useMemo } from 'react'
import { Button, Alert, Progress, Tag, Switch, message } from 'antd'
import {
  ThunderboltOutlined,
  ImportOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  getAnalysisProjectState,
  useAnalysisStore,
  useReviewStore,
  getReviewProjectState,
} from '@renderer/stores'
import { ComplianceCoverageMatrix } from './ComplianceCoverageMatrix'
import { AddendumImportModal } from './AddendumImportModal'
import type { CoverageStatus, TraceabilityMatrix, TraceabilityStats } from '@shared/analysis-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

interface TraceabilityMatrixViewProps {
  projectId: string
  onNavigateToChapter?: (locator: ChapterHeadingLocator) => void
}

export function TraceabilityMatrixView({
  projectId,
  onNavigateToChapter,
}: TraceabilityMatrixViewProps): React.JSX.Element {
  const projectState = useAnalysisStore((state) => getAnalysisProjectState(state, projectId))
  const generateMatrix = useAnalysisStore((s) => s.generateMatrix)
  const fetchMatrix = useAnalysisStore((s) => s.fetchMatrix)
  const fetchMatrixStats = useAnalysisStore((s) => s.fetchMatrixStats)
  const createLink = useAnalysisStore((s) => s.createLink)
  const updateLink = useAnalysisStore((s) => s.updateLink)
  const deleteLink = useAnalysisStore((s) => s.deleteLink)
  const importAddendum = useAnalysisStore((s) => s.importAddendum)

  const reviewProjectState = useReviewStore((s) => getReviewProjectState(s, projectId))
  const complianceResult = reviewProjectState.compliance

  const [addendumModalOpen, setAddendumModalOpen] = useState(false)
  const [mandatoryOnly, setMandatoryOnly] = useState(false)

  const {
    requirements,
    traceabilityMatrix,
    traceabilityStats,
    matrixGenerationTaskId,
    matrixGenerationProgress,
    matrixGenerationMessage,
    matrixGenerationLoading,
    matrixGenerationError,
    addendumImportTaskId,
    addendumImportProgress,
    addendumImportMessage,
    addendumImportLoading,
    addendumImportError,
  } = projectState

  const isGenerating = matrixGenerationTaskId !== null || matrixGenerationLoading
  const isImportingAddendum = addendumImportTaskId !== null || addendumImportLoading
  const hasRequirements = requirements !== null && requirements.length > 0
  const hasMatrix = traceabilityMatrix !== null

  // Derive filtered matrix and overridden stats for mandatory-only mode
  const { displayMatrix, displayStats } = useMemo((): {
    displayMatrix: TraceabilityMatrix | null
    displayStats: TraceabilityStats | null
  } => {
    if (!mandatoryOnly || !hasMatrix || !complianceResult) {
      return { displayMatrix: traceabilityMatrix, displayStats: traceabilityStats }
    }

    // Build set of linked requirement IDs from confirmed mandatory items
    const mandatoryLinkedReqIds = new Set(
      complianceResult.items
        .filter((item) => item.linkedRequirementId !== null)
        .map((item) => item.linkedRequirementId!)
    )

    // Filter matrix rows to only include mandatory-linked requirements
    const filteredRows = traceabilityMatrix.rows.filter((row) =>
      mandatoryLinkedReqIds.has(row.requirementId)
    )

    // Rebuild stats from compliance result, not from original matrix stats
    // unlinkedCount counts as equivalent blocking — adds to uncoveredCount for stats
    const overriddenStats: TraceabilityStats = {
      totalRequirements: complianceResult.totalConfirmed,
      coveredCount: complianceResult.coveredCount,
      partialCount: complianceResult.partialCount,
      uncoveredCount: complianceResult.uncoveredCount + complianceResult.unlinkedCount,
      coverageRate:
        complianceResult.totalConfirmed === 0
          ? 1
          : complianceResult.coveredCount / complianceResult.totalConfirmed,
    }

    const filteredMatrix: TraceabilityMatrix = {
      ...traceabilityMatrix,
      rows: filteredRows,
      stats: overriddenStats,
    }

    return { displayMatrix: filteredMatrix, displayStats: overriddenStats }
  }, [mandatoryOnly, hasMatrix, complianceResult, traceabilityMatrix, traceabilityStats])

  const handleGenerate = useCallback(async () => {
    await generateMatrix(projectId)
  }, [generateMatrix, projectId])

  const handleImportAddendum = useCallback(
    async (input: { content?: string; filePath?: string; fileName?: string }) => {
      setAddendumModalOpen(false)
      await importAddendum(projectId, input)
    },
    [importAddendum, projectId]
  )

  const handleCreateLink = useCallback(
    async (requirementId: string, sectionId: string, coverageStatus: CoverageStatus) => {
      try {
        await createLink(projectId, requirementId, sectionId, coverageStatus)
        await fetchMatrixStats(projectId)
      } catch {
        message.error('创建链接失败')
      }
    },
    [createLink, fetchMatrixStats, projectId]
  )

  const handleUpdateLink = useCallback(
    async (id: string, patch: { coverageStatus?: CoverageStatus }) => {
      try {
        await updateLink(id, patch)
        await fetchMatrixStats(projectId)
      } catch {
        message.error('更新链接失败')
      }
    },
    [updateLink, fetchMatrixStats, projectId]
  )

  const handleDeleteLink = useCallback(
    async (id: string) => {
      try {
        await deleteLink(id)
        await fetchMatrix(projectId)
        await fetchMatrixStats(projectId)
      } catch {
        message.error('删除链接失败')
      }
    },
    [deleteLink, fetchMatrix, fetchMatrixStats, projectId]
  )

  // Prerequisites missing
  if (!hasRequirements) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 py-16"
        data-testid="traceability-matrix-view"
      >
        <ExclamationCircleOutlined style={{ fontSize: 32 }} className="text-text-tertiary" />
        <div className="text-text-secondary">请先完成需求抽取，才能生成追溯矩阵</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="traceability-matrix-view">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={isGenerating || isImportingAddendum}
            data-testid="generate-matrix-btn"
          >
            {hasMatrix ? '重新生成' : '生成追溯矩阵'}
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => setAddendumModalOpen(true)}
            disabled={isGenerating || isImportingAddendum}
            data-testid="import-addendum-btn"
          >
            导入补遗
          </Button>
          {hasMatrix && (
            <span className="ml-4 flex items-center gap-2">
              <Switch
                size="small"
                checked={mandatoryOnly}
                onChange={setMandatoryOnly}
                data-testid="mandatory-only-toggle"
              />
              <span className="text-text-secondary text-sm">仅显示必做项</span>
            </span>
          )}
        </div>

        {/* Stats badges */}
        {displayStats && !mandatoryOnly && (
          <div className="flex items-center gap-2">
            <Tag color="green">
              <CheckCircleOutlined /> 已覆盖 {displayStats.coveredCount}
            </Tag>
            <Tag color="orange">部分 {displayStats.partialCount}</Tag>
            <Tag color="red">未覆盖 {displayStats.uncoveredCount}</Tag>
            <Tag>覆盖率 {Math.round(displayStats.coverageRate * 100)}%</Tag>
          </div>
        )}
      </div>

      {/* Mandatory compliance summary bar */}
      {mandatoryOnly && complianceResult && (
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 p-4"
          data-testid="mandatory-compliance-summary"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              必做项覆盖 {complianceResult.coveredCount} / {complianceResult.totalConfirmed}
            </span>
            <div className="flex items-center gap-2">
              <Tag color="green">已覆盖 {complianceResult.coveredCount}</Tag>
              <Tag color="orange">部分 {complianceResult.partialCount}</Tag>
              <Tag color="red">未覆盖 {complianceResult.uncoveredCount}</Tag>
              <Tag color="red">未关联 {complianceResult.unlinkedCount}</Tag>
            </div>
          </div>
          <Progress
            percent={complianceResult.complianceRate}
            status={
              complianceResult.complianceRate === 100
                ? 'success'
                : complianceResult.complianceRate >= 60
                  ? 'active'
                  : 'exception'
            }
            data-testid="mandatory-compliance-progress"
          />
          {complianceResult.unlinkedCount > 0 && (
            <div className="text-text-tertiary mt-2 flex items-center gap-1 text-xs">
              <WarningOutlined />
              {complianceResult.unlinkedCount} 个必做项尚未关联 requirement，因此不会出现在矩阵行中
            </div>
          )}
        </div>
      )}

      {/* Generation error */}
      {matrixGenerationError && (
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={`追溯矩阵生成失败：${matrixGenerationError}`}
          action={
            <Button size="small" onClick={handleGenerate}>
              重试
            </Button>
          }
          closable
          data-testid="matrix-generation-error"
        />
      )}

      {/* Addendum import error */}
      {addendumImportError && (
        <Alert
          type="error"
          showIcon
          message={`补遗导入失败：${addendumImportError}`}
          closable
          data-testid="addendum-import-error"
        />
      )}

      {/* Generation in progress */}
      {isGenerating && (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
          data-testid="matrix-generation-progress"
        >
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <LoadingOutlined />
            <span className="font-medium">正在生成追溯矩阵</span>
          </div>
          <Progress percent={Math.round(matrixGenerationProgress)} size="small" status="active" />
          <div className="text-text-secondary mt-1 text-xs">
            {matrixGenerationMessage || '正在分析...'}
          </div>
        </div>
      )}

      {/* Addendum import in progress */}
      {isImportingAddendum && (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
          data-testid="addendum-import-progress"
        >
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <LoadingOutlined />
            <span className="font-medium">正在导入补遗</span>
          </div>
          <Progress percent={Math.round(addendumImportProgress)} size="small" status="active" />
          <div className="text-text-secondary mt-1 text-xs">
            {addendumImportMessage || '正在解析...'}
          </div>
        </div>
      )}

      {/* Addendum import completed with impact info */}
      {hasMatrix &&
        (traceabilityMatrix.recentlyImpactedSectionIds.length > 0 ||
          traceabilityMatrix.recentlyAddedRequirementIds.length > 0) &&
        !isImportingAddendum && (
          <Alert
            type="info"
            showIcon
            message={`已更新 ${traceabilityMatrix.recentlyAddedRequirementIds.length} 条需求，${traceabilityMatrix.recentlyImpactedSectionIds.length} 个章节受影响`}
            closable
            data-testid="addendum-impact-info"
          />
        )}

      {/* Not yet generated */}
      {!hasMatrix && !isGenerating && !matrixGenerationError && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 py-16">
          <div className="text-text-secondary">尚未生成追溯矩阵</div>
          <div className="text-text-tertiary text-sm">
            点击&ldquo;生成追溯矩阵&rdquo;按钮，AI 将自动分析需求与方案章节的对应关系
          </div>
        </div>
      )}

      {/* Matrix result */}
      {displayMatrix && (
        <ComplianceCoverageMatrix
          matrix={displayMatrix}
          onCreateLink={handleCreateLink}
          onUpdateLink={handleUpdateLink}
          onDeleteLink={handleDeleteLink}
          onNavigateToChapter={onNavigateToChapter}
        />
      )}

      {/* Addendum import modal */}
      <AddendumImportModal
        open={addendumModalOpen}
        onImport={handleImportAddendum}
        onCancel={() => setAddendumModalOpen(false)}
      />
    </div>
  )
}
