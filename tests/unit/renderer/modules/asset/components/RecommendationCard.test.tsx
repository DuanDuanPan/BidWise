import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// Mock antd components
vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    type,
    size,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    type?: string
    size?: string
  }) => (
    <button data-testid={`btn-${children}`} data-type={type} data-size={size} onClick={onClick}>
      {children}
    </button>
  ),
  Tag: ({
    children,
    color,
    className,
  }: {
    children?: React.ReactNode
    color?: string
    className?: string
  }) => (
    <span data-testid="tag" data-color={color} className={className}>
      {children}
    </span>
  ),
  Typography: {
    Text: ({
      children,
      strong,
      type,
      className,
      title,
    }: {
      children?: React.ReactNode
      strong?: boolean
      type?: string
      className?: string
      title?: string
    }) => (
      <span
        data-testid={strong ? 'text-strong' : 'text'}
        data-type={type}
        className={className}
        title={title}
      >
        {children}
      </span>
    ),
    Paragraph: ({
      children,
      type,
      className,
      ellipsis,
    }: {
      children?: React.ReactNode
      type?: string
      className?: string
      ellipsis?: { rows: number }
    }) => (
      <p data-testid="paragraph" data-type={type} className={className} data-rows={ellipsis?.rows}>
        {children}
      </p>
    ),
  },
}))

import type { AssetRecommendation } from '@shared/recommendation-types'
import { RecommendationCard } from '@modules/asset/components/RecommendationCard'

function makeRecommendation(overrides: Partial<AssetRecommendation> = {}): AssetRecommendation {
  return {
    assetId: 'a1',
    title: '微服务架构方案',
    summary: '一套成熟的微服务架构设计方案，适用于大型企业级应用',
    assetType: 'text',
    tags: [
      { id: 't1', name: '架构', normalizedName: '架构', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't2', name: '微服务', normalizedName: '微服务', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    matchScore: 92,
    sourceProject: null,
    ...overrides,
  }
}

describe('RecommendationCard', () => {
  const mockOnInsert = vi.fn()
  const mockOnIgnore = vi.fn()
  const mockOnViewDetail = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders with green border style when not accepted', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    const card = screen.getByTestId('recommendation-card')
    // JSDOM normalizes hex to rgb
    expect(card.style.borderColor).toBe('rgb(82, 196, 26)')
    expect(card.style.backgroundColor).toBe('rgb(246, 255, 237)')
    expect(card.style.opacity).toBe('1')
  })

  it('shows title and matchScore percentage', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation({ title: '分布式方案', matchScore: 87 })}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    expect(screen.getByText('分布式方案')).toBeTruthy()
    expect(screen.getByText('87%')).toBeTruthy()
  })

  it('shows summary text', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation({ summary: '详细摘要内容' })}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    const paragraph = screen.getByTestId('paragraph')
    expect(paragraph.textContent).toBe('详细摘要内容')
    expect(paragraph.dataset.rows).toBe('2')
  })

  it('shows max 3 tags with overflow as +N', () => {
    const tags = [
      { id: 't1', name: '标签1', normalizedName: '标签1', createdAt: '' },
      { id: 't2', name: '标签2', normalizedName: '标签2', createdAt: '' },
      { id: 't3', name: '标签3', normalizedName: '标签3', createdAt: '' },
      { id: 't4', name: '标签4', normalizedName: '标签4', createdAt: '' },
      { id: 't5', name: '标签5', normalizedName: '标签5', createdAt: '' },
    ]

    render(
      <RecommendationCard
        recommendation={makeRecommendation({ tags })}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    // 3 visible tags + 1 overflow tag = 4 tag elements
    const allTags = screen.getAllByTestId('tag')
    expect(allTags).toHaveLength(4)
    expect(screen.getByText('标签1')).toBeTruthy()
    expect(screen.getByText('标签2')).toBeTruthy()
    expect(screen.getByText('标签3')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.queryByText('标签4')).toBeNull()
    expect(screen.queryByText('标签5')).toBeNull()
  })

  it('shows exactly 3 tags without overflow when there are 3 tags', () => {
    const tags = [
      { id: 't1', name: 'A', normalizedName: 'a', createdAt: '' },
      { id: 't2', name: 'B', normalizedName: 'b', createdAt: '' },
      { id: 't3', name: 'C', normalizedName: 'c', createdAt: '' },
    ]

    render(
      <RecommendationCard
        recommendation={makeRecommendation({ tags })}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    const allTags = screen.getAllByTestId('tag')
    expect(allTags).toHaveLength(3)
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
  })

  it('renders three buttons: 插入, 忽略, 查看详情', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    expect(screen.getByTestId('btn-插入')).toBeTruthy()
    expect(screen.getByTestId('btn-忽略')).toBeTruthy()
    expect(screen.getByTestId('btn-查看详情')).toBeTruthy()
  })

  it('fires onInsert callback when 插入 is clicked', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    fireEvent.click(screen.getByTestId('btn-插入'))
    expect(mockOnInsert).toHaveBeenCalledTimes(1)
  })

  it('fires onIgnore callback when 忽略 is clicked', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    fireEvent.click(screen.getByTestId('btn-忽略'))
    expect(mockOnIgnore).toHaveBeenCalledTimes(1)
  })

  it('fires onViewDetail callback when 查看详情 is clicked', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={false}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    fireEvent.click(screen.getByTestId('btn-查看详情'))
    expect(mockOnViewDetail).toHaveBeenCalledTimes(1)
  })

  it('accepted state: shows 已插入 tag, hides buttons, changes opacity', () => {
    render(
      <RecommendationCard
        recommendation={makeRecommendation()}
        accepted={true}
        onInsert={mockOnInsert}
        onIgnore={mockOnIgnore}
        onViewDetail={mockOnViewDetail}
      />
    )

    const card = screen.getByTestId('recommendation-card')
    expect(card.style.opacity).toBe('0.7')
    // JSDOM normalizes hex to rgb
    expect(card.style.borderColor).toBe('rgb(217, 217, 217)')
    expect(card.style.backgroundColor).toBe('rgb(250, 250, 250)')

    // 已插入 tag rendered
    expect(screen.getByText('已插入')).toBeTruthy()

    // Buttons hidden
    expect(screen.queryByTestId('btn-插入')).toBeNull()
    expect(screen.queryByTestId('btn-忽略')).toBeNull()
    expect(screen.queryByTestId('btn-查看详情')).toBeNull()
  })
})
