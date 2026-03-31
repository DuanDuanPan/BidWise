import { useState } from 'react'
import { Table, Tag, Select, Input, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { RequirementItem, RequirementCategory, MandatoryItem } from '@shared/analysis-types'

const CATEGORY_LABELS: Record<RequirementCategory, { label: string; color: string }> = {
  technical: { label: '技术要求', color: 'blue' },
  implementation: { label: '实施要求', color: 'green' },
  service: { label: '服务要求', color: 'cyan' },
  qualification: { label: '资质要求', color: 'orange' },
  commercial: { label: '商务要求', color: 'purple' },
  other: { label: '其他', color: 'default' },
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  medium: { label: '中', color: 'gold' },
  low: { label: '低', color: 'green' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  extracted: { label: '已抽取', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  modified: { label: '已修改', color: 'orange' },
  deleted: { label: '已删除', color: 'red' },
}

export interface RequirementsListProps {
  requirements: RequirementItem[]
  mandatoryItems?: MandatoryItem[] | null
  onUpdate: (
    id: string,
    patch: Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
  ) => Promise<void>
}

export function RequirementsList({
  requirements,
  mandatoryItems,
  onUpdate,
}: RequirementsListProps): React.JSX.Element {
  // Build a set of requirement IDs that are linked to mandatory items
  const mandatoryLinkedIds = new Set(
    (mandatoryItems ?? [])
      .filter((m) => m.linkedRequirementId && m.status !== 'dismissed')
      .map((m) => m.linkedRequirementId!)
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDesc, setEditingDesc] = useState('')

  const handleDescSave = async (id: string): Promise<void> => {
    if (!editingDesc.trim()) {
      setEditingId(null)
      return
    }

    try {
      await onUpdate(id, { description: editingDesc.trim(), status: 'modified' })
      setEditingId(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '需求保存失败，请重试')
    }
  }

  const startEditing = (id: string, text: string): void => {
    setEditingId(id)
    setEditingDesc(text)
  }

  const handleCategoryChange = async (id: string, category: RequirementCategory): Promise<void> => {
    try {
      await onUpdate(id, { category, status: 'modified' })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '需求保存失败，请重试')
    }
  }

  const handlePriorityChange = async (
    id: string,
    priority: RequirementItem['priority']
  ): Promise<void> => {
    try {
      await onUpdate(id, { priority, status: 'modified' })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '需求保存失败，请重试')
    }
  }

  const columns: ColumnsType<RequirementItem> = [
    {
      title: '编号',
      dataIndex: 'sequenceNumber',
      key: 'sequenceNumber',
      width: 70,
      sorter: (a, b) => a.sequenceNumber - b.sequenceNumber,
      render: (val: number) => (
        <span className="text-text-secondary">{String(val).padStart(2, '0')}</span>
      ),
    },
    {
      title: '需求描述',
      dataIndex: 'description',
      key: 'description',
      render: (text: string, record) => {
        if (editingId === record.id) {
          return (
            <Input.TextArea
              autoSize
              autoFocus
              defaultValue={text}
              onChange={(e) => setEditingDesc(e.target.value)}
              onBlur={() => handleDescSave(record.id)}
              onPressEnter={(e) => {
                e.preventDefault()
                void handleDescSave(record.id)
              }}
              data-testid={`edit-desc-${record.id}`}
            />
          )
        }
        return (
          <span
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onDoubleClick={() => startEditing(record.id, text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                startEditing(record.id, text)
              }
            }}
            data-testid={`desc-${record.id}`}
          >
            {text}
            {mandatoryLinkedIds.has(record.id) && (
              <Tag color="red" style={{ marginLeft: 6, fontSize: 11 }}>
                *项
              </Tag>
            )}
          </span>
        )
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      filters: Object.entries(CATEGORY_LABELS).map(([value, { label }]) => ({
        text: label,
        value,
      })),
      onFilter: (value, record) => record.category === value,
      render: (cat: RequirementCategory, record) => (
        <Select
          size="small"
          value={cat}
          onChange={(val) => void handleCategoryChange(record.id, val as RequirementCategory)}
          options={Object.entries(CATEGORY_LABELS).map(([value, { label, color }]) => ({
            value,
            label: <Tag color={color}>{label}</Tag>,
          }))}
          style={{ width: '100%' }}
          data-testid={`cat-select-${record.id}`}
        />
      ),
    },
    {
      title: '来源页码',
      dataIndex: 'sourcePages',
      key: 'sourcePages',
      width: 110,
      render: (pages: number[]) => (
        <span className="text-text-secondary">{pages.map((p) => `P.${p}`).join(', ')}</span>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      filters: Object.entries(PRIORITY_LABELS).map(([value, { label }]) => ({
        text: label,
        value,
      })),
      onFilter: (value, record) => record.priority === value,
      render: (priority: string, record) => (
        <Select
          size="small"
          value={priority}
          onChange={(val) =>
            void handlePriorityChange(record.id, val as RequirementItem['priority'])
          }
          options={Object.entries(PRIORITY_LABELS).map(([value, { label, color }]) => ({
            value,
            label: <Tag color={color}>{label}</Tag>,
          }))}
          style={{ width: '100%' }}
          data-testid={`priority-select-${record.id}`}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const info = STATUS_LABELS[status] ?? STATUS_LABELS.extracted
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
  ]

  return (
    <div data-testid="requirements-list">
      <div className="text-text-secondary mb-3 text-sm">共 {requirements.length} 条需求</div>
      <Table<RequirementItem>
        columns={columns}
        dataSource={requirements}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 500 }}
        data-testid="requirements-table"
      />
    </div>
  )
}
