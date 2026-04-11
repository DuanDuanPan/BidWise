import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// Mock antd
vi.mock('antd', () => ({
  Input: ({
    value,
    onChange,
    onKeyDown,
    onBlur,
    placeholder,
    prefix,
  }: {
    value?: string
    onChange?: (e: { target: { value: string } }) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
    onBlur?: () => void
    placeholder?: string
    prefix?: React.ReactNode
    size?: string
    style?: React.CSSProperties
  }) => (
    <div>
      {prefix}
      <input
        data-testid="tag-input"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
      />
    </div>
  ),
  Tag: ({
    children,
    closable,
    onClose,
  }: {
    children?: React.ReactNode
    closable?: boolean
    onClose?: (e: React.MouseEvent) => void
    color?: string
  }) => (
    <span data-testid="tag-item" data-closable={closable}>
      {children}
      {closable && (
        <button data-testid={`remove-tag-${children}`} onClick={onClose}>
          ×
        </button>
      )}
    </span>
  ),
}))

vi.mock('@ant-design/icons', () => ({
  PlusOutlined: () => <span data-testid="plus-icon" />,
}))

import { TagEditor } from '@modules/asset/components/TagEditor'

function makeTag(name: string) {
  return {
    id: `t-${name}`,
    name,
    normalizedName: name.toLowerCase(),
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('TagEditor', () => {
  const mockOnAdd = vi.fn()
  const mockOnRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders existing tags', () => {
    const tags = [makeTag('架构图'), makeTag('案例')]

    render(<TagEditor tags={tags} onAdd={mockOnAdd} onRemove={mockOnRemove} />)

    expect(screen.getAllByTestId('tag-item')).toHaveLength(2)
    expect(screen.getByText('架构图')).toBeTruthy()
    expect(screen.getByText('案例')).toBeTruthy()
  })

  it('shows helper text', () => {
    render(<TagEditor tags={[]} onAdd={mockOnAdd} onRemove={mockOnRemove} />)

    expect(screen.getByText('按 Enter 添加标签，点击 × 删除标签')).toBeTruthy()
  })

  it('calls onAdd when Enter is pressed', () => {
    render(<TagEditor tags={[]} onAdd={mockOnAdd} onRemove={mockOnRemove} />)

    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: '新标签' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockOnAdd).toHaveBeenCalledWith('新标签')
  })

  it('calls onRemove when × is clicked', () => {
    const tags = [makeTag('删除我')]

    render(<TagEditor tags={tags} onAdd={mockOnAdd} onRemove={mockOnRemove} />)

    const removeBtn = screen.getByTestId('remove-tag-删除我')
    fireEvent.click(removeBtn)

    expect(mockOnRemove).toHaveBeenCalled()
  })

  it('does not call onAdd for empty input', () => {
    render(<TagEditor tags={[]} onAdd={mockOnAdd} onRemove={mockOnRemove} />)

    const input = screen.getByTestId('tag-input')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockOnAdd).not.toHaveBeenCalled()
  })
})
