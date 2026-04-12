import React from 'react'
import { Button, Spin } from 'antd'
import type { RoleReviewResult } from '@shared/adversarial-types'

interface FailedRoleAlertProps {
  roleResult: RoleReviewResult
  retrying: boolean
  onRetry: (roleId: string) => void
}

export const FailedRoleAlert: React.FC<FailedRoleAlertProps> = ({
  roleResult,
  retrying,
  onRetry,
}) => {
  const errorSummary = roleResult.error
    ? roleResult.error.length > 50
      ? roleResult.error.slice(0, 50) + '…'
      : roleResult.error
    : '未知错误'

  return (
    <div
      style={{
        background: '#FFFBE6',
        border: '1px solid #FFE58F',
        borderRadius: 6,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ color: '#FAAD14', fontSize: 16, flexShrink: 0 }}>⚠</span>
        <span
          style={{
            fontSize: 13,
            color: '#8B6914',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {roleResult.roleName}评审失败：{errorSummary}
        </span>
      </div>
      <Button size="small" disabled={retrying} onClick={() => onRetry(roleResult.roleId)}>
        {retrying ? <Spin size="small" /> : '重试'}
      </Button>
    </div>
  )
}
