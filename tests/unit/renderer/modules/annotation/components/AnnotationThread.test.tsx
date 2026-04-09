import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { AnnotationRecord } from '@shared/annotation-types'

const mockLoadReplies = vi.fn()
const mockCreateAnnotation = vi.fn().mockResolvedValue(undefined)

vi.mock('@renderer/stores/annotationStore', () => ({
  useAnnotationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      createAnnotation: mockCreateAnnotation,
    })
  ),
}))

vi.mock('@renderer/stores/userStore', () => ({
  useUserStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentUser: { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
    })
  ),
}))

let mockReplies: AnnotationRecord[] = []
let mockLoading = false

vi.mock('@renderer/modules/annotation/hooks/useAnnotationReplies', () => ({
  useAnnotationReplies: () => ({
    replies: mockReplies,
    loading: mockLoading,
    loadReplies: mockLoadReplies,
  }),
}))

vi.mock('@renderer/shared/lib/format-time', () => ({
  formatRelativeTime: (date: string) => `相对时间(${date.slice(0, 10)})`,
}))

vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    icon,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    icon?: React.ReactNode
    'data-testid'?: string
  }) => (
    <button data-testid={testId} onClick={onClick} disabled={disabled || loading}>
      {icon}
      {children}
    </button>
  ),
  Input: {
    TextArea: ({
      value,
      onChange,
      placeholder,
      disabled,
      onPressEnter,
    }: {
      value: string
      onChange: (e: { target: { value: string } }) => void
      placeholder?: string
      disabled?: boolean
      onPressEnter?: (e: { shiftKey: boolean; preventDefault: () => void }) => void
    }) => (
      <textarea
        data-testid="reply-textarea"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onPressEnter) {
            onPressEnter({ shiftKey: e.shiftKey, preventDefault: () => e.preventDefault() })
          }
        }}
      />
    ),
  },
  Skeleton: ({ active }: { active: boolean }) => (
    <div data-testid="skeleton" data-active={active}>
      Loading...
    </div>
  ),
}))

vi.mock('@ant-design/icons', () => ({
  SendOutlined: () => <span data-testid="send-icon">→</span>,
}))

import { AnnotationThread } from '@renderer/modules/annotation/components/AnnotationThread'

function makeAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'ann-root',
    projectId: 'proj-1',
    sectionId: 'sec-1',
    type: 'ai-suggestion',
    content: 'AI 建议内容',
    author: 'agent:generate',
    status: 'pending',
    parentId: null,
    assignee: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

function makeReply(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'reply-1',
    projectId: 'proj-1',
    sectionId: 'sec-1',
    type: 'human',
    content: '回复内容',
    author: 'user:default',
    status: 'pending',
    parentId: 'ann-root',
    assignee: null,
    createdAt: '2026-04-01T01:00:00Z',
    updatedAt: '2026-04-01T01:00:00Z',
    ...overrides,
  }
}

describe('@story-4-4 AnnotationThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReplies = []
    mockLoading = false
  })

  afterEach(() => {
    cleanup()
  })

  it('calls loadReplies on mount', () => {
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)
    expect(mockLoadReplies).toHaveBeenCalled()
  })

  it('shows loading skeleton when loading', () => {
    mockLoading = true
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)
    expect(screen.getByTestId('thread-loading')).toBeInTheDocument()
  })

  it('renders replies in chronological order', () => {
    mockReplies = [
      makeReply({ id: 'r-1', content: '第一条回复', createdAt: '2026-04-01T01:00:00Z' }),
      makeReply({ id: 'r-2', content: '第二条回复', createdAt: '2026-04-01T02:00:00Z' }),
    ]
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)

    const replies = screen.getAllByTestId('thread-reply')
    expect(replies).toHaveLength(2)
    expect(replies[0]).toHaveTextContent('第一条回复')
    expect(replies[1]).toHaveTextContent('第二条回复')
  })

  it('displays reply input area', () => {
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)
    expect(screen.getByTestId('thread-reply-input')).toBeInTheDocument()
    expect(screen.getByTestId('reply-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('thread-send-btn')).toBeInTheDocument()
  })

  it('send button is disabled when reply is empty', () => {
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)
    expect(screen.getByTestId('thread-send-btn')).toBeDisabled()
  })

  it('submits reply with correct fields', async () => {
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '我的回复' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(mockCreateAnnotation).toHaveBeenCalledWith({
        projectId: 'proj-1',
        sectionId: 'sec-1',
        type: 'human',
        content: '我的回复',
        author: 'user:default',
        parentId: 'ann-root',
      })
    })
  })

  it('clears input after successful reply', async () => {
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '回复' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('reply-textarea')).toHaveValue('')
    })
  })

  it('triggers AI feedback callback for AI annotation types', async () => {
    const onAiFeedback = vi.fn()
    const root = makeAnnotation({ type: 'ai-suggestion' })
    render(<AnnotationThread rootAnnotation={root} onAiFeedback={onAiFeedback} />)

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '请改进这条建议' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(onAiFeedback).toHaveBeenCalledWith(root, '请改进这条建议')
    })
  })

  it('does not trigger AI feedback for human annotation types', async () => {
    const onAiFeedback = vi.fn()
    render(
      <AnnotationThread
        rootAnnotation={makeAnnotation({ type: 'human' })}
        onAiFeedback={onAiFeedback}
      />
    )

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '回复' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(mockCreateAnnotation).toHaveBeenCalled()
    })
    expect(onAiFeedback).not.toHaveBeenCalled()
  })

  it('triggers AI feedback for adversarial type', async () => {
    const onAiFeedback = vi.fn()
    render(
      <AnnotationThread
        rootAnnotation={makeAnnotation({ type: 'adversarial' })}
        onAiFeedback={onAiFeedback}
      />
    )

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '改进' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(onAiFeedback).toHaveBeenCalled()
    })
  })

  it('triggers AI feedback for score-warning type', async () => {
    const onAiFeedback = vi.fn()
    render(
      <AnnotationThread
        rootAnnotation={makeAnnotation({ type: 'score-warning' })}
        onAiFeedback={onAiFeedback}
      />
    )

    fireEvent.change(screen.getByTestId('reply-textarea'), {
      target: { value: '改进' },
    })
    fireEvent.click(screen.getByTestId('thread-send-btn'))

    await waitFor(() => {
      expect(onAiFeedback).toHaveBeenCalled()
    })
  })

  it('displays author and relative time for each reply', () => {
    mockReplies = [makeReply({ author: 'user:zhang-zong', createdAt: '2026-04-01T01:00:00Z' })]
    render(<AnnotationThread rootAnnotation={makeAnnotation()} />)

    expect(screen.getByText('user:zhang-zong')).toBeInTheDocument()
    expect(screen.getByText('相对时间(2026-04-01)')).toBeInTheDocument()
  })
})
