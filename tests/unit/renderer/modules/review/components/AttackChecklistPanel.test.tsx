import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { AttackChecklist } from '@shared/attack-checklist-types'

// Mock useAttackChecklist
const mockGenerateChecklist = vi.fn()
const mockUpdateItemStatus = vi.fn()
const mockClearError = vi.fn()
const mockUseAttackChecklist = vi.fn()

vi.mock('@modules/review/hooks/useAttackChecklist', () => ({
  useAttackChecklist: (...args: unknown[]) => mockUseAttackChecklist(...args),
}))

// Mock AttackChecklistItemCard
vi.mock('@modules/review/components/AttackChecklistItemCard', () => ({
  AttackChecklistItemCard: ({ item }: { item: { id: string; attackAngle: string } }) => (
    <div data-testid="attack-checklist-item-card" data-item-id={item.id}>
      {item.attackAngle}
    </div>
  ),
}))

// Mock antd
vi.mock('antd', () => ({
  Alert: ({
    message,
    type,
    ...rest
  }: {
    message: string
    type: string
    'data-testid'?: string
  }) => <div data-testid={rest['data-testid'] ?? `${type}-alert`}>{message}</div>,
  Badge: ({ count }: { count: string }) => <span data-testid="checklist-badge">{count}</span>,
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
  Progress: ({ percent }: { percent: number }) => (
    <div data-testid="progress-bar" data-percent={percent} />
  ),
  Spin: () => <div data-testid="spin" />,
  Switch: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <input
      type="checkbox"
      data-testid="show-all-switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  ),
}))

vi.mock('@ant-design/icons', () => ({
  ThunderboltOutlined: () => <span data-testid="thunderbolt-icon" />,
  ReloadOutlined: () => <span data-testid="reload-icon" />,
}))

import { AttackChecklistPanel } from '@modules/review/components/AttackChecklistPanel'

const makeChecklist = (overrides?: Partial<AttackChecklist>): AttackChecklist => ({
  id: 'cl-1',
  projectId: 'proj-1',
  status: 'generated',
  items: [
    {
      id: 'item-1',
      checklistId: 'cl-1',
      category: '合规性',
      attackAngle: '*项覆盖完整性',
      severity: 'critical',
      defenseSuggestion: '逐条检查*项',
      targetSection: null,
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-2',
      checklistId: 'cl-1',
      category: '技术方案',
      attackAngle: '架构选型论证',
      severity: 'major',
      defenseSuggestion: '增加对比分析',
      targetSection: '系统架构设计',
      targetSectionLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
      status: 'addressed',
      sortOrder: 1,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-3',
      checklistId: 'cl-1',
      category: '差异化',
      attackAngle: '方案同质化',
      severity: 'minor',
      defenseSuggestion: '突出亮点',
      targetSection: null,
      targetSectionLocator: null,
      status: 'dismissed',
      sortOrder: 2,
      createdAt: '',
      updatedAt: '',
    },
  ],
  generationSource: 'llm',
  warningMessage: null,
  generatedAt: '',
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

describe('AttackChecklistPanel @story-7-5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAttackChecklist.mockReturnValue({
      checklist: null,
      loading: false,
      error: null,
      progress: 0,
      message: null,
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 0, addressed: 0, dismissed: 0, remaining: 0, progressPercent: 0 },
    })
  })

  afterEach(cleanup)

  it('renders empty state with generate button when no checklist', () => {
    render(<AttackChecklistPanel projectId="proj-1" />)

    expect(screen.getByTestId('checklist-empty')).toBeDefined()
    expect(screen.getByTestId('generate-checklist-button')).toBeDefined()
    expect(screen.getByText(/尚未生成攻击清单/)).toBeDefined()
  })

  it('calls generateChecklist when generate button is clicked', () => {
    render(<AttackChecklistPanel projectId="proj-1" />)

    fireEvent.click(screen.getByTestId('generate-checklist-button'))
    expect(mockGenerateChecklist).toHaveBeenCalled()
  })

  it('shows loading spinner during generation', () => {
    mockUseAttackChecklist.mockReturnValue({
      checklist: null,
      loading: true,
      error: null,
      progress: 50,
      message: '正在生成攻击清单...',
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 0, addressed: 0, dismissed: 0, remaining: 0, progressPercent: 0 },
    })

    render(<AttackChecklistPanel projectId="proj-1" />)

    expect(screen.getByTestId('checklist-generating')).toBeDefined()
    expect(screen.getByTestId('spin')).toBeDefined()
  })

  it('renders items list when checklist is generated', () => {
    const checklist = makeChecklist()
    mockUseAttackChecklist.mockReturnValue({
      checklist,
      loading: false,
      error: null,
      progress: 0,
      message: null,
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 2, addressed: 1, dismissed: 1, remaining: 1, progressPercent: 50 },
    })

    render(<AttackChecklistPanel projectId="proj-1" />)

    // Should show 2 items (dismissed hidden by default)
    const items = screen.getAllByTestId('attack-checklist-item-card')
    expect(items).toHaveLength(2)
  })

  it('shows badge with addressed/total count', () => {
    mockUseAttackChecklist.mockReturnValue({
      checklist: makeChecklist(),
      loading: false,
      error: null,
      progress: 0,
      message: null,
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 2, addressed: 1, dismissed: 1, remaining: 1, progressPercent: 50 },
    })

    render(<AttackChecklistPanel projectId="proj-1" />)

    expect(screen.getByTestId('checklist-badge').textContent).toBe('1/2')
  })

  it('shows fallback warning when generationSource is fallback', () => {
    const checklist = makeChecklist({
      generationSource: 'fallback',
      warningMessage: 'AI 生成失败，已使用通用攻击清单',
    })

    mockUseAttackChecklist.mockReturnValue({
      checklist,
      loading: false,
      error: null,
      progress: 0,
      message: null,
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 2, addressed: 0, dismissed: 0, remaining: 2, progressPercent: 0 },
    })

    render(<AttackChecklistPanel projectId="proj-1" />)

    expect(screen.getByTestId('fallback-warning')).toBeDefined()
  })

  it('returns null when no projectId', () => {
    const { container } = render(<AttackChecklistPanel />)
    expect(container.innerHTML).toBe('')
  })

  it('starts collapsed when defaultCollapsed is true', () => {
    mockUseAttackChecklist.mockReturnValue({
      checklist: makeChecklist(),
      loading: false,
      error: null,
      progress: 0,
      message: null,
      generateChecklist: mockGenerateChecklist,
      updateItemStatus: mockUpdateItemStatus,
      clearError: mockClearError,
      stats: { total: 2, addressed: 1, dismissed: 1, remaining: 1, progressPercent: 50 },
    })

    render(<AttackChecklistPanel projectId="proj-1" defaultCollapsed={true} />)

    // Items should not be visible when collapsed
    expect(screen.queryAllByTestId('attack-checklist-item-card')).toHaveLength(0)
  })
})
