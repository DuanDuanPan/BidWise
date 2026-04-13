import { useState } from 'react'
import { App, Table, Tag, Button, Progress, Alert, Modal, Input, Form, message, Tooltip } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  LoadingOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { MandatoryItem, MandatoryItemSummary } from '@shared/analysis-types'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  detected: { label: '待审核', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  dismissed: { label: '已驳回', color: 'default' },
}

export interface MandatoryItemsListProps {
  items: MandatoryItem[] | null
  summary: MandatoryItemSummary | null
  detecting: boolean
  progress: number
  progressMessage: string
  error: string | null
  onDetect: () => void
  onUpdate: (
    id: string,
    patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
  ) => Promise<void>
  onAdd: (content: string, sourceText?: string, sourcePages?: number[]) => Promise<void>
}

export function MandatoryItemsList({
  items,
  summary,
  detecting,
  progress,
  progressMessage,
  error,
  onDetect,
  onUpdate,
  onAdd,
}: MandatoryItemsListProps): React.JSX.Element {
  const { modal } = App.useApp()
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [form] = Form.useForm()

  const renderErrorAlert = (onRetry: () => void, closable = false): React.JSX.Element => (
    <Alert
      type="error"
      showIcon
      closable={closable}
      icon={<ExclamationCircleOutlined />}
      message={`*项检测失败：${error}`}
      className={closable ? 'mb-3' : undefined}
      action={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetry}
          data-testid="mandatory-retry-btn"
        >
          重新检测
        </Button>
      }
      data-testid="mandatory-error"
    />
  )

  const confirmRedetect = (): void => {
    modal.confirm({
      title: '确认重新检测',
      icon: <ExclamationCircleOutlined />,
      content: '重新检测将清除现有的必响应项及其审核结果，是否继续？',
      okText: '确认重新检测',
      cancelText: '取消',
      onOk: onDetect,
    })
  }

  const handleConfirm = async (id: string): Promise<void> => {
    try {
      await onUpdate(id, { status: 'confirmed' })
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleDismiss = async (id: string): Promise<void> => {
    try {
      await onUpdate(id, { status: 'dismissed' })
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleAdd = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      const sourcePages: number[] | undefined = values.sourcePages
        ? [
            ...new Set<number>(
              values.sourcePages
                .split(/[,，\s]+/)
                .map((s: string) => parseInt(s.trim(), 10))
                .filter((n: number) => !isNaN(n))
            ),
          ].sort((a, b) => a - b)
        : undefined

      await onAdd(values.content, values.sourceText, sourcePages)
      setAddModalOpen(false)
      form.resetFields()
      message.success('已添加*项')
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  // Error state with no existing items — show error-only view
  if (error && !detecting && !items) {
    return <div data-testid="mandatory-items-list">{renderErrorAlert(onDetect)}</div>
  }

  // Detection in progress
  if (detecting) {
    return (
      <div data-testid="mandatory-items-list">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <LoadingOutlined />
            <span className="font-medium">正在识别必响应项</span>
          </div>
          <Progress percent={Math.round(progress)} size="small" status="active" />
          <div className="text-text-secondary mt-1 text-xs">{progressMessage || '正在分析...'}</div>
        </div>
      </div>
    )
  }

  // Never run state
  if (items === null) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 py-16"
        data-testid="mandatory-items-list"
      >
        <div className="text-text-secondary text-sm">尚未执行必响应项检测</div>
        <Button
          type="primary"
          onClick={onDetect}
          disabled={detecting}
          loading={detecting}
          data-testid="mandatory-start-btn"
        >
          {detecting ? '检测中...' : '开始检测'}
        </Button>
      </div>
    )
  }

  // Zero results state
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 py-16"
        data-testid="mandatory-items-list"
      >
        {error && !detecting && renderErrorAlert(confirmRedetect, true)}
        <div className="text-text-secondary text-sm">
          本次未识别出必响应项，请人工复核或手动添加
        </div>
        <div className="flex gap-3">
          <Button
            icon={<ReloadOutlined />}
            onClick={confirmRedetect}
            disabled={detecting}
            loading={detecting}
            data-testid="mandatory-redetect-btn"
          >
            {detecting ? '检测中...' : '重新检测'}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            data-testid="mandatory-add-btn"
          >
            添加*项
          </Button>
        </div>
        {renderAddModal()}
      </div>
    )
  }

  const columns: ColumnsType<MandatoryItem> = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_val, _record, index) => (
        <span className="text-text-secondary">{String(index + 1).padStart(2, '0')}</span>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      render: (text: string) => <span style={{ color: '#FF4D4F', fontWeight: 500 }}>{text}</span>,
    },
    {
      title: '原文摘录',
      dataIndex: 'sourceText',
      key: 'sourceText',
      width: 250,
      responsive: ['lg' as const],
      render: (text: string) =>
        text ? (
          <Tooltip title={text}>
            <span className="text-text-secondary line-clamp-2 text-xs">{text}</span>
          </Tooltip>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      title: '来源页码',
      dataIndex: 'sourcePages',
      key: 'sourcePages',
      width: 100,
      render: (pages: number[]) =>
        pages.length > 0 ? (
          <span className="text-text-secondary">{pages.map((p) => `P.${p}`).join(', ')}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      sorter: (a, b) => a.confidence - b.confidence,
      defaultSortOrder: 'descend' as const,
      render: (val: number) => {
        const pct = Math.round(val * 100)
        let color = '#52C41A'
        if (val < 0.7) color = '#FF4D4F'
        else if (val < 0.9) color = '#FAAD14'
        return <Progress percent={pct} size="small" strokeColor={color} format={() => `${pct}%`} />
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      filters: Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({ text: label, value })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => {
        const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.detected
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_val, record) => {
        if (record.status === 'confirmed' || record.status === 'dismissed') {
          return (
            <Button size="small" onClick={() => void onUpdate(record.id, { status: 'detected' })}>
              撤回
            </Button>
          )
        }
        return (
          <div className="flex gap-1">
            <Button
              size="small"
              type="link"
              icon={<CheckOutlined />}
              style={{ color: '#52C41A' }}
              onClick={() => void handleConfirm(record.id)}
              data-testid={`mandatory-confirm-${record.id}`}
            >
              确认
            </Button>
            <Button
              size="small"
              type="link"
              icon={<CloseOutlined />}
              style={{ color: '#999' }}
              onClick={() => void handleDismiss(record.id)}
              data-testid={`mandatory-dismiss-${record.id}`}
            >
              驳回
            </Button>
          </div>
        )
      },
    },
  ]

  function renderAddModal(): React.JSX.Element {
    return (
      <Modal
        title="添加必响应项"
        open={addModalOpen}
        onOk={() => void handleAdd()}
        onCancel={() => {
          setAddModalOpen(false)
          form.resetFields()
        }}
        okText="添加"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="content"
            label="内容描述"
            rules={[{ required: true, message: '请输入*项内容描述' }]}
          >
            <Input.TextArea rows={3} placeholder="请输入必响应项的描述" />
          </Form.Item>
          <Form.Item name="sourceText" label="原文摘录">
            <Input.TextArea rows={2} placeholder="可选：招标文件中的原文内容" />
          </Form.Item>
          <Form.Item name="sourcePages" label="来源页码">
            <Input placeholder="可选：页码，多个用逗号分隔，如 5, 12, 23" />
          </Form.Item>
        </Form>
      </Modal>
    )
  }

  return (
    <div data-testid="mandatory-items-list">
      {/* Error banner (shown above existing items when re-detection fails) */}
      {error && !detecting && renderErrorAlert(confirmRedetect, true)}

      {/* Summary bar */}
      <div className="mb-3 flex items-center justify-between" data-testid="mandatory-summary">
        <div className="text-text-secondary text-sm">
          共{' '}
          <span style={{ color: '#FF4D4F', fontWeight: 600 }}>
            {summary?.total ?? items.length}
          </span>{' '}
          项
          {summary && (
            <>
              {' | '}已确认 {summary.confirmed}
              {' | '}已驳回 {summary.dismissed}
              {' | '}待审核 {summary.pending}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={confirmRedetect}
            disabled={detecting}
            loading={detecting}
            data-testid="mandatory-redetect-btn"
          >
            {detecting ? '检测中...' : '重新检测'}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            data-testid="mandatory-add-btn"
          >
            添加*项
          </Button>
        </div>
      </div>

      <Table<MandatoryItem>
        columns={columns}
        dataSource={items}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 500 }}
        rowClassName={(record) => (record.status === 'dismissed' ? 'opacity-50' : '')}
        onRow={() => ({
          style: { borderLeft: '3px solid #FF4D4F' },
        })}
        data-testid="mandatory-items-table"
      />

      {renderAddModal()}
    </div>
  )
}
