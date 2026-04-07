import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AnnotationFilters } from '@renderer/modules/annotation/components/AnnotationFilters'
import {
  filterAnnotations,
  countByStatus,
} from '@renderer/modules/annotation/lib/annotationFilters'
import type {
  AnnotationFilterGroup,
  StatusFilter,
} from '@renderer/modules/annotation/components/AnnotationFilters'
import type { AnnotationRecord } from '@shared/annotation-types'

// Minimal antd mock
vi.mock('antd', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function makeAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'ann-1',
    projectId: 'proj-1',
    sectionId: '2:公司简介:0',
    type: 'ai-suggestion',
    content: 'test',
    author: 'agent:generate',
    status: 'pending',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

const allGroups = new Set<AnnotationFilterGroup>([
  'ai-suggestion',
  'asset-recommendation',
  'score-warning',
  'adversarial',
  'human-crossrole',
])

describe('filterAnnotations', () => {
  it('filters by type group and status', () => {
    const items = [
      makeAnnotation({ id: 'a1', type: 'ai-suggestion', status: 'pending' }),
      makeAnnotation({ id: 'a2', type: 'adversarial', status: 'pending' }),
      makeAnnotation({ id: 'a3', type: 'ai-suggestion', status: 'accepted' }),
    ]

    const filtered = filterAnnotations(
      items,
      new Set(['ai-suggestion'] as AnnotationFilterGroup[]),
      'pending'
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('a1')
  })

  it('maps human and cross-role to same group', () => {
    const items = [
      makeAnnotation({ id: 'h', type: 'human', status: 'pending' }),
      makeAnnotation({ id: 'cr', type: 'cross-role', status: 'pending' }),
    ]

    const filtered = filterAnnotations(
      items,
      new Set(['human-crossrole'] as AnnotationFilterGroup[]),
      'pending'
    )
    expect(filtered).toHaveLength(2)
  })

  it('processed filter covers accepted and rejected', () => {
    const items = [
      makeAnnotation({ id: 'a', status: 'accepted' }),
      makeAnnotation({ id: 'r', status: 'rejected' }),
      makeAnnotation({ id: 'p', status: 'pending' }),
    ]
    const filtered = filterAnnotations(items, allGroups, 'processed')
    expect(filtered).toHaveLength(2)
    expect(filtered.map((i) => i.id)).toEqual(['a', 'r'])
  })
})

describe('countByStatus', () => {
  it('counts annotations by status filter categories', () => {
    const items = [
      makeAnnotation({ id: '1', status: 'pending' }),
      makeAnnotation({ id: '2', status: 'pending' }),
      makeAnnotation({ id: '3', status: 'accepted' }),
      makeAnnotation({ id: '4', status: 'rejected' }),
      makeAnnotation({ id: '5', status: 'needs-decision' }),
    ]
    const counts = countByStatus(items, allGroups)
    expect(counts.pending).toBe(2)
    expect(counts.processed).toBe(2)
    expect(counts['needs-decision']).toBe(1)
  })

  it('respects type filter when counting', () => {
    const items = [
      makeAnnotation({ id: '1', type: 'ai-suggestion', status: 'pending' }),
      makeAnnotation({ id: '2', type: 'adversarial', status: 'pending' }),
    ]
    const counts = countByStatus(items, new Set(['ai-suggestion'] as AnnotationFilterGroup[]))
    expect(counts.pending).toBe(1)
  })
})

describe('AnnotationFilters component', () => {
  const defaultProps = {
    typeFilter: allGroups,
    statusFilter: 'pending' as StatusFilter,
    statusCounts: { pending: 3, processed: 1, 'needs-decision': 0 } as Record<StatusFilter, number>,
    onToggleType: vi.fn(),
    onStatusChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders 5 type filter buttons', () => {
    render(<AnnotationFilters {...defaultProps} />)
    expect(screen.getByTestId('type-filter-ai-suggestion')).toBeTruthy()
    expect(screen.getByTestId('type-filter-asset-recommendation')).toBeTruthy()
    expect(screen.getByTestId('type-filter-score-warning')).toBeTruthy()
    expect(screen.getByTestId('type-filter-adversarial')).toBeTruthy()
    expect(screen.getByTestId('type-filter-human-crossrole')).toBeTruthy()
  })

  it('renders 3 status tabs with counts', () => {
    render(<AnnotationFilters {...defaultProps} />)
    expect(screen.getByTestId('status-filter-pending')).toHaveTextContent('待处理')
    expect(screen.getByTestId('status-filter-pending')).toHaveTextContent('3')
    expect(screen.getByTestId('status-filter-processed')).toHaveTextContent('已处理')
    expect(screen.getByTestId('status-filter-processed')).toHaveTextContent('1')
    expect(screen.getByTestId('status-filter-needs-decision')).toHaveTextContent('待决策')
    expect(screen.getByTestId('status-filter-needs-decision')).toHaveTextContent('0')
  })

  it('calls onToggleType when a type dot is clicked', () => {
    render(<AnnotationFilters {...defaultProps} />)
    fireEvent.click(screen.getByTestId('type-filter-adversarial'))
    expect(defaultProps.onToggleType).toHaveBeenCalledWith('adversarial')
  })

  it('calls onStatusChange when a status tab is clicked', () => {
    render(<AnnotationFilters {...defaultProps} />)
    fireEvent.click(screen.getByTestId('status-filter-processed'))
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith('processed')
  })

  it('marks active type dots with aria-pressed=true', () => {
    const subset = new Set<AnnotationFilterGroup>(['ai-suggestion'])
    render(<AnnotationFilters {...defaultProps} typeFilter={subset} />)
    expect(screen.getByTestId('type-filter-ai-suggestion').getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(screen.getByTestId('type-filter-adversarial').getAttribute('aria-pressed')).toBe('false')
  })

  it('marks active status tab with aria-selected=true', () => {
    render(<AnnotationFilters {...defaultProps} statusFilter="processed" />)
    expect(screen.getByTestId('status-filter-processed').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('status-filter-pending').getAttribute('aria-selected')).toBe('false')
  })
})
