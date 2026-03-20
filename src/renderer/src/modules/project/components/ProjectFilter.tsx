import { Tabs, Select, DatePicker, Space, Button, Popover } from 'antd'
import { FilterOutlined, SwapOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useProjectStore } from '@renderer/stores'
import type { QuickFilter } from '@renderer/stores/projectStore'
import { INDUSTRY_OPTIONS } from '../types'

const QUICK_TABS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'due-this-week', label: '本周截止' },
  { key: 'has-warning', label: '有警告' },
]

interface AdvancedFilterPanelProps {
  onClose: () => void
}

function AdvancedFilterPanel({ onClose }: AdvancedFilterPanelProps): React.JSX.Element {
  const filter = useProjectStore((s) => s.filter)
  const setFilter = useProjectStore((s) => s.setFilter)
  const projects = useProjectStore((s) => s.projects)

  const customerOptions = useMemo(() => {
    const names = new Set<string>()
    for (const p of projects) {
      if (p.customerName) names.add(p.customerName)
    }
    return Array.from(names)
      .sort()
      .map((n) => ({ label: n, value: n }))
  }, [projects])

  return (
    <div className="w-72 space-y-3 p-1" data-testid="advanced-filter-panel">
      <div>
        <div className="text-body-small mb-1 font-medium text-gray-500">客户名称</div>
        <Select
          allowClear
          placeholder="选择客户"
          className="w-full"
          value={filter.customer}
          onChange={(v) => setFilter({ customer: v || null })}
          showSearch
          options={customerOptions}
        />
      </div>
      <div>
        <div className="text-body-small mb-1 font-medium text-gray-500">行业领域</div>
        <Select
          allowClear
          placeholder="选择行业"
          className="w-full"
          value={filter.industry}
          onChange={(v) => setFilter({ industry: v || null })}
          options={INDUSTRY_OPTIONS.map((i) => ({ label: i, value: i }))}
        />
      </div>
      <div>
        <div className="text-body-small mb-1 font-medium text-gray-500">项目状态</div>
        <Select
          allowClear
          placeholder="选择状态"
          className="w-full"
          value={filter.status}
          onChange={(v) => setFilter({ status: v || null })}
          options={[
            { label: '进行中', value: 'active' },
            { label: '已归档', value: 'archived' },
          ]}
        />
      </div>
      <div>
        <div className="text-body-small mb-1 font-medium text-gray-500">截止日期（之前）</div>
        <DatePicker
          className="w-full"
          placeholder="选择截止日期"
          onChange={(_, dateString) =>
            setFilter({ deadlineBefore: (dateString as string) || null })
          }
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          size="small"
          onClick={() => {
            setFilter({
              customer: null,
              industry: null,
              status: null,
              deadlineBefore: null,
            })
            onClose()
          }}
        >
          重置
        </Button>
        <Button type="primary" size="small" onClick={onClose}>
          确定
        </Button>
      </div>
    </div>
  )
}

export function ProjectFilter(): React.JSX.Element {
  const filter = useProjectStore((s) => s.filter)
  const sortMode = useProjectStore((s) => s.sortMode)
  const setFilter = useProjectStore((s) => s.setFilter)
  const setSortMode = useProjectStore((s) => s.setSortMode)
  const [filterOpen, setFilterOpen] = useState(false)

  const hasAdvancedFilter = !!(
    filter.customer ||
    filter.industry ||
    filter.status ||
    filter.deadlineBefore
  )

  return (
    <div className="mb-4 flex items-center justify-between" data-testid="project-filter">
      <Tabs
        activeKey={filter.quick}
        onChange={(key) => setFilter({ quick: key as QuickFilter })}
        items={QUICK_TABS.map((t) => ({ key: t.key, label: t.label }))}
        size="small"
      />
      <Space size="small">
        <Popover
          content={<AdvancedFilterPanel onClose={() => setFilterOpen(false)} />}
          trigger="click"
          open={filterOpen}
          onOpenChange={setFilterOpen}
          placement="bottomRight"
          title="高级筛选"
        >
          <Button
            size="small"
            icon={<FilterOutlined />}
            type={hasAdvancedFilter ? 'primary' : 'default'}
            ghost={hasAdvancedFilter}
            data-testid="advanced-filter-btn"
          >
            高级筛选
          </Button>
        </Popover>
        <Button
          size="small"
          icon={<SwapOutlined />}
          onClick={() => setSortMode(sortMode === 'smart' ? 'updated' : 'smart')}
          data-testid="sort-toggle-btn"
        >
          {sortMode === 'smart' ? '智能排序' : '按更新时间'}
        </Button>
      </Space>
    </div>
  )
}
