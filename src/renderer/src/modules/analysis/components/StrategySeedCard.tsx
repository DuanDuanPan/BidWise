import { useState } from 'react'
import { Button, Tag, Input, Popconfirm, message } from 'antd'
import {
  CheckOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import type { StrategySeed, StrategySeedStatus } from '@shared/analysis-types'

const { TextArea } = Input

const STATUS_CONFIG: Record<StrategySeedStatus, { color: string; label: string; border: string }> =
  {
    pending: { color: 'blue', label: '待确认', border: 'border-l-blue-500' },
    confirmed: { color: 'green', label: '已确认', border: 'border-l-green-500' },
    adjusted: { color: 'orange', label: '已调整', border: 'border-l-orange-400' },
  }

interface StrategySeedCardProps {
  seed: StrategySeed
  onConfirm: (id: string) => Promise<void>
  onUpdate: (
    id: string,
    patch: Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function StrategySeedCard({
  seed,
  onConfirm,
  onUpdate,
  onDelete,
}: StrategySeedCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(seed.title)
  const [editReasoning, setEditReasoning] = useState(seed.reasoning)
  const [editSuggestion, setEditSuggestion] = useState(seed.suggestion)
  const [loading, setLoading] = useState(false)
  const [showExcerpt, setShowExcerpt] = useState(false)

  const config = STATUS_CONFIG[seed.status]

  const handleConfirm = async (): Promise<void> => {
    setLoading(true)
    try {
      await onConfirm(seed.id)
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    const trimmedTitle = editTitle.trim()
    const trimmedReasoning = editReasoning.trim()
    const trimmedSuggestion = editSuggestion.trim()

    if (!trimmedTitle || !trimmedReasoning || !trimmedSuggestion) {
      message.warning('标题、推理和建议均不能为空')
      return
    }

    setLoading(true)
    try {
      await onUpdate(seed.id, {
        title: trimmedTitle,
        reasoning: trimmedReasoning,
        suggestion: trimmedSuggestion,
      })
      setEditing(false)
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    setLoading(true)
    try {
      await onDelete(seed.id)
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleStartEdit = (): void => {
    setEditTitle(seed.title)
    setEditReasoning(seed.reasoning)
    setEditSuggestion(seed.suggestion)
    setEditing(true)
  }

  const handleCancelEdit = (): void => {
    setEditing(false)
  }

  return (
    <div
      className={`rounded-lg border border-l-4 bg-white p-4 shadow-sm ${config.border}`}
      data-testid="seed-card"
    >
      {/* Header: title + status + confidence */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="策略种子标题"
              className="mb-2"
            />
          ) : (
            <h4 className="text-base font-medium">{seed.title}</h4>
          )}
        </div>
        <div className="ml-3 flex items-center gap-2">
          <Tag color={config.color}>{config.label}</Tag>
          <span className="text-text-secondary text-xs">{Math.round(seed.confidence * 100)}%</span>
        </div>
      </div>

      {/* Reasoning */}
      <div className="mb-3">
        <div className="text-text-secondary mb-1 text-xs font-medium">分析推理</div>
        {editing ? (
          <TextArea
            value={editReasoning}
            onChange={(e) => setEditReasoning(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="分析推理过程"
          />
        ) : (
          <blockquote className="border-l-2 border-gray-300 pl-3 text-sm text-gray-600">
            {seed.reasoning}
          </blockquote>
        )}
      </div>

      {/* Suggestion */}
      <div className="mb-3">
        <div className="text-text-secondary mb-1 text-xs font-medium">投标策略建议</div>
        {editing ? (
          <TextArea
            value={editSuggestion}
            onChange={(e) => setEditSuggestion(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="投标方案建议"
          />
        ) : (
          <div className="text-sm">{seed.suggestion}</div>
        )}
      </div>

      {/* Source excerpt (collapsible) */}
      {seed.sourceExcerpt && !editing && (
        <div className="mb-3">
          <button
            type="button"
            className="text-text-secondary cursor-pointer text-xs underline"
            onClick={() => setShowExcerpt(!showExcerpt)}
          >
            {showExcerpt ? '收起原文摘录' : '查看原文摘录'}
          </button>
          {showExcerpt && (
            <div className="mt-1 rounded bg-gray-50 p-2 text-xs text-gray-500">
              {seed.sourceExcerpt}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={handleCancelEdit}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={loading}
            >
              保存
            </Button>
          </>
        ) : (
          <>
            {seed.status === 'pending' && (
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleConfirm}
                loading={loading}
                data-testid="seed-confirm"
              >
                确认
              </Button>
            )}
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={handleStartEdit}
              disabled={loading}
              data-testid="seed-edit"
            >
              编辑
            </Button>
            <Popconfirm
              title="确定删除该策略种子？"
              onConfirm={handleDelete}
              okText="删除"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={loading}
                data-testid="seed-delete"
              >
                删除
              </Button>
            </Popconfirm>
          </>
        )}
      </div>
    </div>
  )
}
