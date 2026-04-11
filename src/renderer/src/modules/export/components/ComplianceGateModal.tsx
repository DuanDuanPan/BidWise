import { useState } from 'react'
import { Modal, Tag, Progress, Button, Alert } from 'antd'
import { ExclamationCircleFilled, WarningOutlined } from '@ant-design/icons'
import type { ExportComplianceGate, MandatoryComplianceItem } from '@shared/analysis-types'

interface ComplianceGateModalProps {
  open: boolean
  gateData: ExportComplianceGate | null
  onClose: () => void
  onForceExport: () => void
}

const STATUS_TAG_PROPS: Record<string, { color: string; label: string }> = {
  uncovered: { color: 'red', label: '未覆盖' },
  unlinked: { color: 'red', label: '未关联' },
  partial: { color: 'orange', label: '部分覆盖' },
}

function BlockingItemList({ items }: { items: MandatoryComplianceItem[] }): React.JSX.Element {
  return (
    <div className="max-h-64 overflow-y-auto" data-testid="compliance-gate-blocking-items">
      {items.map((item) => {
        const tagProps = STATUS_TAG_PROPS[item.coverageStatus]
        return (
          <div
            key={item.mandatoryItemId}
            className="flex items-start gap-2 border-b border-gray-100 py-2 last:border-b-0"
          >
            <Tag color={tagProps?.color} className="mt-0.5 shrink-0">
              {tagProps?.label}
            </Tag>
            <span className="text-sm">{item.content}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ComplianceGateModal({
  open,
  gateData,
  onClose,
  onForceExport,
}: ComplianceGateModalProps): React.JSX.Element {
  const [confirmingForce, setConfirmingForce] = useState(false)

  if (!gateData) {
    return <></>
  }

  const isBlocked = gateData.status === 'blocked'
  const isNotReady = gateData.status === 'not-ready'

  const handleForceExport = (): void => {
    if (!confirmingForce) {
      setConfirmingForce(true)
      return
    }
    setConfirmingForce(false)
    onForceExport()
  }

  const handleClose = (): void => {
    setConfirmingForce(false)
    onClose()
  }

  const footer = isNotReady
    ? [
        <Button key="back" type="primary" onClick={handleClose} data-testid="compliance-gate-back">
          返回修改
        </Button>,
      ]
    : [
        <Button key="back" onClick={handleClose} data-testid="compliance-gate-back">
          返回修改
        </Button>,
        confirmingForce ? (
          <Button
            key="confirm-force"
            danger
            type="primary"
            onClick={handleForceExport}
            data-testid="compliance-gate-confirm-force"
          >
            确认强制导出
          </Button>
        ) : (
          <Button
            key="force"
            danger
            onClick={handleForceExport}
            data-testid="compliance-gate-force"
          >
            仍然导出
          </Button>
        ),
      ]

  return (
    <Modal
      open={open}
      title={
        <span className="flex items-center gap-2">
          {isNotReady ? (
            <WarningOutlined style={{ color: '#faad14' }} />
          ) : (
            <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />
          )}
          {isNotReady ? '必做项检测未完成' : '必做项合规检查未通过'}
        </span>
      }
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={footer}
      data-testid="compliance-gate-modal"
      width={560}
    >
      {isNotReady && (
        <Alert
          type="warning"
          showIcon
          message="尚未完成必做项检测，请先返回分析阶段执行检测。"
          className="mb-4"
          data-testid="compliance-gate-not-ready-alert"
        />
      )}

      {isBlocked && (
        <>
          <div className="mb-4">
            <div className="mb-2 text-sm text-gray-600">{gateData.message}</div>
            <Progress
              percent={gateData.complianceRate}
              status={gateData.complianceRate >= 80 ? 'success' : 'exception'}
              data-testid="compliance-gate-progress"
            />
          </div>

          <div className="mb-2 text-sm font-medium">
            以下必做项尚未完全覆盖（{gateData.blockingItems.length} 项）：
          </div>

          <BlockingItemList items={gateData.blockingItems} />

          {confirmingForce && (
            <Alert
              type="error"
              showIcon
              message="强制导出可能导致交付文件遗漏关键要求，确定要继续吗？"
              className="mt-4"
              data-testid="compliance-gate-force-confirm-alert"
            />
          )}
        </>
      )}
    </Modal>
  )
}
