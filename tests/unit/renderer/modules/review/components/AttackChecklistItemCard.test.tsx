import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { AttackChecklistItem } from '@shared/attack-checklist-types'

// Mock antd
vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode
    onClick?: () => void
    'data-testid'?: string
  }) => (
    <button onClick={onClick} data-testid={rest['data-testid']}>
      {children}
    </button>
  ),
  Tag: ({
    children,
    style,
    color,
    ...rest
  }: {
    children: React.ReactNode
    style?: React.CSSProperties
    color?: string
    'data-testid'?: string
  }) => (
    <span data-testid={rest['data-testid']} data-color={color} style={style}>
      {children}
    </span>
  ),
}))

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => <span />,
  EyeInvisibleOutlined: () => <span />,
}))

import { AttackChecklistItemCard } from '@modules/review/components/AttackChecklistItemCard'

const makeItem = (overrides?: Partial<AttackChecklistItem>): AttackChecklistItem => ({
  id: 'item-1',
  checklistId: 'cl-1',
  category: '合规性',
  attackAngle: '测试攻击角度描述，这是一个较长的文本',
  severity: 'critical',
  defenseSuggestion: '防御建议文本',
  targetSection: null,
  targetSectionLocator: null,
  status: 'unaddressed',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('AttackChecklistItemCard @story-7-5', () => {
  const mockOnUpdateStatus = vi.fn()
  const mockOnNavigateToSection = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it('renders severity badge with correct label', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({ severity: 'critical' })}
        onUpdateStatus={mockOnUpdateStatus}
      />
    )

    expect(screen.getByTestId('severity-badge').textContent).toBe('严重')
  })

  it('renders major severity badge', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({ severity: 'major' })}
        onUpdateStatus={mockOnUpdateStatus}
      />
    )

    expect(screen.getByTestId('severity-badge').textContent).toBe('重要')
  })

  it('renders minor severity badge', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({ severity: 'minor' })}
        onUpdateStatus={mockOnUpdateStatus}
      />
    )

    expect(screen.getByTestId('severity-badge').textContent).toBe('轻微')
  })

  it('shows attack angle text', () => {
    render(<AttackChecklistItemCard item={makeItem()} onUpdateStatus={mockOnUpdateStatus} />)

    expect(screen.getByTestId('attack-angle').textContent).toContain('测试攻击角度描述')
  })

  it('shows expanded details on click', () => {
    render(<AttackChecklistItemCard item={makeItem()} onUpdateStatus={mockOnUpdateStatus} />)

    // Click to expand
    fireEvent.click(screen.getByTestId('attack-checklist-item-card'))

    expect(screen.getByTestId('expanded-details')).toBeDefined()
    expect(screen.getByTestId('defense-suggestion')).toBeDefined()
    expect(screen.getByTestId('address-button')).toBeDefined()
    expect(screen.getByTestId('dismiss-button')).toBeDefined()
  })

  it('calls onUpdateStatus with addressed when "已防御" button clicked', () => {
    render(<AttackChecklistItemCard item={makeItem()} onUpdateStatus={mockOnUpdateStatus} />)

    // Expand first
    fireEvent.click(screen.getByTestId('attack-checklist-item-card'))
    // Click address button
    fireEvent.click(screen.getByTestId('address-button'))

    expect(mockOnUpdateStatus).toHaveBeenCalledWith('item-1', 'addressed')
  })

  it('calls onUpdateStatus with dismissed when "忽略" button clicked', () => {
    render(<AttackChecklistItemCard item={makeItem()} onUpdateStatus={mockOnUpdateStatus} />)

    fireEvent.click(screen.getByTestId('attack-checklist-item-card'))
    fireEvent.click(screen.getByTestId('dismiss-button'))

    expect(mockOnUpdateStatus).toHaveBeenCalledWith('item-1', 'dismissed')
  })

  it('shows addressed label and hides action buttons when status is addressed', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({ status: 'addressed' })}
        onUpdateStatus={mockOnUpdateStatus}
      />
    )

    expect(screen.getByTestId('addressed-label')).toBeDefined()
    // Expand
    fireEvent.click(screen.getByTestId('attack-checklist-item-card'))
    // No action buttons
    expect(screen.queryByTestId('address-button')).toBeNull()
  })

  it('shows dismissed label when status is dismissed', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({ status: 'dismissed' })}
        onUpdateStatus={mockOnUpdateStatus}
      />
    )

    expect(screen.getByTestId('dismissed-label')).toBeDefined()
  })

  it('renders target section as clickable link when locator exists', () => {
    const locator = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }
    render(
      <AttackChecklistItemCard
        item={makeItem({
          targetSection: '系统架构设计',
          targetSectionLocator: locator,
        })}
        onUpdateStatus={mockOnUpdateStatus}
        onNavigateToSection={mockOnNavigateToSection}
      />
    )

    const link = screen.getByTestId('target-section-link')
    expect(link.textContent).toBe('系统架构设计')
    fireEvent.click(link)
    expect(mockOnNavigateToSection).toHaveBeenCalledWith(locator)
  })

  it('renders target section as plain text when no locator', () => {
    render(
      <AttackChecklistItemCard
        item={makeItem({
          targetSection: '系统架构设计',
          targetSectionLocator: null,
        })}
        onUpdateStatus={mockOnUpdateStatus}
        onNavigateToSection={mockOnNavigateToSection}
      />
    )

    const link = screen.getByTestId('target-section-link')
    fireEvent.click(link)
    // Should not navigate
    expect(mockOnNavigateToSection).not.toHaveBeenCalled()
  })
})
