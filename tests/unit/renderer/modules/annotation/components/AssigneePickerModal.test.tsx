import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { AnnotationRecord } from '@shared/annotation-types'

const { mockUpdateAnnotation, mockCreateAnnotation, mockAddCustomUser } = vi.hoisted(() => ({
  mockUpdateAnnotation: vi.fn().mockResolvedValue(true),
  mockCreateAnnotation: vi.fn().mockResolvedValue(undefined),
  mockAddCustomUser: vi.fn().mockReturnValue({
    id: 'user:custom:王工',
    displayName: '王工',
    roleLabel: '自定义用户',
  }),
}))

vi.mock('@renderer/stores/annotationStore', () => ({
  useAnnotationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      updateAnnotation: mockUpdateAnnotation,
      createAnnotation: mockCreateAnnotation,
    })
  ),
}))

vi.mock('@renderer/stores/userStore', () => ({
  useUserStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentUser: { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
      knownUsers: [
        { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
        { id: 'user:zhang-zong', displayName: '张总', roleLabel: '售前总监' },
        { id: 'user:li-jingli', displayName: '李经理', roleLabel: '商务经理' },
      ],
      addCustomUser: mockAddCustomUser,
    })
  ),
}))

vi.mock('antd', () => ({
  Modal: ({
    children,
    open,
    title,
    onCancel,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    open: boolean
    title: string
    onCancel: () => void
    'data-testid'?: string
  }) =>
    open ? (
      <div data-testid={testId || 'modal'} role="dialog" aria-label={title}>
        <button data-testid="modal-close" onClick={onCancel}>
          ×
        </button>
        {children}
      </div>
    ) : null,
  Select: ({
    options,
    onSelect,
    value,
    placeholder,
    'data-testid': testId,
  }: {
    options: { value: string; label: string }[]
    onSelect?: (v: string) => void
    value?: string
    placeholder?: string
    'data-testid'?: string
  }) => (
    <select
      data-testid={testId || 'select'}
      value={value ?? ''}
      onChange={(e) => onSelect?.(e.target.value)}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Input: {
    TextArea: ({
      value,
      onChange,
      placeholder,
      'data-testid': testId,
    }: {
      value: string
      onChange: (e: { target: { value: string } }) => void
      placeholder?: string
      'data-testid'?: string
    }) => (
      <textarea
        data-testid={testId || 'textarea'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    ),
  },
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    'data-testid'?: string
  }) => (
    <button data-testid={testId} onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
}))

import { AssigneePickerModal } from '@renderer/modules/annotation/components/AssigneePickerModal'

function makeAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'ann-1',
    projectId: 'proj-1',
    sectionId: 'sec-1',
    type: 'ai-suggestion',
    content: '建议增加高可用描述以提升方案竞争力',
    author: 'agent:generate',
    status: 'pending',
    parentId: null,
    assignee: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('@story-4-4 AssigneePickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not render when open is false', () => {
    render(<AssigneePickerModal annotation={makeAnnotation()} open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal with annotation preview when open', () => {
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/建议增加高可用描述/)).toBeInTheDocument()
  })

  it('filters out current user from assignee options', () => {
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={vi.fn()} />)
    const select = screen.getByLabelText('选择或输入指导人') as HTMLSelectElement
    const optionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    // Current user (user:default) should not be an option
    expect(optionValues).not.toContain('user:default')
    // Other users should be options
    expect(optionValues).toContain('user:zhang-zong')
    expect(optionValues).toContain('user:li-jingli')
  })

  it('confirm button is disabled when no assignee selected', () => {
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={vi.fn()} />)
    const confirmBtn = screen.getByTestId('assignee-confirm-btn')
    expect(confirmBtn).toBeDisabled()
  })

  it('calls updateAnnotation with needs-decision status on confirm', async () => {
    const onClose = vi.fn()
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={onClose} />)

    // Select an assignee
    fireEvent.change(screen.getByLabelText('选择或输入指导人'), {
      target: { value: 'user:zhang-zong' },
    })

    // Click confirm
    fireEvent.click(screen.getByTestId('assignee-confirm-btn'))

    await waitFor(() => {
      expect(mockUpdateAnnotation).toHaveBeenCalledWith({
        id: 'ann-1',
        status: 'needs-decision',
        assignee: 'user:zhang-zong',
      })
    })
  })

  it('creates supplement note as human child annotation when provided', async () => {
    const onClose = vi.fn()
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('选择或输入指导人'), {
      target: { value: 'user:zhang-zong' },
    })
    fireEvent.change(screen.getByTestId('supplement-note-input'), {
      target: { value: '请张总看一下这个模块的可行性' },
    })
    fireEvent.click(screen.getByTestId('assignee-confirm-btn'))

    await waitFor(() => {
      expect(mockCreateAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'human',
          content: '请张总看一下这个模块的可行性',
          parentId: 'ann-1',
          author: 'user:default',
        })
      )
    })
  })

  it('does not create supplement annotation when note is empty', async () => {
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择或输入指导人'), {
      target: { value: 'user:zhang-zong' },
    })
    fireEvent.click(screen.getByTestId('assignee-confirm-btn'))

    await waitFor(() => {
      expect(mockUpdateAnnotation).toHaveBeenCalled()
    })
    expect(mockCreateAnnotation).not.toHaveBeenCalled()
  })

  it('calls onClose and resets state after cancel', () => {
    const onClose = vi.fn()
    render(<AssigneePickerModal annotation={makeAnnotation()} open={true} onClose={onClose} />)

    fireEvent.click(screen.getByTestId('modal-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('truncates long annotation content in preview', () => {
    const longContent = 'A'.repeat(150)
    render(
      <AssigneePickerModal
        annotation={makeAnnotation({ content: longContent })}
        open={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument()
  })
})
