import { Drawer, Button, Spin, Alert, Empty, Tag, Space } from 'antd'
import { PlusOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useReviewStore, getReviewProjectState } from '@renderer/stores'
import { AdversarialRoleCard } from './AdversarialRoleCard'
import { AddRoleModal } from './AddRoleModal'
import type { AdversarialRole, AdversarialIntensity } from '@shared/adversarial-types'

interface AdversarialLineupDrawerProps {
  open: boolean
  projectId: string
  onClose: () => void
  onGenerate: () => void
  onUpdateRoles: (roles: AdversarialRole[]) => void
  onConfirm: () => void
}

export function AdversarialLineupDrawer({
  open,
  projectId,
  onClose,
  onGenerate,
  onUpdateRoles,
  onConfirm,
}: AdversarialLineupDrawerProps): React.JSX.Element {
  const [addModalOpen, setAddModalOpen] = useState(false)

  const projectState = useReviewStore((s) => getReviewProjectState(s, projectId))
  const { lineup, lineupLoading, lineupError, lineupMessage } = projectState

  const handleDeleteRole = useCallback(
    (roleId: string) => {
      if (!lineup) return
      const updated = lineup.roles.filter((r) => r.id !== roleId)
      onUpdateRoles(updated)
    },
    [lineup, onUpdateRoles]
  )

  const handleUpdateRole = useCallback(
    (updatedRole: AdversarialRole) => {
      if (!lineup) return
      const updated = lineup.roles.map((r) => (r.id === updatedRole.id ? updatedRole : r))
      onUpdateRoles(updated)
    },
    [lineup, onUpdateRoles]
  )

  const handleAddRole = useCallback(
    (values: {
      name: string
      perspective: string
      attackFocus: string[]
      intensity: AdversarialIntensity
      description: string
    }) => {
      if (!lineup) return
      const newRole: AdversarialRole = {
        id: uuidv4(),
        name: values.name,
        perspective: values.perspective,
        attackFocus: values.attackFocus,
        intensity: values.intensity,
        isProtected: false,
        description: values.description,
        sortOrder: lineup.roles.length,
      }
      onUpdateRoles([...lineup.roles, newRole])
    },
    [lineup, onUpdateRoles]
  )

  const isGenerated = lineup?.status === 'generated'
  const isConfirmed = lineup?.status === 'confirmed'
  const editable = isGenerated

  return (
    <>
      <Drawer
        title={
          <div className="flex items-center gap-2">
            <span>对抗角色阵容</span>
            {isConfirmed && (
              <Tag icon={<CheckCircleOutlined />} color="success" data-testid="confirmed-badge">
                已确认
              </Tag>
            )}
          </div>
        }
        width={480}
        open={open}
        onClose={onClose}
        placement="right"
        data-testid="adversarial-lineup-drawer"
        footer={
          <div className="flex justify-end gap-2">
            {isGenerated && !lineupLoading && !lineupError && (
              <>
                <Button icon={<ReloadOutlined />} onClick={onGenerate} data-testid="regenerate-btn">
                  重新生成
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setAddModalOpen(true)}
                  data-testid="add-role-btn"
                >
                  添加角色
                </Button>
                <Button type="primary" onClick={onConfirm} data-testid="confirm-lineup-btn">
                  确认阵容
                </Button>
              </>
            )}
            {isConfirmed && !lineupLoading && !lineupError && (
              <Button icon={<ReloadOutlined />} onClick={onGenerate} data-testid="regenerate-btn">
                重新生成
              </Button>
            )}
            {!lineup && !lineupLoading && (
              <Button type="primary" onClick={onGenerate} data-testid="generate-lineup-btn">
                生成对抗阵容
              </Button>
            )}
          </div>
        }
      >
        {/* Loading state */}
        {lineupLoading && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ minHeight: 200 }}
            data-testid="lineup-loading"
          >
            <Spin size="large" />
            <p className="mt-4 text-sm" style={{ color: '#8c8c8c' }}>
              {lineupMessage ?? '正在生成对抗角色阵容...'}
            </p>
          </div>
        )}

        {/* Error state */}
        {lineupError && !lineupLoading && (
          <Alert
            type="error"
            message="生成失败"
            description={lineupError}
            showIcon
            data-testid="lineup-error"
            action={
              <Button size="small" onClick={onGenerate} data-testid="retry-generate-btn">
                重新生成
              </Button>
            }
          />
        )}

        {/* Empty state */}
        {!lineup && !lineupLoading && !lineupError && (
          <Empty description="暂无对抗角色阵容" data-testid="lineup-empty">
            <Button type="primary" onClick={onGenerate} data-testid="generate-lineup-empty-btn">
              生成对抗阵容
            </Button>
          </Empty>
        )}

        {/* Role list */}
        {lineup && !lineupLoading && !lineupError && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {lineup.roles
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((role) => (
                <AdversarialRoleCard
                  key={role.id}
                  role={role}
                  editable={editable}
                  onUpdate={handleUpdateRole}
                  onDelete={handleDeleteRole}
                />
              ))}
          </Space>
        )}
      </Drawer>

      <AddRoleModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddRole}
      />
    </>
  )
}
