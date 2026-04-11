import { useState, useCallback, useEffect, useRef } from 'react'
import { Tooltip, Popover, Dropdown, Tag, Badge } from 'antd'
import type { MenuProps } from 'antd'
import type {
  TraceabilityMatrix,
  TraceabilityMatrixCell,
  TraceabilityMatrixColumn,
  TraceabilityMatrixRow,
  CoverageStatus,
} from '@shared/analysis-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

interface ComplianceCoverageMatrixProps {
  matrix: TraceabilityMatrix
  onCreateLink: (requirementId: string, sectionId: string, coverageStatus: CoverageStatus) => void
  onUpdateLink: (id: string, patch: { coverageStatus?: CoverageStatus }) => void
  onDeleteLink: (id: string) => void
  onNavigateToChapter?: (locator: ChapterHeadingLocator) => void
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  covered: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  partial: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  uncovered: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  none: { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' },
}

const STATUS_LABELS: Record<string, string> = {
  covered: '已覆盖',
  partial: '部分覆盖',
  uncovered: '未覆盖',
  none: 'N/A',
}

function CellPopoverContent({
  cell,
  headingLocator,
  onUpdateLink,
  onDeleteLink,
  onNavigateToChapter,
}: {
  cell: TraceabilityMatrixCell
  headingLocator?: ChapterHeadingLocator | null
  onUpdateLink: (id: string, patch: { coverageStatus?: CoverageStatus }) => void
  onDeleteLink: (id: string) => void
  onNavigateToChapter?: (locator: ChapterHeadingLocator) => void
}): React.JSX.Element {
  return (
    <div className="max-w-xs" data-testid="cell-popover">
      <div className="mb-2">
        <span className="text-text-secondary text-xs">需求：</span>
        <div className="text-sm">{cell.requirementDescription}</div>
      </div>
      <div className="mb-2">
        <span className="text-text-secondary text-xs">章节：</span>
        <div className="text-sm">{cell.sectionTitle}</div>
      </div>
      {cell.matchReason && (
        <div className="mb-2">
          <span className="text-text-secondary text-xs">理由：</span>
          <div className="text-sm">{cell.matchReason}</div>
        </div>
      )}
      <div className="mb-2 flex gap-2">
        <Tag color={cell.source === 'manual' ? 'blue' : 'default'}>
          {cell.source === 'manual' ? '手动' : '自动'}
        </Tag>
        <Tag>{`置信度 ${Math.round(cell.confidence * 100)}%`}</Tag>
      </div>
      {headingLocator && onNavigateToChapter && (
        <div className="mb-2">
          <Tag
            className="cursor-pointer"
            color="processing"
            onClick={() => onNavigateToChapter(headingLocator)}
            data-testid="cell-navigate-to-chapter"
          >
            跳转到方案章节
          </Tag>
        </div>
      )}
      {cell.linkId && (
        <div className="flex gap-1 border-t border-gray-100 pt-2">
          {(['covered', 'partial', 'uncovered'] as CoverageStatus[]).map((status) => (
            <Tag
              key={status}
              className="cursor-pointer"
              color={cell.coverageStatus === status ? 'blue' : undefined}
              onClick={() => {
                if (cell.linkId && cell.coverageStatus !== status) {
                  onUpdateLink(cell.linkId, { coverageStatus: status })
                }
              }}
            >
              {STATUS_LABELS[status]}
            </Tag>
          ))}
          {cell.source === 'manual' && (
            <Tag
              className="cursor-pointer"
              color="red"
              onClick={() => cell.linkId && onDeleteLink(cell.linkId)}
            >
              删除
            </Tag>
          )}
        </div>
      )}
      {cell.linkId && cell.source === 'auto' && (
        <div className="text-text-tertiary mt-1 text-xs">修改状态将转为手动映射</div>
      )}
    </div>
  )
}

export function ComplianceCoverageMatrix({
  matrix,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
  onNavigateToChapter,
}: ComplianceCoverageMatrixProps): React.JSX.Element {
  const [allGreenAnimated, setAllGreenAnimated] = useState(false)
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAllCoveredRef = useRef(false)

  // Check if all requirements are covered (all green)
  const isAllCovered =
    matrix.stats.totalRequirements > 0 &&
    matrix.stats.coveredCount === matrix.stats.totalRequirements

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isAllCovered && !prevAllCoveredRef.current) {
      // Use microtask to avoid synchronous setState in effect
      timer = setTimeout(() => {
        setAllGreenAnimated(true)
      }, 0)
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
      }
      celebrationTimerRef.current = setTimeout(() => {
        setAllGreenAnimated(false)
        celebrationTimerRef.current = null
      }, 3000)
    }

    if (!isAllCovered && prevAllCoveredRef.current) {
      timer = setTimeout(() => {
        setAllGreenAnimated(false)
      }, 0)
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
        celebrationTimerRef.current = null
      }
    }

    prevAllCoveredRef.current = isAllCovered

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isAllCovered])

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
      }
    }
  }, [])

  const handleColumnHeaderClick = useCallback(
    (column: TraceabilityMatrixColumn): void => {
      if (column.headingLocator && onNavigateToChapter) {
        onNavigateToChapter(column.headingLocator)
      }
    },
    [onNavigateToChapter]
  )

  const getCellContextMenu = useCallback(
    (
      cell: TraceabilityMatrixCell,
      headingLocator?: ChapterHeadingLocator | null
    ): MenuProps['items'] => {
      const jumpToChapterItem =
        headingLocator && onNavigateToChapter
          ? [
              {
                key: 'jump-to-chapter',
                label: '跳转到方案章节',
                onClick: () => onNavigateToChapter(headingLocator),
              },
            ]
          : []

      if (cell.cellState === 'none') {
        return [
          ...jumpToChapterItem,
          {
            key: 'create-covered',
            label: '创建链接（已覆盖）',
            onClick: () => onCreateLink(cell.requirementId, cell.sectionId, 'covered'),
          },
          {
            key: 'create-partial',
            label: '创建链接（部分覆盖）',
            onClick: () => onCreateLink(cell.requirementId, cell.sectionId, 'partial'),
          },
          {
            key: 'create-uncovered',
            label: '创建链接（未覆盖）',
            onClick: () => onCreateLink(cell.requirementId, cell.sectionId, 'uncovered'),
          },
        ]
      }

      const items: MenuProps['items'] = [
        ...jumpToChapterItem,
        {
          key: 'status',
          label: '更新状态',
          children: (['covered', 'partial', 'uncovered'] as CoverageStatus[])
            .filter((s) => s !== cell.coverageStatus)
            .map((status) => ({
              key: `status-${status}`,
              label: STATUS_LABELS[status],
              onClick: () => cell.linkId && onUpdateLink(cell.linkId, { coverageStatus: status }),
            })),
        },
      ]

      if (cell.source === 'manual' && cell.linkId) {
        items.push({
          key: 'delete',
          label: '删除链接',
          danger: true,
          onClick: () => onDeleteLink(cell.linkId!),
        })
      }

      return items
    },
    [onCreateLink, onDeleteLink, onNavigateToChapter, onUpdateLink]
  )

  return (
    <div
      className="overflow-auto rounded-lg border border-gray-200"
      data-testid="compliance-coverage-matrix"
    >
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            {/* Corner cell */}
            <th className="bg-bg-content text-text-secondary sticky left-0 z-20 min-w-[200px] border-r border-b border-gray-200 p-2 text-left text-xs font-medium">
              需求 \ 章节
            </th>
            {/* Column headers */}
            {matrix.columns.map((col) => {
              const isImpacted = matrix.recentlyImpactedSectionIds.includes(col.sectionId)
              return (
                <th
                  key={col.sectionId}
                  className={`bg-bg-content sticky top-0 z-10 min-w-[120px] border-r border-b border-gray-200 p-2 text-center text-xs font-medium ${
                    isImpacted ? 'ring-2 ring-blue-400 ring-inset' : ''
                  } ${col.headingLocator ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                  onClick={() => handleColumnHeaderClick(col)}
                >
                  <Tooltip title={col.headingLocator ? '点击跳转到方案章节' : '章节定位信息缺失'}>
                    <div className="truncate">
                      {'#'.repeat(col.level)} {col.title}
                    </div>
                    {col.weightPercent !== undefined && (
                      <div className="text-text-tertiary text-xs">{col.weightPercent}%</div>
                    )}
                  </Tooltip>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, rowIndex) => (
            <MatrixRow
              key={row.requirementId}
              row={row}
              rowIndex={rowIndex}
              columns={matrix.columns}
              isAddedRequirement={matrix.recentlyAddedRequirementIds.includes(row.requirementId)}
              allGreenAnimated={allGreenAnimated && isAllCovered}
              getCellContextMenu={getCellContextMenu}
              onUpdateLink={onUpdateLink}
              onDeleteLink={onDeleteLink}
              onNavigateToChapter={onNavigateToChapter}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatrixRow({
  row,
  rowIndex,
  columns,
  isAddedRequirement,
  allGreenAnimated,
  getCellContextMenu,
  onUpdateLink,
  onDeleteLink,
  onNavigateToChapter,
}: {
  row: TraceabilityMatrixRow
  rowIndex: number
  columns: TraceabilityMatrixColumn[]
  isAddedRequirement: boolean
  allGreenAnimated: boolean
  getCellContextMenu: (
    cell: TraceabilityMatrixCell,
    headingLocator?: ChapterHeadingLocator | null
  ) => MenuProps['items']
  onUpdateLink: (id: string, patch: { coverageStatus?: CoverageStatus }) => void
  onDeleteLink: (id: string) => void
  onNavigateToChapter?: (locator: ChapterHeadingLocator) => void
}): React.JSX.Element {
  return (
    <tr className={isAddedRequirement ? 'ring-2 ring-blue-400 ring-inset' : ''}>
      {/* Row header */}
      <td className="bg-bg-content sticky left-0 z-10 border-r border-b border-gray-200 p-2">
        <Tooltip title={row.description}>
          <div className="flex items-center gap-1">
            <Badge
              count={row.sequenceNumber}
              style={{ backgroundColor: '#6b7280', fontSize: 10 }}
            />
            <span className="max-w-[160px] truncate text-xs">{row.description}</span>
          </div>
        </Tooltip>
      </td>
      {/* Cells */}
      {row.cells.map((cell, columnIndex) => {
        const colors = STATUS_COLORS[cell.cellState]
        const isImpacted = cell.isImpacted
        const column = columns.find((c) => c.sectionId === cell.sectionId)
        const animationDelayMs = (rowIndex * columns.length + columnIndex) * 90

        return (
          <td
            key={cell.sectionId}
            className={`border-r border-b border-gray-200 p-0 ${isImpacted ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
          >
            <Dropdown
              menu={{ items: getCellContextMenu(cell, column?.headingLocator) }}
              trigger={cell.cellState === 'none' ? ['click', 'contextMenu'] : ['contextMenu']}
            >
              {cell.cellState === 'none' ? (
                <div
                  className={`flex h-full min-h-[36px] items-center justify-center ${colors.bg} ${colors.text} cursor-pointer text-xs`}
                  data-testid={`cell-${cell.requirementId}-${cell.sectionId}`}
                >
                  N/A
                </div>
              ) : (
                <Popover
                  content={
                    <CellPopoverContent
                      cell={cell}
                      headingLocator={column?.headingLocator}
                      onUpdateLink={onUpdateLink}
                      onDeleteLink={onDeleteLink}
                      onNavigateToChapter={onNavigateToChapter}
                    />
                  }
                  trigger="click"
                  placement="bottom"
                >
                  <div
                    className={`flex h-full min-h-[36px] items-center justify-center ${colors.bg} ${colors.text} cursor-pointer text-xs font-medium transition-all ${
                      allGreenAnimated && cell.cellState === 'covered' ? 'animate-pulse' : ''
                    }`}
                    data-testid={`cell-${cell.requirementId}-${cell.sectionId}`}
                    style={
                      allGreenAnimated && cell.cellState === 'covered'
                        ? { animationDelay: `${animationDelayMs}ms` }
                        : undefined
                    }
                  >
                    {STATUS_LABELS[cell.cellState]}
                  </div>
                </Popover>
              )}
            </Dropdown>
          </td>
        )
      })}
    </tr>
  )
}
