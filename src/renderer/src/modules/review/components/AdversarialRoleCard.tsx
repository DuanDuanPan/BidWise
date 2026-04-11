import { Card, Tag, Button, Select, Input, Space, Popconfirm } from 'antd'
import { LockOutlined, DeleteOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { AdversarialRole, AdversarialIntensity } from '@shared/adversarial-types'
import { INTENSITY_LABELS } from '@shared/adversarial-types'

const INTENSITY_COLORS: Record<AdversarialIntensity, string> = {
  high: 'red',
  medium: 'orange',
  low: 'blue',
}

interface AdversarialRoleCardProps {
  role: AdversarialRole
  editable: boolean
  onUpdate?: (role: AdversarialRole) => void
  onDelete?: (roleId: string) => void
}

export function AdversarialRoleCard({
  role,
  editable,
  onUpdate,
  onDelete,
}: AdversarialRoleCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editFocus, setEditFocus] = useState(role.attackFocus.join('、'))
  const [editIntensity, setEditIntensity] = useState(role.intensity)

  const handleSave = (): void => {
    const newFocus = editFocus
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    onUpdate?.({
      ...role,
      attackFocus: newFocus,
      intensity: editIntensity,
    })
    setEditing(false)
  }

  const handleCancel = (): void => {
    setEditFocus(role.attackFocus.join('、'))
    setEditIntensity(role.intensity)
    setEditing(false)
  }

  return (
    <Card
      size="small"
      data-testid={`adversarial-role-card-${role.id}`}
      style={{
        borderColor: '#FF4D4F',
        backgroundColor: '#fff2f0',
        marginBottom: 12,
      }}
      title={
        <div className="flex items-center gap-2">
          {role.isProtected && <LockOutlined style={{ color: '#FF4D4F' }} />}
          <span className="font-semibold">{role.name}</span>
          {role.isProtected && (
            <Tag color="red" data-testid="protected-badge">
              合规保底
            </Tag>
          )}
          <Tag color={INTENSITY_COLORS[role.intensity]}>{INTENSITY_LABELS[role.intensity]}</Tag>
        </div>
      }
      extra={
        editable && !role.isProtected ? (
          <Space>
            {!editing && (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
                data-testid="edit-role-btn"
              />
            )}
            <Popconfirm
              title="确定删除此角色？"
              onConfirm={() => onDelete?.(role.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                data-testid="delete-role-btn"
              />
            </Popconfirm>
          </Space>
        ) : undefined
      }
    >
      <p className="mb-2 text-sm" style={{ color: '#595959' }}>
        {role.perspective}
      </p>
      <p className="mb-2 text-xs" style={{ color: '#8c8c8c' }}>
        {role.description}
      </p>

      {editing ? (
        <div className="mt-2">
          <div className="mb-2">
            <label className="text-xs font-medium">攻击焦点（用顿号分隔）</label>
            <Input.TextArea
              value={editFocus}
              onChange={(e) => setEditFocus(e.target.value)}
              rows={2}
              data-testid="edit-focus-input"
            />
          </div>
          <div className="mb-2">
            <label className="text-xs font-medium">攻击强度</label>
            <Select
              value={editIntensity}
              onChange={(v) => setEditIntensity(v)}
              style={{ width: '100%' }}
              options={[
                { label: '高', value: 'high' },
                { label: '中', value: 'medium' },
                { label: '低', value: 'low' },
              ]}
              data-testid="edit-intensity-select"
            />
          </div>
          <Space>
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSave}>
              保存
            </Button>
            <Button size="small" onClick={handleCancel}>
              取消
            </Button>
          </Space>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {role.attackFocus.map((focus, i) => (
            <Tag key={i} color="red" style={{ backgroundColor: '#fff1f0', borderColor: '#ffa39e' }}>
              {focus}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  )
}
