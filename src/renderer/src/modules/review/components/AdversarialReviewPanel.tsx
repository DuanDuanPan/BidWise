import React, { useMemo, useState } from 'react'
import { Button, Progress, Select, Spin, Empty } from 'antd'
import { AdversarialFindingCard } from './AdversarialFindingCard'
import { FailedRoleAlert } from './FailedRoleAlert'
import type {
  AdversarialFinding,
  AdversarialReviewSession,
  HandleFindingAction,
} from '@shared/adversarial-types'

interface AdversarialReviewPanelProps {
  session: AdversarialReviewSession | null
  loading: boolean
  progress: number
  message: string | null
  error: string | null
  onClose: () => void
  onAction: (findingId: string, action: HandleFindingAction, rebuttalReason?: string) => void
  onRetryRole: (roleId: string) => void
  onRestart: () => void
  onNavigateToSection?: (finding: AdversarialFinding) => void
  retryingRoleId?: string | null
}

export const AdversarialReviewPanel: React.FC<AdversarialReviewPanelProps> = ({
  session,
  loading,
  progress,
  message,
  error,
  onClose,
  onAction,
  onRetryRole,
  onRestart,
  onNavigateToSection,
  retryingRoleId,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const sessionStatus = session?.status
  const findings = useMemo(() => session?.findings ?? [], [session?.findings])
  const roleResults = useMemo(() => session?.roleResults ?? [], [session?.roleResults])

  // Stats
  const stats = useMemo(() => {
    const critical = findings.filter((f) => f.severity === 'critical').length
    const major = findings.filter((f) => f.severity === 'major').length
    const minor = findings.filter((f) => f.severity === 'minor').length
    return { total: findings.length, critical, major, minor }
  }, [findings])

  // Role options for filter
  const roleOptions = useMemo(() => {
    const roles = new Map<string, string>()
    for (const f of findings) {
      roles.set(f.roleId, f.roleName)
    }
    return Array.from(roles.entries()).map(([id, name]) => ({ value: id, label: name }))
  }, [findings])

  // Failed roles
  const failedRoles = useMemo(() => roleResults.filter((r) => r.status === 'failed'), [roleResults])

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false
      if (roleFilter !== 'all' && f.roleId !== roleFilter) return false
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      return true
    })
  }, [findings, severityFilter, roleFilter, statusFilter])

  // ─── Idle State ───
  if (!session && !loading && !error) {
    return (
      <div
        data-testid="review-panel-idle"
        style={{ width: 480, height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <PanelHeader onClose={onClose} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Empty description="请先确认对抗阵容后启动评审" />
        </div>
      </div>
    )
  }

  // ─── Running State ───
  if (loading && (!session || sessionStatus === 'running')) {
    return (
      <div
        data-testid="review-panel-running"
        style={{ width: 480, height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <PanelHeader onClose={onClose} />
        <div style={{ padding: 24 }}>
          <Progress percent={progress} size="small" style={{ marginBottom: 16 }} />
          {session?.roleResults && (
            <div style={{ marginBottom: 16 }}>
              {session.roleResults.map((r) => (
                <div
                  key={r.roleId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    fontSize: 13,
                  }}
                >
                  <RoleStatusIcon status={r.status} />
                  <span>{r.roleName}</span>
                  <span style={{ color: '#8C8C8C', marginLeft: 'auto' }}>
                    {r.status === 'pending' && '等待中'}
                    {r.status === 'running' && '攻击中…'}
                    {r.status === 'success' && '完成'}
                    {r.status === 'failed' && '失败'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'center', color: '#8C8C8C', fontSize: 13 }}>
            {message ?? 'AI 正在从多个维度审查您的方案…'}
          </div>
        </div>
      </div>
    )
  }

  // ─── Failed State ───
  if (sessionStatus === 'failed' || (error && !session)) {
    return (
      <div
        data-testid="review-panel-failed"
        style={{ width: 480, height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <PanelHeader onClose={onClose} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 16,
          }}
        >
          <div style={{ color: '#FF4D4F', fontSize: 14 }}>
            {error ?? '对抗评审失败，请检查配置后重试'}
          </div>
          <Button type="primary" onClick={onRestart} data-testid="review-restart-btn">
            重新启动评审
          </Button>
        </div>
      </div>
    )
  }

  // ─── Completed / Partial State ───
  return (
    <div
      data-testid="review-panel-results"
      style={{
        width: 480,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PanelHeader onClose={onClose} />

      {/* Stats bar */}
      <div
        data-testid="review-stats-bar"
        style={{
          background: '#FAFAFA',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          borderBottom: '1px solid #F0F0F0',
        }}
      >
        {stats.total} 条攻击发现 | critical: {stats.critical} | major: {stats.major} | minor:{' '}
        {stats.minor}
      </div>

      {/* Failed role alerts (partial state) */}
      {failedRoles.length > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          {failedRoles.map((r) => (
            <FailedRoleAlert
              key={r.roleId}
              roleResult={r}
              retrying={retryingRoleId === r.roleId}
              onRetry={onRetryRole}
            />
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid #F0F0F0',
        }}
      >
        <Select
          size="small"
          value={severityFilter}
          onChange={setSeverityFilter}
          style={{ width: 100 }}
          options={[
            { value: 'all', label: '严重性' },
            { value: 'critical', label: 'critical' },
            { value: 'major', label: 'major' },
            { value: 'minor', label: 'minor' },
          ]}
        />
        <Select
          size="small"
          value={roleFilter}
          onChange={setRoleFilter}
          style={{ width: 120 }}
          options={[{ value: 'all', label: '角色' }, ...roleOptions]}
        />
        <Select
          size="small"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 110 }}
          options={[
            { value: 'all', label: '状态' },
            { value: 'pending', label: '待处理' },
            { value: 'accepted', label: '已接受' },
            { value: 'rejected', label: '已反驳' },
            { value: 'needs-decision', label: '待决策' },
          ]}
        />
      </div>

      {/* Findings list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {filteredFindings.length === 0 && stats.total === 0 && (
          <div data-testid="review-zero-findings" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 14, color: '#52C41A', fontWeight: 500, marginBottom: 8 }}>
              本轮对抗评审未发现需要处理的问题
            </div>
            <div style={{ fontSize: 13, color: '#8C8C8C' }}>
              您可以继续执行合规校验或重新发起一轮评审
            </div>
          </div>
        )}
        {filteredFindings.length === 0 && stats.total > 0 && (
          <Empty description="当前筛选条件下无结果" />
        )}
        {filteredFindings.map((f) => (
          <AdversarialFindingCard
            key={f.id}
            finding={f}
            onAction={onAction}
            onNavigateToSection={onNavigateToSection}
            disabled={loading}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Sub-components ───

const PanelHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid #F0F0F0',
      fontWeight: 600,
      fontSize: 15,
    }}
  >
    <span>对抗评审结果</span>
    <Button type="text" size="small" onClick={onClose}>
      ✕
    </Button>
  </div>
)

const RoleStatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Spin size="small" />
    case 'success':
      return <span style={{ color: '#52C41A' }}>✓</span>
    case 'failed':
      return <span style={{ color: '#FF4D4F' }}>✕</span>
    default:
      return <span style={{ color: '#D9D9D9' }}>○</span>
  }
}
