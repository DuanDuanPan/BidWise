import { useEffect, useState } from 'react'
import { Table, InputNumber, Input, Button, Tag, message } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ScoringModel, ScoringCriterion, ScoringSubItem } from '@shared/analysis-types'

export interface ScoringModelEditorProps {
  scoringModel: ScoringModel
  onUpdateCriterion: (
    criterionId: string,
    patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
  ) => Promise<void>
  onConfirm: () => Promise<void>
}

export function ScoringModelEditor({
  scoringModel,
  onUpdateCriterion,
  onConfirm,
}: ScoringModelEditorProps): React.JSX.Element {
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [reasoningDrafts, setReasoningDrafts] = useState<Record<string, string>>({})
  const isConfirmed = scoringModel.confirmedAt !== null

  useEffect(() => {
    setReasoningDrafts((prev) => {
      let changed = false
      const next = { ...prev }
      const currentCriterionIds = new Set(scoringModel.criteria.map((criterion) => criterion.id))

      for (const criterionId of Object.keys(next)) {
        if (!currentCriterionIds.has(criterionId)) {
          delete next[criterionId]
          changed = true
        }
      }

      for (const criterion of scoringModel.criteria) {
        if (next[criterion.id] === criterion.reasoning) {
          delete next[criterion.id]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [scoringModel.criteria])

  const handleConfirm = async (): Promise<void> => {
    setConfirmLoading(true)
    try {
      await onConfirm()
      message.success('评分模型已确认')
    } catch {
      message.error('确认失败，请重试')
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleCriterionUpdate = async (
    criterionId: string,
    patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
  ): Promise<void> => {
    try {
      await onUpdateCriterion(criterionId, patch)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '评分模型保存失败，请重试')
    }
  }

  const handleReasoningChange = (criterionId: string, value: string): void => {
    setReasoningDrafts((prev) => {
      if (prev[criterionId] === value) {
        return prev
      }

      return {
        ...prev,
        [criterionId]: value,
      }
    })
  }

  const handleReasoningSave = async (
    criterionId: string,
    currentReasoning: string
  ): Promise<void> => {
    const draft = reasoningDrafts[criterionId]
    if (draft === undefined || draft === currentReasoning) {
      return
    }

    await handleCriterionUpdate(criterionId, {
      reasoning: draft,
      status: 'modified',
    })
  }

  const subColumns: ColumnsType<ScoringSubItem> = [
    {
      title: '子评分项',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <span className="pl-6">· {name}</span>,
    },
    {
      title: '最高分值',
      dataIndex: 'maxScore',
      key: 'maxScore',
      width: 100,
    },
    {
      title: '评分要点',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '来源',
      dataIndex: 'sourcePages',
      key: 'sourcePages',
      width: 100,
      render: (pages: number[]) => (
        <span className="text-text-secondary">{pages.map((p) => `P.${p}`).join(', ')}</span>
      ),
    },
  ]

  const columns: ColumnsType<ScoringCriterion> = [
    {
      title: '评分类别',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      render: (cat: string) => <span className="font-medium">{cat}</span>,
    },
    {
      title: '最高分值',
      dataIndex: 'maxScore',
      key: 'maxScore',
      width: 120,
      render: (val: number, record) =>
        isConfirmed ? (
          val
        ) : (
          <InputNumber
            size="small"
            value={val}
            min={0}
            onChange={(newVal) => {
              if (newVal !== null) {
                void handleCriterionUpdate(record.id, { maxScore: newVal, status: 'modified' })
              }
            }}
            data-testid={`score-input-${record.id}`}
          />
        ),
    },
    {
      title: '权重(%)',
      dataIndex: 'weight',
      key: 'weight',
      width: 100,
      render: (w: number) => `${Math.round(w * 100)}%`,
    },
    {
      title: '推理依据',
      dataIndex: 'reasoning',
      key: 'reasoning',
      render: (text: string, record) =>
        isConfirmed ? (
          text
        ) : (
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={reasoningDrafts[record.id] ?? text}
            onChange={(e) => handleReasoningChange(record.id, e.target.value)}
            onBlur={() => void handleReasoningSave(record.id, text)}
            data-testid={`reasoning-input-${record.id}`}
          />
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const color = status === 'confirmed' ? 'green' : status === 'modified' ? 'orange' : 'blue'
        const label =
          status === 'confirmed' ? '已确认' : status === 'modified' ? '已修改' : '已抽取'
        return <Tag color={color}>{label}</Tag>
      },
    },
  ]

  const totalCriteriaScore = scoringModel.criteria.reduce((sum, c) => sum + c.maxScore, 0)

  return (
    <div data-testid="scoring-model-editor">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-text-secondary text-sm">
          评分模型 — 总分 {scoringModel.totalScore} 分 | {scoringModel.criteria.length} 个评分大类 |{' '}
          {scoringModel.criteria.reduce((sum, c) => sum + c.subItems.length, 0)} 个子评分项
          {scoringModel.confirmedAt && (
            <span className="ml-3 text-green-600">
              v{scoringModel.version} | {new Date(scoringModel.confirmedAt).toLocaleDateString()}{' '}
              确认
            </span>
          )}
        </div>
      </div>

      {/* Main table with expandable sub-items */}
      <Table<ScoringCriterion>
        columns={columns}
        dataSource={scoringModel.criteria}
        rowKey="id"
        size="small"
        pagination={false}
        expandable={{
          expandedRowRender: (record) =>
            record.subItems.length > 0 ? (
              <Table<ScoringSubItem>
                columns={subColumns}
                dataSource={record.subItems}
                rowKey="id"
                size="small"
                pagination={false}
                showHeader={false}
              />
            ) : null,
          rowExpandable: (record) => record.subItems.length > 0,
        }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <span className="font-medium">总分合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <span className="font-bold text-blue-600">{totalCriteriaScore}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2}>100%</Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              {scoringModel.criteria.length} 个评分大类，
              {scoringModel.criteria.reduce((sum, c) => sum + c.subItems.length, 0)} 个子评分项
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} />
          </Table.Summary.Row>
        )}
        data-testid="scoring-table"
      />

      {/* Action buttons */}
      <div className="mt-4 flex justify-end gap-3">
        {isConfirmed ? (
          <Button
            type="primary"
            disabled
            icon={<CheckCircleOutlined />}
            data-testid="confirmed-btn"
          >
            已确认
          </Button>
        ) : (
          <Button
            type="primary"
            onClick={handleConfirm}
            loading={confirmLoading}
            data-testid="confirm-btn"
          >
            确认评分模型
          </Button>
        )}
      </div>
    </div>
  )
}
