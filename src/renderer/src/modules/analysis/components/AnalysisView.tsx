import { useEffect, useCallback, useState } from 'react'
import { message, Button, Tabs, Alert, Progress } from 'antd'
import { FileSearchOutlined, LoadingOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { getAnalysisProjectState, useAnalysisStore } from '@renderer/stores'
import { TenderUploadZone } from './TenderUploadZone'
import { ParseProgressPanel } from './ParseProgressPanel'
import { TenderResultSummary } from './TenderResultSummary'
import { RequirementsList } from './RequirementsList'
import { ScoringModelEditor } from './ScoringModelEditor'
import { MandatoryItemsList } from './MandatoryItemsList'
import { MandatoryItemsBadge } from './MandatoryItemsBadge'
import { StrategySeedList } from './StrategySeedList'
import { StrategySeedBadge } from './StrategySeedBadge'
import { FogMapView } from './FogMapView'
import { FogMapBadge } from './FogMapBadge'
import type { AnalysisViewProps } from '../types'

export function AnalysisView({ projectId }: AnalysisViewProps): React.JSX.Element {
  const projectState = useAnalysisStore((state) => getAnalysisProjectState(state, projectId))
  const fetchTenderResult = useAnalysisStore((s) => s.fetchTenderResult)
  const reset = useAnalysisStore((s) => s.reset)
  const extractRequirements = useAnalysisStore((s) => s.extractRequirements)
  const fetchRequirements = useAnalysisStore((s) => s.fetchRequirements)
  const fetchScoringModel = useAnalysisStore((s) => s.fetchScoringModel)
  const updateRequirement = useAnalysisStore((s) => s.updateRequirement)
  const updateScoringCriterion = useAnalysisStore((s) => s.updateScoringCriterion)
  const confirmScoringModel = useAnalysisStore((s) => s.confirmScoringModel)
  const detectMandatoryItems = useAnalysisStore((s) => s.detectMandatoryItems)
  const fetchMandatoryItems = useAnalysisStore((s) => s.fetchMandatoryItems)
  const fetchMandatorySummary = useAnalysisStore((s) => s.fetchMandatorySummary)
  const updateMandatoryItem = useAnalysisStore((s) => s.updateMandatoryItem)
  const addMandatoryItem = useAnalysisStore((s) => s.addMandatoryItem)
  const generateSeeds = useAnalysisStore((s) => s.generateSeeds)
  const fetchSeeds = useAnalysisStore((s) => s.fetchSeeds)
  const fetchSeedSummary = useAnalysisStore((s) => s.fetchSeedSummary)
  const updateSeed = useAnalysisStore((s) => s.updateSeed)
  const deleteSeed = useAnalysisStore((s) => s.deleteSeed)
  const addSeed = useAnalysisStore((s) => s.addSeed)
  const generateFogMap = useAnalysisStore((s) => s.generateFogMap)
  const fetchFogMap = useAnalysisStore((s) => s.fetchFogMap)
  const fetchFogMapSummary = useAnalysisStore((s) => s.fetchFogMapSummary)
  const confirmCertainty = useAnalysisStore((s) => s.confirmCertainty)
  const batchConfirmCertainty = useAnalysisStore((s) => s.batchConfirmCertainty)

  const {
    parsedTender,
    importTaskId,
    parseProgress,
    parseMessage,
    loading,
    error,
    taskStatus,
    requirements,
    scoringModel,
    extractionTaskId,
    extractionProgress,
    extractionMessage,
    extractionLoading,
    mandatoryItems,
    mandatorySummary,
    mandatoryDetectionTaskId,
    mandatoryDetectionProgress,
    mandatoryDetectionMessage,
    mandatoryDetectionError,
    seeds,
    seedSummary,
    seedGenerationTaskId,
    seedGenerationProgress,
    seedGenerationMessage,
    seedGenerationError,
    fogMap,
    fogMapSummary,
    fogMapTaskId,
    fogMapProgress,
    fogMapMessage,
    fogMapError,
  } = projectState

  // On mount / project change: check for existing data
  useEffect(() => {
    void fetchTenderResult(projectId)
    void fetchRequirements(projectId)
    void fetchScoringModel(projectId)
    void fetchMandatoryItems(projectId)
    void fetchMandatorySummary(projectId)
    void fetchSeeds(projectId)
    void fetchSeedSummary(projectId)
    void fetchFogMap(projectId)
    void fetchFogMapSummary(projectId)
  }, [
    projectId,
    fetchTenderResult,
    fetchRequirements,
    fetchScoringModel,
    fetchMandatoryItems,
    fetchMandatorySummary,
    fetchSeeds,
    fetchSeedSummary,
    fetchFogMap,
    fetchFogMapSummary,
  ])

  const [activeTab, setActiveTab] = useState('requirements')

  const handleNavigateToRequirements = useCallback(() => {
    setActiveTab('requirements')
  }, [])

  const handleCancel = async (): Promise<void> => {
    if (!importTaskId) return
    try {
      const res = await window.api.taskCancel(importTaskId)
      if (res.success) {
        reset(projectId)
      } else {
        message.error(`取消失败：${res.error.message}`)
      }
    } catch {
      message.error('取消失败，请重试')
    }
  }

  const handleExtract = async (): Promise<void> => {
    await extractRequirements(projectId)
  }

  const handleDetectMandatory = async (): Promise<void> => {
    await detectMandatoryItems(projectId)
  }

  // Determine view state
  const isParsing = importTaskId !== null
  const isParseCompleted =
    importTaskId !== null && taskStatus === 'completed' && parsedTender === null
  const hasParsedResult = parsedTender !== null
  const hasExtractionResult = requirements !== null
  const isExtracting = extractionTaskId !== null && !hasExtractionResult
  const isMandatoryDetecting =
    mandatoryDetectionTaskId !== null || projectState.mandatoryDetectionLoading
  const isSeedGenerating = seedGenerationTaskId !== null || projectState.seedGenerationLoading
  const isFogMapGenerating = fogMapTaskId !== null || projectState.fogMapLoading

  // Error state (no parsed result)
  if (!hasParsedResult && error && !isParsing) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4"
        data-testid="analysis-view"
      >
        <div className="text-red-500">{error}</div>
        <TenderUploadZone projectId={projectId} disabled={loading} />
      </div>
    )
  }

  // Parsing in progress
  if (isParsing || isParseCompleted) {
    return (
      <div className="flex flex-1 items-center justify-center" data-testid="analysis-view">
        <ParseProgressPanel
          progress={parseProgress}
          message={parseMessage}
          onCancel={handleCancel}
          onViewResult={() => {
            void fetchTenderResult(projectId)
          }}
          completed={isParseCompleted}
        />
      </div>
    )
  }

  // No tender yet — show upload zone
  if (!hasParsedResult) {
    return (
      <div className="flex flex-1 items-center justify-center" data-testid="analysis-view">
        <TenderUploadZone projectId={projectId} disabled={loading} />
      </div>
    )
  }

  // Tender parsed — show results + extraction UI
  return (
    <div className="flex-1 overflow-auto" data-testid="analysis-view">
      <TenderResultSummary parsedTender={parsedTender} />

      {/* Extraction section */}
      <div className="border-border border-t p-4">
        {/* Extraction error */}
        {error && !isExtracting && !hasExtractionResult && (
          <Alert
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message={`AI 抽取失败：${error}`}
            action={
              <Button size="small" onClick={handleExtract} data-testid="retry-extract-btn">
                重新抽取
              </Button>
            }
            className="mb-4"
            data-testid="extraction-error"
          />
        )}

        {/* Extracting in progress */}
        {isExtracting && (
          <div
            className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4"
            data-testid="extraction-progress"
          >
            <div className="mb-2 flex items-center gap-2 text-blue-600">
              <LoadingOutlined />
              <span className="font-medium">正在调用 AI 分析招标文件</span>
            </div>
            <Progress percent={Math.round(extractionProgress)} size="small" status="active" />
            <div className="text-text-secondary mt-1 text-xs">
              {extractionMessage || '正在分析...'}
            </div>
          </div>
        )}

        {/* Not yet extracted — show trigger button */}
        {!hasExtractionResult && !isExtracting && !error && (
          <div
            className="flex items-center justify-between rounded-lg border border-dashed border-gray-300 p-4"
            data-testid="extraction-trigger"
          >
            <div className="flex items-center gap-3">
              <FileSearchOutlined style={{ fontSize: 20 }} className="text-text-secondary" />
              <span>
                招标文件已完成解析，共识别 {parsedTender.totalPages} 页内容。
                点击右侧按钮开始抽取需求与评分模型。
              </span>
            </div>
            <Button
              type="primary"
              icon={<FileSearchOutlined />}
              onClick={handleExtract}
              loading={extractionLoading}
              data-testid="extract-btn"
            >
              抽取需求与评分模型
            </Button>
          </div>
        )}

        {/* Extraction results — Requirements + Scoring Model tabs */}
        {hasExtractionResult && (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'requirements',
                label: `需求清单 (${requirements.length})`,
                children: (
                  <RequirementsList
                    requirements={requirements}
                    mandatoryItems={mandatoryItems}
                    onUpdate={updateRequirement}
                  />
                ),
              },
              {
                key: 'scoring',
                label: '评分模型',
                children: scoringModel ? (
                  <ScoringModelEditor
                    scoringModel={scoringModel}
                    onUpdateCriterion={(criterionId, patch) =>
                      updateScoringCriterion(projectId, criterionId, patch)
                    }
                    onConfirm={() => confirmScoringModel(projectId)}
                  />
                ) : (
                  <div className="text-text-secondary p-8 text-center">评分模型数据加载中...</div>
                ),
              },
              {
                key: 'mandatory',
                label: <MandatoryItemsBadge summary={mandatorySummary} />,
                children: (
                  <MandatoryItemsList
                    items={mandatoryItems}
                    summary={mandatorySummary}
                    detecting={isMandatoryDetecting}
                    progress={mandatoryDetectionProgress}
                    progressMessage={mandatoryDetectionMessage}
                    error={mandatoryDetectionError}
                    onDetect={handleDetectMandatory}
                    onUpdate={updateMandatoryItem}
                    onAdd={(content, sourceText, sourcePages) =>
                      addMandatoryItem(projectId, content, sourceText, sourcePages)
                    }
                  />
                ),
              },
              {
                key: 'seeds',
                label: <StrategySeedBadge summary={seedSummary} />,
                children: (
                  <StrategySeedList
                    seeds={seeds}
                    summary={seedSummary}
                    generating={isSeedGenerating}
                    progress={seedGenerationProgress}
                    progressMessage={seedGenerationMessage}
                    error={seedGenerationError}
                    onGenerate={(sourceMaterial) => generateSeeds(projectId, sourceMaterial)}
                    onUpdate={updateSeed}
                    onDelete={deleteSeed}
                    onAdd={(title, reasoning, suggestion) =>
                      addSeed(projectId, title, reasoning, suggestion)
                    }
                    onConfirmAll={async () => {
                      if (!seeds) return
                      const pendingSeeds = seeds.filter((s) => s.status === 'pending')
                      for (const s of pendingSeeds) {
                        await updateSeed(s.id, { status: 'confirmed' })
                      }
                    }}
                  />
                ),
              },
              {
                key: 'fog-map',
                label: <FogMapBadge summary={fogMapSummary} />,
                children: (
                  <FogMapView
                    fogMap={fogMap}
                    fogMapSummary={fogMapSummary}
                    requirements={requirements}
                    generating={isFogMapGenerating}
                    progress={fogMapProgress}
                    progressMessage={fogMapMessage}
                    error={fogMapError}
                    onGenerate={() => generateFogMap(projectId)}
                    onConfirm={confirmCertainty}
                    onBatchConfirm={() => batchConfirmCertainty(projectId)}
                    onNavigateToRequirements={handleNavigateToRequirements}
                  />
                ),
              },
            ]}
            data-testid="extraction-tabs"
          />
        )}
      </div>

      {/* Re-upload zone */}
      {!hasExtractionResult && (
        <div className="border-border border-t p-4">
          <TenderUploadZone projectId={projectId} disabled={loading} />
        </div>
      )}
    </div>
  )
}
