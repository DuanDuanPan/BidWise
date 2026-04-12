import React, { useState, useCallback } from 'react'
import { Button, Tag } from 'antd'
import { CheckOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import type { AttackChecklistItem, AttackChecklistItemStatus } from '@shared/attack-checklist-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const SEVERITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: '#FF4D4F', color: '#FFFFFF', label: '严重' },
  major: { bg: '#FA8C16', color: '#FFFFFF', label: '重要' },
  minor: { bg: '#1890FF', color: '#FFFFFF', label: '轻微' },
}

interface AttackChecklistItemCardProps {
  item: AttackChecklistItem
  onUpdateStatus: (itemId: string, status: AttackChecklistItemStatus) => void
  onNavigateToSection?: (locator: ChapterHeadingLocator) => void
}

export const AttackChecklistItemCard: React.FC<AttackChecklistItemCardProps> = ({
  item,
  onUpdateStatus,
  onNavigateToSection,
}) => {
  const [expanded, setExpanded] = useState(false)
  const severityStyle = SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.major

  const isAddressed = item.status === 'addressed'
  const isDismissed = item.status === 'dismissed'

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleAddress = useCallback(() => {
    onUpdateStatus(item.id, 'addressed')
  }, [item.id, onUpdateStatus])

  const handleDismiss = useCallback(() => {
    onUpdateStatus(item.id, 'dismissed')
  }, [item.id, onUpdateStatus])

  const handleSectionClick = useCallback(() => {
    if (item.targetSectionLocator && onNavigateToSection) {
      onNavigateToSection(item.targetSectionLocator)
    }
  }, [item.targetSectionLocator, onNavigateToSection])

  return (
    <div
      data-testid="attack-checklist-item-card"
      data-item-id={item.id}
      data-status={item.status}
      style={{
        borderLeft: `3px solid ${isAddressed ? '#52C41A' : isDismissed ? '#D9D9D9' : severityStyle.bg}`,
        backgroundColor: isDismissed ? 'rgba(0,0,0,0.02)' : isAddressed ? '#F6FFED' : '#FFFFFF',
        opacity: isDismissed ? 0.6 : 1,
        borderRadius: 4,
        padding: '8px 12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onClick={handleToggleExpand}
    >
      {/* Header row */}
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <Tag
          style={{
            backgroundColor: severityStyle.bg,
            color: severityStyle.color,
            border: 'none',
            fontSize: 11,
            lineHeight: '18px',
            padding: '0 6px',
          }}
          data-testid="severity-badge"
        >
          {severityStyle.label}
        </Tag>
        <Tag
          style={{
            fontSize: 11,
            lineHeight: '18px',
            padding: '0 6px',
          }}
        >
          {item.category}
        </Tag>
        {item.targetSection && (
          <span
            data-testid="target-section-link"
            onClick={(e) => {
              e.stopPropagation()
              handleSectionClick()
            }}
            style={{
              fontSize: 11,
              color: item.targetSectionLocator
                ? 'var(--color-brand)'
                : 'var(--color-text-tertiary)',
              cursor: item.targetSectionLocator ? 'pointer' : 'default',
              textDecoration: item.targetSectionLocator ? 'underline' : 'none',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            {item.targetSection}
          </span>
        )}
        {isAddressed && (
          <Tag
            color="success"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            data-testid="addressed-label"
          >
            已防御
          </Tag>
        )}
        {isDismissed && (
          <Tag style={{ marginLeft: 'auto', fontSize: 11 }} data-testid="dismissed-label">
            已忽略
          </Tag>
        )}
      </div>

      {/* Attack angle summary */}
      <div
        style={{
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--color-text-primary)',
          textDecoration: isAddressed ? 'line-through' : 'none',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? undefined : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}
        data-testid="attack-angle"
      >
        {item.attackAngle}
      </div>

      {/* Action buttons — always visible for unaddressed items */}
      {item.status === 'unaddressed' && (
        <div
          className="flex gap-2"
          style={{ marginTop: 6 }}
          onClick={(e) => e.stopPropagation()}
          data-testid="action-buttons"
        >
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleAddress}
            data-testid="address-button"
          >
            已防御
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EyeInvisibleOutlined />}
            onClick={handleDismiss}
            data-testid="dismiss-button"
          >
            忽略
          </Button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 8 }} data-testid="expanded-details">
          {/* Defense suggestion */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-global)',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: 12,
              lineHeight: '18px',
              color: 'var(--color-text-secondary)',
              borderLeft: '2px solid var(--color-brand)',
            }}
            data-testid="defense-suggestion"
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>防御建议：</strong>
            {item.defenseSuggestion}
          </div>
        </div>
      )}
    </div>
  )
}
