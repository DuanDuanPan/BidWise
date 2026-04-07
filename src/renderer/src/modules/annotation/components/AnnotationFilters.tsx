import { Tooltip } from 'antd'
import type { AnnotationType } from '@shared/annotation-types'
import { ANNOTATION_TYPE_COLORS, ANNOTATION_TYPE_LABELS } from '../constants/annotation-colors'
import type { AnnotationFilterGroup, StatusFilter } from '../lib/annotationFilters'

// ── Filter group definitions ──

interface FilterGroupDef {
  key: AnnotationFilterGroup
  color: string
  label: string
  types: AnnotationType[]
}

const FILTER_GROUPS: FilterGroupDef[] = [
  {
    key: 'ai-suggestion',
    color: ANNOTATION_TYPE_COLORS['ai-suggestion'],
    label: ANNOTATION_TYPE_LABELS['ai-suggestion'],
    types: ['ai-suggestion'],
  },
  {
    key: 'asset-recommendation',
    color: ANNOTATION_TYPE_COLORS['asset-recommendation'],
    label: ANNOTATION_TYPE_LABELS['asset-recommendation'],
    types: ['asset-recommendation'],
  },
  {
    key: 'score-warning',
    color: ANNOTATION_TYPE_COLORS['score-warning'],
    label: ANNOTATION_TYPE_LABELS['score-warning'],
    types: ['score-warning'],
  },
  {
    key: 'adversarial',
    color: ANNOTATION_TYPE_COLORS['adversarial'],
    label: ANNOTATION_TYPE_LABELS['adversarial'],
    types: ['adversarial'],
  },
  {
    key: 'human-crossrole',
    color: ANNOTATION_TYPE_COLORS['human'],
    label: '人工 / 跨角色',
    types: ['human', 'cross-role'],
  },
]

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: '待处理' },
  { key: 'processed', label: '已处理' },
  { key: 'needs-decision', label: '待决策' },
]

// ── Component ──

interface AnnotationFiltersProps {
  typeFilter: Set<AnnotationFilterGroup>
  statusFilter: StatusFilter
  statusCounts: Record<StatusFilter, number>
  onToggleType: (group: AnnotationFilterGroup) => void
  onStatusChange: (status: StatusFilter) => void
}

export function AnnotationFilters({
  typeFilter,
  statusFilter,
  statusCounts,
  onToggleType,
  onStatusChange,
}: AnnotationFiltersProps): React.JSX.Element {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b px-4 py-2"
      style={{ borderColor: 'var(--color-border)' }}
      data-testid="annotation-filters"
    >
      {/* Type filter: 5 color dots */}
      <div className="flex items-center gap-2">
        {FILTER_GROUPS.map((group) => {
          const active = typeFilter.has(group.key)
          return (
            <Tooltip key={group.key} title={group.label}>
              <button
                type="button"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 bg-transparent p-0 transition-all"
                style={{
                  borderColor: active ? group.color : 'transparent',
                  opacity: active ? 1 : 0.4,
                }}
                onClick={() => onToggleType(group.key)}
                aria-label={group.label}
                aria-pressed={active}
                data-testid={`type-filter-${group.key}`}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: active ? 10 : 8,
                    height: active ? 10 : 8,
                    backgroundColor: group.color,
                  }}
                />
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* Status filter: 3 tabs */}
      <div
        className="flex overflow-hidden rounded-md"
        style={{ border: '1px solid var(--color-border)' }}
        role="tablist"
        data-testid="status-filter"
      >
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 border-none px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-brand)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-secondary)',
              }}
              onClick={() => onStatusChange(tab.key)}
              data-testid={`status-filter-${tab.key}`}
            >
              {tab.label}
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
                style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'var(--color-bg-global)',
                  color: active ? '#fff' : 'var(--color-text-tertiary)',
                }}
              >
                {statusCounts[tab.key]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
