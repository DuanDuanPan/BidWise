import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoringModelEditor } from '@renderer/modules/analysis/components/ScoringModelEditor'
import type { ScoringModel } from '@shared/analysis-types'

// Mock antd
vi.mock('antd', () => ({
  Table: Object.assign(
    ({ dataSource, ...props }: Record<string, unknown>) => (
      <table data-testid={props['data-testid'] as string}>
        <tbody>
          {(dataSource as Array<{ id: string; category: string; maxScore: number }>).map((item) => (
            <tr key={item.id} data-testid={`criterion-${item.id}`}>
              <td>{item.category}</td>
              <td>{item.maxScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    {
      Summary: Object.assign(
        ({ children }: { children: React.ReactNode }) => <tfoot>{children}</tfoot>,
        {
          Row: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
          Cell: ({ children }: { children: React.ReactNode; index: number }) => <td>{children}</td>,
        }
      ),
    }
  ),
  InputNumber: ({ value }: { value: number }) => <input type="number" value={value} readOnly />,
  Input: { TextArea: () => <textarea /> },
  Button: ({
    children,
    disabled,
    ...props
  }: {
    children: React.ReactNode
    disabled?: boolean
    'data-testid'?: string
  }) => (
    <button disabled={disabled} data-testid={props['data-testid']}>
      {children}
    </button>
  ),
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  message: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@ant-design/icons', () => ({
  CheckCircleOutlined: () => <span>check</span>,
}))

const mockScoringModel: ScoringModel = {
  projectId: 'proj-1',
  totalScore: 100,
  criteria: [
    {
      id: 'c-1',
      category: '技术方案',
      maxScore: 60,
      weight: 0.6,
      subItems: [
        {
          id: 's-1',
          name: '系统架构',
          maxScore: 15,
          description: '架构合理性',
          sourcePages: [23],
        },
      ],
      reasoning: '第23页明确技术方案占60分',
      status: 'extracted',
    },
    {
      id: 'c-2',
      category: '实施方案',
      maxScore: 20,
      weight: 0.2,
      subItems: [],
      reasoning: '实施方案20分',
      status: 'extracted',
    },
  ],
  extractedAt: '2026-03-21T00:00:00.000Z',
  confirmedAt: null,
  version: 1,
}

describe('ScoringModelEditor', () => {
  const mockOnUpdateCriterion = vi.fn().mockResolvedValue(undefined)
  const mockOnConfirm = vi.fn().mockResolvedValue(undefined)

  it('should render scoring model editor container', () => {
    render(
      <ScoringModelEditor
        scoringModel={mockScoringModel}
        onUpdateCriterion={mockOnUpdateCriterion}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getAllByTestId('scoring-model-editor').length).toBeGreaterThanOrEqual(1)
  })

  it('should render scoring table', () => {
    render(
      <ScoringModelEditor
        scoringModel={mockScoringModel}
        onUpdateCriterion={mockOnUpdateCriterion}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getAllByTestId('scoring-table').length).toBeGreaterThanOrEqual(1)
  })

  it('should render confirm button when not confirmed', () => {
    render(
      <ScoringModelEditor
        scoringModel={mockScoringModel}
        onUpdateCriterion={mockOnUpdateCriterion}
        onConfirm={mockOnConfirm}
      />
    )
    const btns = screen.getAllByTestId('confirm-btn')
    expect(btns.length).toBeGreaterThanOrEqual(1)
    expect(btns[0].getAttribute('disabled')).toBeNull()
  })

  it('should render disabled confirmed button when already confirmed', () => {
    const confirmedModel = {
      ...mockScoringModel,
      confirmedAt: '2026-03-21T01:00:00.000Z',
    }
    render(
      <ScoringModelEditor
        scoringModel={confirmedModel}
        onUpdateCriterion={mockOnUpdateCriterion}
        onConfirm={mockOnConfirm}
      />
    )
    const btns = screen.getAllByTestId('confirmed-btn')
    expect(btns.length).toBeGreaterThanOrEqual(1)
    expect(btns[0].hasAttribute('disabled')).toBe(true)
  })

  it('should show criteria rows', () => {
    render(
      <ScoringModelEditor
        scoringModel={mockScoringModel}
        onUpdateCriterion={mockOnUpdateCriterion}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getAllByTestId('criterion-c-1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByTestId('criterion-c-2').length).toBeGreaterThanOrEqual(1)
  })
})
