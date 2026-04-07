import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

// Hoist mocks
const {
  mockCreateAnnotation,
  mockMessageError,
  mockAgentExecute,
  mockAgentStatus,
  mockOnTaskProgress,
} = vi.hoisted(() => ({
  mockCreateAnnotation: vi.fn().mockResolvedValue(true),
  mockMessageError: vi.fn(),
  mockAgentExecute: vi.fn(),
  mockAgentStatus: vi.fn(),
  mockOnTaskProgress: vi.fn().mockReturnValue(() => {}),
}))

vi.mock('@renderer/stores/annotationStore', () => ({
  useAnnotationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ createAnnotation: mockCreateAnnotation })
  ),
}))

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ content: '# Test Document\n\nSome content here' })
  ),
}))

vi.mock('@shared/chapter-markdown', () => ({
  extractMarkdownSectionContent: vi.fn().mockReturnValue('Extracted section content for testing'),
}))

vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type: btnType,
    icon,
    block,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: string
    icon?: React.ReactNode
    block?: boolean
    'data-testid'?: string
  }) => (
    <button
      data-testid={testId}
      data-btn-type={btnType}
      data-block={block ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ),
  Input: Object.assign(
    {},
    {
      TextArea: ({
        value,
        onChange,
        placeholder,
        'data-testid': testId,
      }: {
        value?: string
        onChange?: (e: { target: { value: string } }) => void
        placeholder?: string
        autoSize?: { minRows: number; maxRows: number }
        'data-testid'?: string
      }) => (
        <textarea
          data-testid={testId}
          value={value}
          onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
          placeholder={placeholder}
        />
      ),
    }
  ),
  Tooltip: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-tooltip={title}>{children}</div>
  ),
  message: { error: mockMessageError },
}))

vi.mock('@ant-design/icons', () => ({
  QuestionCircleOutlined: () => <span data-testid="icon-question" />,
  SendOutlined: () => <span data-testid="icon-send" />,
  CloseOutlined: () => <span data-testid="icon-close" />,
  LoadingOutlined: () => <span data-testid="icon-loading" />,
}))

import { AskSystemDialog } from '@renderer/modules/annotation/components/AskSystemDialog'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const TEST_PROJECT_ID = 'proj-test-1'

const TEST_SECTION = {
  locator: {
    title: '技术方案',
    level: 2 as const,
    occurrenceIndex: 0,
  } satisfies ChapterHeadingLocator,
  sectionKey: '2:技术方案:0',
  label: '技术方案',
}

function setupWindowApi(): void {
  vi.stubGlobal('api', {
    agentExecute: mockAgentExecute,
    agentStatus: mockAgentStatus,
    onTaskProgress: mockOnTaskProgress,
  })
  // Ensure window.api is also set (component accesses window.api)
  Object.defineProperty(window, 'api', {
    value: {
      agentExecute: mockAgentExecute,
      agentStatus: mockAgentStatus,
      onTaskProgress: mockOnTaskProgress,
    },
    writable: true,
    configurable: true,
  })
}

describe('@story-4-3 AskSystemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupWindowApi()
  })

  afterEach(cleanup)

  // ── Test 1: Disabled button when currentSection is null ──

  it('renders disabled button when currentSection is null', () => {
    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={null} />)

    const button = screen.getByTestId('ask-system-button')
    expect(button).toBeInTheDocument()
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('向系统提问')

    // Tooltip should show disabled hint
    const tooltip = button.closest('[data-tooltip]')
    expect(tooltip).toHaveAttribute('data-tooltip', '进入具体章节后可向系统提问')
  })

  // ── Test 2: Enabled button when currentSection is provided ──

  it('renders enabled button when currentSection is provided', () => {
    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={TEST_SECTION} />)

    const button = screen.getByTestId('ask-system-button')
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
    expect(button).toHaveTextContent('向系统提问')

    // Tooltip should show normal hint
    const tooltip = button.closest('[data-tooltip]')
    expect(tooltip).toHaveAttribute('data-tooltip', '向系统提问')
  })

  // ── Test 3: Opens input area on button click ──

  it('opens input area on button click', () => {
    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={TEST_SECTION} />)

    // Initially in idle phase: trigger area visible, dialog not
    expect(screen.getByTestId('ask-system-trigger')).toBeInTheDocument()
    expect(screen.queryByTestId('ask-system-dialog')).toBeNull()

    // Click the button
    fireEvent.click(screen.getByTestId('ask-system-button'))

    // Now dialog area should be visible with input and submit
    expect(screen.getByTestId('ask-system-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('ask-system-input')).toBeInTheDocument()
    expect(screen.getByTestId('ask-system-submit')).toBeInTheDocument()

    // Trigger should no longer be visible (phase switched from idle)
    expect(screen.queryByTestId('ask-system-trigger')).toBeNull()
  })

  // ── Test 4: Closes dialog on close button click ──

  it('closes dialog on close button click', () => {
    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={TEST_SECTION} />)

    // Open the dialog
    fireEvent.click(screen.getByTestId('ask-system-button'))
    expect(screen.getByTestId('ask-system-dialog')).toBeInTheDocument()

    // Click the close button
    fireEvent.click(screen.getByTestId('ask-system-close'))

    // Should return to idle phase (trigger visible, dialog gone)
    expect(screen.getByTestId('ask-system-trigger')).toBeInTheDocument()
    expect(screen.queryByTestId('ask-system-dialog')).toBeNull()
  })

  // ── Test 5: Submit button disabled when question is empty ──

  it('submit button disabled when question is empty', () => {
    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={TEST_SECTION} />)

    // Open dialog
    fireEvent.click(screen.getByTestId('ask-system-button'))

    // Submit should be disabled with empty input
    const submitBtn = screen.getByTestId('ask-system-submit')
    expect(submitBtn).toBeDisabled()

    // Type something
    fireEvent.change(screen.getByTestId('ask-system-input'), {
      target: { value: '如何提升安全性?' },
    })

    // Submit should be enabled
    expect(submitBtn).not.toBeDisabled()

    // Clear text back to whitespace only
    fireEvent.change(screen.getByTestId('ask-system-input'), {
      target: { value: '   ' },
    })

    // Submit should be disabled again (whitespace-only)
    expect(submitBtn).toBeDisabled()
  })

  // ── Test 6: Submit calls agentExecute with correct context ──

  it('submit calls agentExecute with correct context (mode: ask-system)', async () => {
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-ask-1' },
    })
    mockAgentStatus.mockResolvedValue({
      success: true,
      data: { status: 'running' },
    })

    render(<AskSystemDialog projectId={TEST_PROJECT_ID} currentSection={TEST_SECTION} />)

    // Open dialog
    fireEvent.click(screen.getByTestId('ask-system-button'))

    // Type a question
    fireEvent.change(screen.getByTestId('ask-system-input'), {
      target: { value: '本章节需要补充哪些安全措施?' },
    })

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-system-submit'))
    })

    await waitFor(() => {
      expect(mockAgentExecute).toHaveBeenCalledTimes(1)
      expect(mockAgentExecute).toHaveBeenCalledWith({
        agentType: 'generate',
        context: {
          mode: 'ask-system',
          chapterTitle: '技术方案',
          chapterLevel: 2,
          sectionContent: 'Extracted section content for testing',
          userQuestion: '本章节需要补充哪些安全措施?',
        },
      })
    })

    // Should also register onTaskProgress listener
    expect(mockOnTaskProgress).toHaveBeenCalledTimes(1)
  })
})
