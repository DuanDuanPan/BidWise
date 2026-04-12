import React, { useState, useCallback } from 'react'
import { Button, Tag, Input, Space } from 'antd'
import type { AdversarialFinding, HandleFindingAction } from '@shared/adversarial-types'

const { TextArea } = Input

const STATUS_STYLES: Record<
  string,
  { borderColor: string; background: string; label?: string; labelColor?: string }
> = {
  pending: { borderColor: '#FF4D4F', background: '#FFFFFF' },
  accepted: {
    borderColor: '#52C41A',
    background: '#F6FFED',
    label: '✓ 已接受',
    labelColor: '#52C41A',
  },
  rejected: {
    borderColor: '#D9D9D9',
    background: '#FAFAFA',
    label: '✗ 已反驳',
    labelColor: '#8C8C8C',
  },
  'needs-decision': {
    borderColor: '#722ED1',
    background: '#F9F0FF',
    label: '⏳ 待决策',
    labelColor: '#722ED1',
  },
}

const SEVERITY_STYLES: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#FF4D4F', color: '#FFFFFF' },
  major: { bg: '#FA8C16', color: '#FFFFFF' },
  minor: { bg: '#D9D9D9', color: '#595959' },
}

interface AdversarialFindingCardProps {
  finding: AdversarialFinding
  onAction: (findingId: string, action: HandleFindingAction, rebuttalReason?: string) => void
  onNavigateToSection?: (finding: AdversarialFinding) => void
}

export const AdversarialFindingCard: React.FC<AdversarialFindingCardProps> = ({
  finding,
  onAction,
  onNavigateToSection,
}) => {
  const [rebuttalOpen, setRebuttalOpen] = useState(false)
  const [rebuttalText, setRebuttalText] = useState('')
  const statusStyle = STATUS_STYLES[finding.status] ?? STATUS_STYLES.pending
  const severityStyle = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.major
  const isHandled = finding.status !== 'pending'
  const isNeedsDecision = finding.status === 'needs-decision'

  const handleAccept = useCallback(() => {
    onAction(finding.id, 'accepted')
  }, [finding.id, onAction])

  const handleReject = useCallback(() => {
    if (!rebuttalOpen) {
      setRebuttalOpen(true)
      return
    }
    const trimmed = rebuttalText.trim()
    if (!trimmed) return
    onAction(finding.id, 'rejected', trimmed)
    setRebuttalOpen(false)
    setRebuttalText('')
  }, [finding.id, onAction, rebuttalOpen, rebuttalText])

  const handleNeedsDecision = useCallback(() => {
    onAction(finding.id, 'needs-decision')
  }, [finding.id, onAction])

  const handleSectionClick = useCallback(() => {
    if (finding.sectionLocator && onNavigateToSection) {
      onNavigateToSection(finding)
    }
  }, [finding, onNavigateToSection])

  return (
    <div
      style={{
        borderLeft: `3px solid ${statusStyle.borderColor}`,
        background: statusStyle.background,
        borderRadius: 6,
        padding: isHandled ? '8px 12px' : '12px',
        marginBottom: 8,
        animation: isNeedsDecision ? 'pulse-border 2s infinite' : undefined,
      }}
    >
      {/* Header: severity badge + role + status label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: isHandled ? 0 : 8,
          flexWrap: 'wrap',
        }}
      >
        <Tag
          style={{
            background: severityStyle.bg,
            color: severityStyle.color,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: '18px',
            padding: '0 6px',
          }}
        >
          {finding.severity}
        </Tag>
        <Tag style={{ fontSize: 12 }}>{finding.roleName}</Tag>
        {finding.contradictionGroupId && (
          <span style={{ fontSize: 12, color: '#FA8C16' }}>⚡ 矛盾</span>
        )}
        {statusStyle.label && (
          <span
            style={{
              fontSize: 12,
              color: statusStyle.labelColor,
              fontWeight: 500,
              marginLeft: 'auto',
            }}
          >
            {statusStyle.label}
          </span>
        )}
      </div>

      {/* Content — collapsed for handled findings */}
      {!isHandled && (
        <>
          <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.6, marginBottom: 8 }}>
            {finding.content}
          </div>

          {finding.sectionRef && (
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>
              📍{' '}
              {finding.sectionLocator ? (
                <a onClick={handleSectionClick} style={{ color: '#1677FF', cursor: 'pointer' }}>
                  {finding.sectionRef}
                </a>
              ) : (
                finding.sectionRef
              )}
            </div>
          )}

          {finding.suggestion && (
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
              💡 {finding.suggestion}
            </div>
          )}

          {/* Rebuttal TextArea */}
          {rebuttalOpen && (
            <div style={{ marginBottom: 8 }}>
              <TextArea
                rows={2}
                placeholder="请输入反驳理由（必填）"
                value={rebuttalText}
                onChange={(e) => setRebuttalText(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>
          )}

          {/* Action buttons */}
          <Space size="small">
            <Button size="small" type="primary" ghost onClick={handleAccept}>
              接受并修改
            </Button>
            <Button size="small" onClick={handleReject}>
              {rebuttalOpen ? '提交反驳' : '反驳'}
            </Button>
            {rebuttalOpen && (
              <Button
                size="small"
                onClick={() => {
                  setRebuttalOpen(false)
                  setRebuttalText('')
                }}
              >
                取消
              </Button>
            )}
            <Button size="small" onClick={handleNeedsDecision}>
              请求指导
            </Button>
          </Space>
        </>
      )}

      {/* Collapsed view for handled findings */}
      {isHandled && (
        <span
          style={{
            fontSize: 13,
            color: '#8C8C8C',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
            marginTop: 4,
          }}
        >
          {finding.content.length > 60 ? finding.content.slice(0, 60) + '…' : finding.content}
        </span>
      )}
    </div>
  )
}
