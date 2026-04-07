import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AnnotationOverloadPanel } from '@renderer/modules/annotation/components/AnnotationOverloadPanel'
import {
  getSummaryItems,
  OVERLOAD_THRESHOLD,
} from '@renderer/modules/annotation/lib/annotationSectionScope'
import type { AnnotationRecord } from '@shared/annotation-types'

const mockMessageInfo = vi.fn()

vi.mock('antd', () => ({
  Card: ({
    children,
    onClick,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    onClick?: () => void
    size?: string
    className?: string
    'data-testid'?: string
  }) => (
    <div data-testid={testId} onClick={onClick}>
      {children}
    </div>
  ),
  message: {
    info: (...args: unknown[]) => mockMessageInfo(...args),
  },
}))

vi.mock('@ant-design/icons', () => ({
  OrderedListOutlined: () => <span>OrderedList</span>,
  ReloadOutlined: () => <span>Reload</span>,
  ThunderboltOutlined: () => <span>Thunder</span>,
  CloseOutlined: () => <span>Close</span>,
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

describe('AnnotationOverloadPanel', () => {
  const onSelectMode = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when count <= threshold', () => {
    const { container } = render(
      <AnnotationOverloadPanel pendingCount={OVERLOAD_THRESHOLD} onSelectMode={onSelectMode} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders panel when count > threshold', () => {
    render(<AnnotationOverloadPanel pendingCount={16} onSelectMode={onSelectMode} />)
    expect(screen.getByTestId('annotation-overload-panel')).toBeTruthy()
    expect(screen.getByText('本章节有 16 条待处理批注')).toBeTruthy()
  })

  it('calls onSelectMode(step-through) and hides panel', () => {
    render(<AnnotationOverloadPanel pendingCount={20} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByTestId('overload-step-through'))
    expect(onSelectMode).toHaveBeenCalledWith('step-through')
    expect(screen.queryByTestId('annotation-overload-panel')).toBeNull()
  })

  it('shows message.info for regenerate (Alpha placeholder)', () => {
    render(<AnnotationOverloadPanel pendingCount={20} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByTestId('overload-regenerate'))
    expect(mockMessageInfo).toHaveBeenCalledWith('功能将在后续版本实现')
    expect(onSelectMode).not.toHaveBeenCalled()
  })

  it('calls onSelectMode(summary) and hides panel', () => {
    render(<AnnotationOverloadPanel pendingCount={20} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByTestId('overload-summary'))
    expect(onSelectMode).toHaveBeenCalledWith('summary')
    expect(screen.queryByTestId('annotation-overload-panel')).toBeNull()
  })

  it('hides panel when close button clicked', () => {
    render(<AnnotationOverloadPanel pendingCount={20} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByTestId('overload-close'))
    expect(screen.queryByTestId('annotation-overload-panel')).toBeNull()
  })
})

describe('getSummaryItems', () => {
  it('returns top 5 adversarial + score-warning pending items', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeAnnotation({
        id: `ann-${i}`,
        type: i % 2 === 0 ? 'adversarial' : 'score-warning',
        status: 'pending',
        createdAt: `2026-04-0${i + 1}T00:00:00.000Z`,
      })
    )

    const summary = getSummaryItems(items, 'review')
    expect(summary).toHaveLength(5)
    // All should be adversarial or score-warning
    for (const item of summary) {
      expect(['adversarial', 'score-warning']).toContain(item.type)
    }
  })

  it('excludes non-pending and non-high-priority types', () => {
    const items = [
      makeAnnotation({ id: '1', type: 'adversarial', status: 'pending' }),
      makeAnnotation({ id: '2', type: 'ai-suggestion', status: 'pending' }),
      makeAnnotation({ id: '3', type: 'adversarial', status: 'accepted' }),
    ]
    const summary = getSummaryItems(items, 'review')
    expect(summary).toHaveLength(1)
    expect(summary[0].id).toBe('1')
  })

  it('returns empty array when no matching items', () => {
    const items = [makeAnnotation({ type: 'ai-suggestion', status: 'pending' })]
    const summary = getSummaryItems(items, 'review')
    expect(summary).toHaveLength(0)
  })
})
