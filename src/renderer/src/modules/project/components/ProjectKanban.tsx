import { Button, Spin, Modal, message } from 'antd'
import { PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@renderer/stores'
import { useProjects } from '../hooks/useProjects'
import { ProjectCard } from './ProjectCard'
import { ProjectFilter } from './ProjectFilter'
import { ProjectCreateModal } from './ProjectCreateModal'
import { ProjectEditModal } from './ProjectEditModal'
import { ProjectEmptyState } from './ProjectEmptyState'
import type { ProjectListItem } from '@shared/ipc-types'

export function ProjectKanban(): React.JSX.Element {
  const { projects, allProjects, loading } = useProjects()
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const archiveProject = useProjectStore((s) => s.archiveProject)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null)

  const handleEdit = useCallback(
    (id: string) => {
      const p = allProjects.find((x) => x.id === id) ?? null
      setEditTarget(p)
      setEditOpen(true)
    },
    [allProjects]
  )

  const handleArchive = useCallback(
    (id: string) => {
      Modal.confirm({
        title: '确认归档',
        content: '归档后项目将从看板移除，确认继续？',
        okText: '确认归档',
        cancelText: '取消',
        onOk: async () => {
          try {
            await archiveProject(id)
            message.success('项目已归档')
          } catch {
            message.error('归档失败')
          }
        },
      })
    },
    [archiveProject]
  )

  const handleDelete = useCallback(
    (id: string) => {
      Modal.confirm({
        title: '确认删除',
        content: '删除后无法恢复，确认继续？',
        okText: '确认删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteProject(id)
            message.success('项目已删除')
          } catch {
            message.error('删除失败')
          }
        },
      })
    },
    [deleteProject]
  )

  const navigateTo = useNavigate()
  const handleCardClick = useCallback(
    (id: string) => {
      navigateTo(`/project/${id}`)
    },
    [navigateTo]
  )

  return (
    <div className="bg-bg-global flex h-screen flex-col" data-testid="project-kanban">
      {/* Top nav bar */}
      <header className="border-border bg-bg-content flex h-14 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <div className="bg-brand flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white">
            标
          </div>
          <span className="text-h4">BidWise 标智</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="text"
            icon={<SearchOutlined />}
            className="text-text-tertiary"
            disabled
            title="全局搜索（即将推出）"
            aria-label="全局搜索（即将推出）"
          />
          <Button
            type="text"
            icon={<SettingOutlined />}
            className="text-text-tertiary"
            disabled
            title="设置（即将推出）"
            aria-label="设置（即将推出）"
          />
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 overflow-auto p-6">
        {/* Page header */}
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-h1 m-0">项目看板</h1>
            <p className="text-body-small text-text-tertiary mt-1">
              管理所有投标项目，一目了然掌控进度
            </p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            data-testid="create-project-btn"
          >
            新建项目
          </Button>
        </div>

        {allProjects.length > 0 && <ProjectFilter />}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : allProjects.length === 0 ? (
          <ProjectEmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            }}
            data-testid="project-grid"
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEdit={handleEdit}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <ProjectCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ProjectEditModal
        open={editOpen}
        project={editTarget}
        onClose={() => {
          setEditOpen(false)
          setEditTarget(null)
        }}
      />
    </div>
  )
}
