import { Card, Dropdown, type MenuProps } from 'antd'
import {
  MoreOutlined,
  BankOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EditOutlined,
  InboxOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { SOP_STAGE_CONFIG, PROPOSAL_TYPE_LABELS } from '../types'
import type { SopStageKey } from '../types'
import type { ProjectListItem } from '@shared/ipc-types'
import { formatRelativeTime } from '@renderer/shared/lib/format-time'

interface ProjectCardProps {
  project: ProjectListItem
  onEdit: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onClick: (id: string) => void
}

function formatDeadline(dateStr: string | null): { text: string; isUrgent: boolean } {
  if (!dateStr) return { text: '未设置', isUrgent: false }
  const d = new Date(dateStr)
  const now = new Date()
  const threeDays = new Date(now)
  threeDays.setDate(now.getDate() + 3)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return {
    text: `${month}月${day}日截止`,
    isUrgent: d <= threeDays && d >= now,
  }
}

export function ProjectCard({
  project,
  onEdit,
  onArchive,
  onDelete,
  onClick,
}: ProjectCardProps): React.JSX.Element {
  const sopConfig = SOP_STAGE_CONFIG[project.sopStage as SopStageKey] ?? {
    label: project.sopStage,
    color: 'var(--color-sop-idle)',
  }
  const proposalLabel = PROPOSAL_TYPE_LABELS['presale-technical'] ?? '售前技术方案'
  const deadline = formatDeadline(project.deadline)

  const menuItems: MenuProps['items'] = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑' },
    { key: 'archive', icon: <InboxOutlined />, label: '归档' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'edit') onEdit(project.id)
    else if (key === 'archive') onArchive(project.id)
    else if (key === 'delete') onDelete(project.id)
  }

  return (
    <Card
      data-testid={`project-card-${project.id}`}
      className="cursor-pointer transition-shadow hover:shadow-md"
      styles={{ body: { padding: 'var(--spacing-md)' } }}
      role="button"
      tabIndex={0}
      onClick={() => onClick(project.id)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(project.id)
        }
      }}
    >
      {/* Header: name + actions menu */}
      <div className="mb-1 flex items-start justify-between">
        <h3 className="text-h3 m-0 leading-snug">{project.name}</h3>
        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
          <button
            type="button"
            className="text-text-tertiary hover:bg-bg-global hover:text-brand flex h-6 w-6 items-center justify-center rounded"
            onClick={(e) => e.stopPropagation()}
            aria-label="更多操作"
            data-testid="card-actions-btn"
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>

      {/* Proposal type subtitle */}
      <div className="text-body-small text-text-tertiary mb-3">{proposalLabel}</div>

      {/* SOP Stage */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: sopConfig.color }}
        />
        <span className="text-body-small font-medium" style={{ color: sopConfig.color }}>
          {sopConfig.label}
        </span>
      </div>

      {/* Meta row: customer + deadline */}
      <div className="text-body-small text-text-tertiary mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <BankOutlined className="text-xs" />
          <span>{project.customerName || '--'}</span>
        </span>
        <span className={`flex items-center gap-1 ${deadline.isUrgent ? 'text-warning' : ''}`}>
          <CalendarOutlined className="text-xs" />
          <span>{deadline.text}</span>
        </span>
      </div>

      {/* Compliance row */}
      <div className="text-body-small text-text-tertiary mb-2 flex items-center justify-between">
        <span>合规状态</span>
        <span>待检查</span>
      </div>

      {/* Divider */}
      <div className="border-border my-2 border-t" />

      {/* Recent activity */}
      <div className="text-body-small text-text-tertiary flex items-center gap-1">
        <ClockCircleOutlined className="text-xs" />
        <span>{formatRelativeTime(project.updatedAt)} · 暂无活动摘要</span>
      </div>
    </Card>
  )
}
