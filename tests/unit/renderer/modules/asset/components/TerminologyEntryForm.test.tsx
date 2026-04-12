import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock antd components
vi.mock('antd', () => ({
  Modal: ({
    open,
    title,
    onOk,
    onCancel,
    children,
  }: {
    open: boolean
    title: ReactNode
    onOk: () => void
    onCancel: () => void
    children: ReactNode
  }) =>
    open ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
        <button data-testid="ok-btn" onClick={onOk}>
          OK
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
  Form: Object.assign(
    ({ children }: { children: ReactNode }) => <form data-testid="form">{children}</form>,
    {
      useForm: () => [
        {
          setFieldsValue: vi.fn(),
          resetFields: vi.fn(),
          validateFields: vi.fn().mockResolvedValue({ sourceTerm: '测试', targetTerm: '测试目标' }),
          setFields: vi.fn(),
        },
      ],
      Item: ({
        children,
        name,
        label,
      }: {
        children: ReactNode
        name: string
        label: ReactNode
      }) => (
        <div data-testid={`form-item-${name}`}>
          <label>{label}</label>
          {children}
        </div>
      ),
    }
  ),
  Input: Object.assign(
    ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
    {
      TextArea: () => <textarea />,
    }
  ),
  AutoComplete: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
  App: {
    useApp: () => ({ message: { success: vi.fn(), error: vi.fn() } }),
  },
}))

// Mock the store
const mockCreateEntry = vi.fn()
const mockUpdateEntry = vi.fn()

vi.mock('@renderer/stores', () => ({
  useTerminologyStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      entries: [],
      createEntry: mockCreateEntry,
      updateEntry: mockUpdateEntry,
    }
    return selector ? selector(state) : state
  },
}))

const { TerminologyEntryForm } = await import('@modules/asset/components/TerminologyEntryForm')

describe('TerminologyEntryForm', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows "添加术语映射" title when editingEntry is null (add mode)', () => {
    render(<TerminologyEntryForm open={true} editingEntry={null} onClose={mockOnClose} />)

    expect(screen.getByText('添加术语映射')).toBeTruthy()
  })

  it('shows "编辑术语映射" title when editingEntry is provided (edit mode)', () => {
    const entry = {
      id: 'e1',
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: '军工装备',
      description: '行业标准术语',
      isActive: true,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    }

    render(<TerminologyEntryForm open={true} editingEntry={entry} onClose={mockOnClose} />)

    expect(screen.getByText('编辑术语映射')).toBeTruthy()
  })

  it('does not render when open=false', () => {
    render(<TerminologyEntryForm open={false} editingEntry={null} onClose={mockOnClose} />)

    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('onClose is called when cancel button clicked', () => {
    render(<TerminologyEntryForm open={true} editingEntry={null} onClose={mockOnClose} />)

    fireEvent.click(screen.getByTestId('cancel-btn'))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('renders form fields for sourceTerm, targetTerm, category, and description', () => {
    render(<TerminologyEntryForm open={true} editingEntry={null} onClose={mockOnClose} />)

    expect(screen.getByTestId('form-item-sourceTerm')).toBeTruthy()
    expect(screen.getByTestId('form-item-targetTerm')).toBeTruthy()
    expect(screen.getByTestId('form-item-category')).toBeTruthy()
    expect(screen.getByTestId('form-item-description')).toBeTruthy()
  })
})
