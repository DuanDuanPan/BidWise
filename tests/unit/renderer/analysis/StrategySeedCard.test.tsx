import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrategySeedCard } from '@renderer/modules/analysis/components/StrategySeedCard'
import type { StrategySeed } from '@shared/analysis-types'

const { mockMessageError, mockMessageWarning } = vi.hoisted(() => ({
  mockMessageError: vi.fn(),
  mockMessageWarning: vi.fn(),
}))

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => <span />,
  EditOutlined: () => <span />,
  DeleteOutlined: () => <span />,
  SaveOutlined: () => <span />,
  CloseOutlined: () => <span />,
}))

vi.mock('antd', () => {
  const Button = ({
    children,
    onClick,
    disabled,
    loading,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    'data-testid'?: string
  }): React.JSX.Element => (
    <button data-testid={testId} disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  )
  Button.displayName = 'MockButton'

  const Tag = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <span>{children}</span>
  )
  Tag.displayName = 'MockTag'

  const Input = ({
    value,
    onChange,
    placeholder,
    className,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    className?: string
  }): React.JSX.Element => (
    <input
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
      className={className}
    />
  )
  Input.displayName = 'MockInput'

  Input.TextArea = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
  }): React.JSX.Element => (
    <textarea
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
    />
  )
  Input.TextArea.displayName = 'MockTextArea'

  const Popconfirm = ({
    children,
    onConfirm,
  }: {
    children?: React.ReactNode
    onConfirm?: () => void
  }): React.JSX.Element => (
    <div>
      {children}
      <button data-testid="popconfirm-confirm" onClick={onConfirm}>
        删除确认
      </button>
    </div>
  )
  Popconfirm.displayName = 'MockPopconfirm'

  return {
    Button,
    Input,
    Popconfirm,
    Tag,
    message: {
      error: mockMessageError,
      warning: mockMessageWarning,
    },
  }
})

const mockSeed: StrategySeed = {
  id: 'seed-1',
  title: '数据安全合规优先级高',
  reasoning: '客户多次强调数据安全与国密算法。',
  suggestion: '突出国密能力和审计闭环。',
  sourceExcerpt: '客户非常关注数据安全合规性。',
  confidence: 0.92,
  status: 'pending',
  createdAt: '2026-04-01T09:00:00.000Z',
  updatedAt: '2026-04-01T09:00:00.000Z',
}

describe('StrategySeedCard', () => {
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  const onUpdate = vi.fn().mockResolvedValue(undefined)
  const onDelete = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders seed content and can expand the source excerpt', () => {
    render(
      <StrategySeedCard
        seed={mockSeed}
        onConfirm={onConfirm}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('数据安全合规优先级高')).toBeInTheDocument()
    expect(screen.getByText('待确认')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.queryByText('客户非常关注数据安全合规性。')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看原文摘录' }))
    expect(screen.getByText('客户非常关注数据安全合规性。')).toBeInTheDocument()
  })

  it('confirms a pending seed', async () => {
    render(
      <StrategySeedCard
        seed={mockSeed}
        onConfirm={onConfirm}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByTestId('seed-confirm'))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('seed-1')
    })
  })

  it('saves edited content with trimmed values', async () => {
    render(
      <StrategySeedCard
        seed={mockSeed}
        onConfirm={onConfirm}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByTestId('seed-edit'))
    fireEvent.change(screen.getByPlaceholderText('策略种子标题'), {
      target: { value: '  客户高度关注性能稳定性  ' },
    })
    fireEvent.change(screen.getByPlaceholderText('分析推理过程'), {
      target: { value: '  客户主动提及竞品性能问题。  ' },
    })
    fireEvent.change(screen.getByPlaceholderText('投标方案建议'), {
      target: { value: '  加入性能压测和容量规划。  ' },
    })

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('seed-1', {
        title: '客户高度关注性能稳定性',
        reasoning: '客户主动提及竞品性能问题。',
        suggestion: '加入性能压测和容量规划。',
      })
    })
  })

  it('warns instead of saving blank edits', async () => {
    render(
      <StrategySeedCard
        seed={mockSeed}
        onConfirm={onConfirm}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByTestId('seed-edit'))
    fireEvent.change(screen.getByPlaceholderText('策略种子标题'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mockMessageWarning).toHaveBeenCalledWith('标题、推理和建议均不能为空')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('deletes the seed after popconfirm confirmation', async () => {
    render(
      <StrategySeedCard
        seed={mockSeed}
        onConfirm={onConfirm}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByTestId('popconfirm-confirm'))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('seed-1')
    })
  })
})
