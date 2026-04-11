import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// Mock antd components
vi.mock('antd', () => ({
  Badge: ({
    count,
    size,
    style: _style,
  }: {
    count?: number
    size?: string
    style?: React.CSSProperties
  }) => (
    <span data-testid="badge" data-count={count} data-size={size}>
      {count}
    </span>
  ),
  Spin: ({ size, className }: { size?: string; className?: string }) => (
    <div data-testid="spinner" data-size={size} className={className} />
  ),
  Typography: {
    Text: ({
      children,
      strong,
      type,
      className,
    }: {
      children?: React.ReactNode
      strong?: boolean
      type?: string
      className?: string
    }) => (
      <span data-testid={strong ? 'text-strong' : 'text'} data-type={type} className={className}>
        {children}
      </span>
    ),
  },
}))

vi.mock('@ant-design/icons', () => ({
  CaretDownOutlined: ({ className }: { className?: string }) => (
    <span data-testid="caret-down" className={className} />
  ),
  CaretRightOutlined: ({ className }: { className?: string }) => (
    <span data-testid="caret-right" className={className} />
  ),
}))

// Mock RecommendationCard to simplify panel tests
vi.mock('@modules/asset/components/RecommendationCard', () => ({
  RecommendationCard: ({
    recommendation,
    accepted,
    onInsert,
    onIgnore,
    onViewDetail,
  }: {
    recommendation: { assetId: string; title: string }
    accepted: boolean
    onInsert: () => void
    onIgnore: () => void
    onViewDetail: () => void
  }) => (
    <div data-testid={`card-${recommendation.assetId}`} data-accepted={accepted}>
      <span>{recommendation.title}</span>
      <button data-testid={`insert-${recommendation.assetId}`} onClick={onInsert}>
        插入
      </button>
      <button data-testid={`ignore-${recommendation.assetId}`} onClick={onIgnore}>
        忽略
      </button>
      <button data-testid={`detail-${recommendation.assetId}`} onClick={onViewDetail}>
        查看详情
      </button>
    </div>
  ),
}))

import type { AssetRecommendation } from '@shared/recommendation-types'
import { RecommendationPanel } from '@modules/asset/components/RecommendationPanel'

function makeRecommendation(overrides: Partial<AssetRecommendation> = {}): AssetRecommendation {
  return {
    assetId: 'a1',
    title: '微服务架构方案',
    summary: '摘要',
    assetType: 'text',
    tags: [],
    matchScore: 85,
    sourceProject: null,
    ...overrides,
  }
}

describe('RecommendationPanel', () => {
  const mockOnInsert = vi.fn()
  const mockOnIgnore = vi.fn()
  const mockOnViewDetail = vi.fn()

  const defaultProps = {
    recommendations: [] as AssetRecommendation[],
    loading: false,
    acceptedAssetIds: new Set<string>(),
    onInsert: mockOnInsert,
    onIgnore: mockOnIgnore,
    onViewDetail: mockOnViewDetail,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows "资产推荐" header', () => {
    render(<RecommendationPanel {...defaultProps} />)

    expect(screen.getByText('资产推荐')).toBeTruthy()
  })

  it('shows count badge when recommendations exist', () => {
    const recommendations = [
      makeRecommendation({ assetId: 'a1' }),
      makeRecommendation({ assetId: 'a2' }),
    ]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    const badge = screen.getByTestId('badge')
    expect(badge.dataset.count).toBe('2')
  })

  it('does not show badge when recommendations is empty', () => {
    render(<RecommendationPanel {...defaultProps} recommendations={[]} />)

    expect(screen.queryByTestId('badge')).toBeNull()
  })

  it('shows empty state message when not loading and no recommendations', () => {
    render(<RecommendationPanel {...defaultProps} loading={false} recommendations={[]} />)

    expect(screen.getByText('当前章节暂无推荐资产')).toBeTruthy()
  })

  it('shows loading spinner when loading', () => {
    render(<RecommendationPanel {...defaultProps} loading={true} />)

    expect(screen.getByTestId('spinner')).toBeTruthy()
  })

  it('does not show empty state while loading', () => {
    render(<RecommendationPanel {...defaultProps} loading={true} recommendations={[]} />)

    expect(screen.queryByText('当前章节暂无推荐资产')).toBeNull()
  })

  it('renders recommendation cards', () => {
    const recommendations = [
      makeRecommendation({ assetId: 'a1', title: '方案A' }),
      makeRecommendation({ assetId: 'a2', title: '方案B' }),
    ]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    expect(screen.getByTestId('card-a1')).toBeTruthy()
    expect(screen.getByTestId('card-a2')).toBeTruthy()
    expect(screen.getByText('方案A')).toBeTruthy()
    expect(screen.getByText('方案B')).toBeTruthy()
  })

  it('passes accepted prop correctly to cards', () => {
    const recommendations = [
      makeRecommendation({ assetId: 'a1' }),
      makeRecommendation({ assetId: 'a2' }),
    ]
    const acceptedIds = new Set(['a1'])

    render(
      <RecommendationPanel
        {...defaultProps}
        recommendations={recommendations}
        acceptedAssetIds={acceptedIds}
      />
    )

    expect(screen.getByTestId('card-a1').dataset.accepted).toBe('true')
    expect(screen.getByTestId('card-a2').dataset.accepted).toBe('false')
  })

  it('fires onInsert with assetId when card insert is clicked', () => {
    const recommendations = [makeRecommendation({ assetId: 'a1' })]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    fireEvent.click(screen.getByTestId('insert-a1'))
    expect(mockOnInsert).toHaveBeenCalledWith('a1')
  })

  it('fires onIgnore with assetId when card ignore is clicked', () => {
    const recommendations = [makeRecommendation({ assetId: 'a1' })]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    fireEvent.click(screen.getByTestId('ignore-a1'))
    expect(mockOnIgnore).toHaveBeenCalledWith('a1')
  })

  it('fires onViewDetail with assetId when card detail is clicked', () => {
    const recommendations = [makeRecommendation({ assetId: 'a1' })]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    fireEvent.click(screen.getByTestId('detail-a1'))
    expect(mockOnViewDetail).toHaveBeenCalledWith('a1')
  })

  it('collapse/expand toggle works', () => {
    const recommendations = [makeRecommendation({ assetId: 'a1' })]

    render(<RecommendationPanel {...defaultProps} recommendations={recommendations} />)

    // Initially expanded: card visible, caret-down shown
    expect(screen.getByTestId('card-a1')).toBeTruthy()
    expect(screen.getByTestId('caret-down')).toBeTruthy()

    // Click header to collapse
    fireEvent.click(screen.getByText('资产推荐'))

    // After collapse: card hidden, caret-right shown
    expect(screen.queryByTestId('card-a1')).toBeNull()
    expect(screen.getByTestId('caret-right')).toBeTruthy()

    // Click again to expand
    fireEvent.click(screen.getByText('资产推荐'))

    // Expanded again
    expect(screen.getByTestId('card-a1')).toBeTruthy()
    expect(screen.getByTestId('caret-down')).toBeTruthy()
  })
})
