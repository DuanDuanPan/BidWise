import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select, Switch, Table, Popconfirm, Space, App } from 'antd'
import { PlusOutlined, UploadOutlined, ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { TerminologyEntry } from '@shared/terminology-types'
import { useTerminologyStore } from '@renderer/stores'
import { TerminologyEntryForm } from './TerminologyEntryForm'
import { TerminologyImportDialog } from './TerminologyImportDialog'

export function TerminologyPage(): React.JSX.Element {
  const { message } = App.useApp()
  const {
    entries,
    loading,
    searchQuery,
    categoryFilter,
    activeOnly,
    loadEntries,
    updateEntry,
    deleteEntry,
    exportJson,
    setSearchQuery,
    setCategoryFilter,
    setActiveOnly,
  } = useTerminologyStore()

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TerminologyEntry | null>(null)

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load entries on mount and when filters change
  useEffect(() => {
    loadEntries()
  }, [loadEntries, categoryFilter, activeOnly])

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        loadEntries()
      }, 300)
    },
    [setSearchQuery, loadEntries]
  )

  // Extract unique categories for filter dropdown
  const categoryOptions = useMemo(() => {
    const categories = new Set<string>()
    for (const entry of entries) {
      if (entry.category) categories.add(entry.category)
    }
    return Array.from(categories).map((c) => ({ label: c, value: c }))
  }, [entries])

  const handleEdit = useCallback((entry: TerminologyEntry) => {
    setEditingEntry(entry)
    setFormOpen(true)
  }, [])

  const handleAdd = useCallback(() => {
    setEditingEntry(null)
    setFormOpen(true)
  }, [])

  const handleFormClose = useCallback(() => {
    setFormOpen(false)
    setEditingEntry(null)
  }, [])

  const handleToggleActive = useCallback(
    async (entry: TerminologyEntry, checked: boolean) => {
      try {
        await updateEntry({ id: entry.id, isActive: checked })
      } catch {
        message.error('状态切换失败')
      }
    },
    [updateEntry, message]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEntry(id)
        message.success('术语已删除')
      } catch {
        message.error('删除失败')
      }
    },
    [deleteEntry, message]
  )

  const handleExport = useCallback(async () => {
    const result = await exportJson()
    if (result && !result.cancelled) {
      message.success(`已导出 ${result.entryCount} 条术语到 ${result.outputPath}`)
    }
  }, [exportJson, message])

  const columns: ColumnsType<TerminologyEntry> = useMemo(
    () => [
      {
        title: '源术语',
        dataIndex: 'sourceTerm',
        key: 'sourceTerm',
        width: 200,
      },
      {
        title: '目标术语',
        dataIndex: 'targetTerm',
        key: 'targetTerm',
        width: 250,
      },
      {
        title: '分类',
        dataIndex: 'category',
        key: 'category',
        width: 120,
        render: (val: string | null) => val || '-',
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 80,
        render: (val: boolean, record: TerminologyEntry) => (
          <Switch
            size="small"
            checked={val}
            onChange={(checked) => handleToggleActive(record, checked)}
          />
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (_: unknown, record: TerminologyEntry) => (
          <Space size="small">
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title="确定删除该术语映射？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [handleEdit, handleDelete, handleToggleActive]
  )

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space>
          <Input.Search
            placeholder="搜索术语..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            placeholder="分类筛选"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categoryOptions}
            allowClear
            style={{ width: 150 }}
          />
          <Space size="small">
            <span>仅显示启用</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} size="small" />
          </Space>
        </Space>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加术语
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            批量导入
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出 JSON
          </Button>
        </Space>
      </div>

      <Table
        dataSource={entries}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{
          emptyText: '术语库暂无条目。点击"添加术语"创建第一条行业术语映射。',
        }}
      />

      <TerminologyEntryForm open={formOpen} editingEntry={editingEntry} onClose={handleFormClose} />

      <TerminologyImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
