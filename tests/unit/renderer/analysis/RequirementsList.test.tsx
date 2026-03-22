import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequirementsList } from '@renderer/modules/analysis/components/RequirementsList'
import type { RequirementItem } from '@shared/analysis-types'

let capturedColumns: Array<Record<string, unknown>> = []

// Mock antd to avoid complex setup
vi.mock('antd', () => ({
  Table: ({
    dataSource,
    columns,
  }: {
    dataSource: RequirementItem[]
    columns: Array<Record<string, unknown>>
  }) => {
    capturedColumns = columns
    return (
      <table data-testid="requirements-table">
        <tbody>
          {dataSource.map((item) => (
            <tr key={item.id} data-testid={`row-${item.id}`}>
              <td>{item.sequenceNumber}</td>
              <td>{item.description}</td>
              <td>{item.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  },
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Select: ({ value }: { value: string }) => <span>{value}</span>,
  Input: { TextArea: () => <textarea /> },
}))

const mockRequirements: RequirementItem[] = [
  {
    id: 'req-1',
    sequenceNumber: 1,
    description: '系统支持分布式架构',
    sourcePages: [23, 24],
    category: 'technical',
    priority: 'high',
    status: 'extracted',
  },
  {
    id: 'req-2',
    sequenceNumber: 2,
    description: '投标人需具备资质',
    sourcePages: [8],
    category: 'qualification',
    priority: 'medium',
    status: 'extracted',
  },
]

describe('RequirementsList', () => {
  const mockOnUpdate = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    capturedColumns = []
  })

  it('should render requirements list container', () => {
    render(<RequirementsList requirements={mockRequirements} onUpdate={mockOnUpdate} />)
    expect(screen.getAllByTestId('requirements-list').length).toBeGreaterThanOrEqual(1)
  })

  it('should display requirement count', () => {
    render(<RequirementsList requirements={mockRequirements} onUpdate={mockOnUpdate} />)
    expect(screen.getAllByText(/共 2 条需求/).length).toBeGreaterThanOrEqual(1)
  })

  it('should render table with data', () => {
    render(<RequirementsList requirements={mockRequirements} onUpdate={mockOnUpdate} />)
    expect(screen.getAllByTestId('requirements-table').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByTestId('row-req-1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByTestId('row-req-2').length).toBeGreaterThanOrEqual(1)
  })

  it('@story-2-5 should expose sorter and filters for the requirements table', () => {
    render(<RequirementsList requirements={mockRequirements} onUpdate={mockOnUpdate} />)

    const sequenceColumn = capturedColumns.find((column) => column.key === 'sequenceNumber')
    const categoryColumn = capturedColumns.find((column) => column.key === 'category')
    const priorityColumn = capturedColumns.find((column) => column.key === 'priority')

    expect(sequenceColumn?.sorter).toBeTypeOf('function')
    expect(categoryColumn?.filters).toHaveLength(6)
    expect(priorityColumn?.filters).toHaveLength(3)
  })
})
