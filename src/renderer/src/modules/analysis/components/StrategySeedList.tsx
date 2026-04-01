import { useState } from 'react'
import { Button, Alert, Progress, Modal, Input, message } from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  CheckOutlined,
  LoadingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { StrategySeed, StrategySeedSummary } from '@shared/analysis-types'
import { StrategySeedCard } from './StrategySeedCard'
import { MaterialInputModal } from './MaterialInputModal'

const { TextArea } = Input

interface StrategySeedListProps {
  seeds: StrategySeed[] | null
  summary: StrategySeedSummary | null
  generating: boolean
  progress: number
  progressMessage: string
  error: string | null
  onGenerate: (sourceMaterial: string) => Promise<void>
  onUpdate: (
    id: string,
    patch: Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: (title: string, reasoning: string, suggestion: string) => Promise<void>
  onConfirmAll: () => Promise<void>
}

export function StrategySeedList({
  seeds,
  summary,
  generating,
  progress,
  progressMessage,
  error,
  onGenerate,
  onUpdate,
  onDelete,
  onAdd,
  onConfirmAll,
}: StrategySeedListProps): React.JSX.Element {
  const [materialModalOpen, setMaterialModalOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addReasoning, setAddReasoning] = useState('')
  const [addSuggestion, setAddSuggestion] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const handleGenerate = async (sourceMaterial: string): Promise<void> => {
    setMaterialModalOpen(false)
    await onGenerate(sourceMaterial)
  }

  /** Show confirmation before re-generation when seeds already exist */
  const handleRegenerate = (): void => {
    Modal.confirm({
      title: '确认重新生成',
      content: '重新生成将覆盖当前种子，是否继续？',
      okText: '继续',
      cancelText: '取消',
      onOk: () => setMaterialModalOpen(true),
    })
  }

  const handleConfirm = async (id: string): Promise<void> => {
    await onUpdate(id, { status: 'confirmed' })
  }

  const handleAddSeed = async (): Promise<void> => {
    const trimmedTitle = addTitle.trim()
    const trimmedReasoning = addReasoning.trim()
    const trimmedSuggestion = addSuggestion.trim()

    if (!trimmedTitle || !trimmedReasoning || !trimmedSuggestion) {
      message.warning('标题、推理和建议均不能为空')
      return
    }

    setAddLoading(true)
    try {
      await onAdd(trimmedTitle, trimmedReasoning, trimmedSuggestion)
      setAddModalOpen(false)
      setAddTitle('')
      setAddReasoning('')
      setAddSuggestion('')
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setAddLoading(false)
    }
  }

  // Error state with no existing seeds — show error only
  if (error && !generating && (!seeds || seeds.length === 0)) {
    return (
      <div data-testid="seed-list">
        <Alert
          type="error"
          showIcon
          message={`策略种子生成失败：${error}`}
          action={
            <Button size="small" onClick={() => setMaterialModalOpen(true)}>
              重试
            </Button>
          }
          className="mb-4"
        />
        <MaterialInputModal
          open={materialModalOpen}
          loading={generating}
          onGenerate={handleGenerate}
          onCancel={() => setMaterialModalOpen(false)}
        />
      </div>
    )
  }

  // Generating in progress
  if (generating) {
    return (
      <div data-testid="seed-list">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <LoadingOutlined />
            <span className="font-medium">正在生成策略种子</span>
          </div>
          <Progress percent={Math.round(progress)} size="small" status="active" />
          <div className="text-text-secondary mt-1 text-xs">{progressMessage || '正在分析...'}</div>
        </div>
      </div>
    )
  }

  // Never generated — show upload CTA
  if (seeds === null) {
    return (
      <div data-testid="seed-list">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-8">
          <UploadOutlined style={{ fontSize: 32 }} className="text-text-secondary mb-3" />
          <div className="mb-1 text-base font-medium">上传客户沟通素材</div>
          <div className="text-text-secondary mb-4 text-center text-sm">
            粘贴会议纪要、邮件或聊天记录，AI 将从中提取隐性需求生成策略种子。
            <br />
            策略种子帮助方案捕获招标文件之外客户真正在意的要点。
          </div>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setMaterialModalOpen(true)}
            data-testid="seed-generate"
          >
            上传沟通素材
          </Button>
        </div>
        <MaterialInputModal
          open={materialModalOpen}
          loading={generating}
          onGenerate={handleGenerate}
          onCancel={() => setMaterialModalOpen(false)}
        />
      </div>
    )
  }

  // Generated but 0 seeds
  if (seeds.length === 0) {
    return (
      <div data-testid="seed-list">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-8">
          <div className="mb-1 text-base font-medium">未发现隐性需求线索</div>
          <div className="text-text-secondary mb-4 text-sm">
            AI 未从沟通素材中识别到明显的隐性需求。您可以重新上传更详细的素材，或手动添加策略种子。
          </div>
          <div className="flex gap-2">
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRegenerate}
              data-testid="seed-generate"
            >
              重新生成
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
              data-testid="seed-add-manual"
            >
              手动添加
            </Button>
          </div>
        </div>
        <MaterialInputModal
          open={materialModalOpen}
          loading={generating}
          onGenerate={handleGenerate}
          onCancel={() => setMaterialModalOpen(false)}
        />
        <AddSeedModal
          open={addModalOpen}
          loading={addLoading}
          title={addTitle}
          reasoning={addReasoning}
          suggestion={addSuggestion}
          onTitleChange={setAddTitle}
          onReasoningChange={setAddReasoning}
          onSuggestionChange={setAddSuggestion}
          onOk={handleAddSeed}
          onCancel={() => setAddModalOpen(false)}
        />
      </div>
    )
  }

  // Has seeds — render list
  const hasPending = summary ? summary.pending > 0 : seeds.some((s) => s.status === 'pending')

  return (
    <div data-testid="seed-list">
      {/* Error banner (re-generation failed but existing seeds still visible) */}
      {error && !generating && (
        <Alert
          type="error"
          showIcon
          closable
          message={`重新生成失败：${error}`}
          action={
            <Button size="small" onClick={handleRegenerate}>
              重试
            </Button>
          }
          className="mb-4"
        />
      )}

      {/* Summary bar */}
      {summary && (
        <div
          className="mb-4 flex items-center gap-4 rounded-lg bg-gray-50 px-4 py-2 text-sm"
          data-testid="seed-summary"
        >
          <span>
            共 <strong>{summary.total}</strong> 个策略种子
          </span>
          {summary.confirmed > 0 && (
            <span className="text-green-600">已确认 {summary.confirmed}</span>
          )}
          {summary.adjusted > 0 && (
            <span className="text-orange-500">已调整 {summary.adjusted}</span>
          )}
          {summary.pending > 0 && <span className="text-blue-500">待确认 {summary.pending}</span>}
        </div>
      )}

      {/* Action bar */}
      <div className="mb-4 flex items-center gap-2">
        <Button icon={<ReloadOutlined />} onClick={handleRegenerate} data-testid="seed-generate">
          重新生成
        </Button>
        <Button
          icon={<PlusOutlined />}
          onClick={() => setAddModalOpen(true)}
          data-testid="seed-add-manual"
        >
          手动添加
        </Button>
        {hasPending && (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onConfirmAll}
            data-testid="seed-confirm-all"
          >
            全部确认
          </Button>
        )}
      </div>

      {/* Seed cards */}
      <div className="flex flex-col gap-3">
        {seeds.map((seed) => (
          <StrategySeedCard
            key={seed.id}
            seed={seed}
            onConfirm={handleConfirm}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      <MaterialInputModal
        open={materialModalOpen}
        loading={generating}
        onGenerate={handleGenerate}
        onCancel={() => setMaterialModalOpen(false)}
      />
      <AddSeedModal
        open={addModalOpen}
        loading={addLoading}
        title={addTitle}
        reasoning={addReasoning}
        suggestion={addSuggestion}
        onTitleChange={setAddTitle}
        onReasoningChange={setAddReasoning}
        onSuggestionChange={setAddSuggestion}
        onOk={handleAddSeed}
        onCancel={() => setAddModalOpen(false)}
      />
    </div>
  )
}

/** Internal modal for manually adding a seed */
function AddSeedModal({
  open,
  loading,
  title,
  reasoning,
  suggestion,
  onTitleChange,
  onReasoningChange,
  onSuggestionChange,
  onOk,
  onCancel,
}: {
  open: boolean
  loading: boolean
  title: string
  reasoning: string
  suggestion: string
  onTitleChange: (v: string) => void
  onReasoningChange: (v: string) => void
  onSuggestionChange: (v: string) => void
  onOk: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Modal
      title="手动添加策略种子"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="添加"
      cancelText="取消"
      afterClose={() => {
        onTitleChange('')
        onReasoningChange('')
        onSuggestionChange('')
      }}
    >
      <div className="mb-3">
        <div className="mb-1 text-sm font-medium">标题</div>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="策略种子标题（10-30字）"
          maxLength={30}
        />
      </div>
      <div className="mb-3">
        <div className="mb-1 text-sm font-medium">分析推理</div>
        <TextArea
          value={reasoning}
          onChange={(e) => onReasoningChange(e.target.value)}
          placeholder="为什么这是一个隐性需求"
          autoSize={{ minRows: 2, maxRows: 6 }}
        />
      </div>
      <div>
        <div className="mb-1 text-sm font-medium">投标策略建议</div>
        <TextArea
          value={suggestion}
          onChange={(e) => onSuggestionChange(e.target.value)}
          placeholder="方案中如何体现和回应"
          autoSize={{ minRows: 2, maxRows: 6 }}
        />
      </div>
    </Modal>
  )
}
