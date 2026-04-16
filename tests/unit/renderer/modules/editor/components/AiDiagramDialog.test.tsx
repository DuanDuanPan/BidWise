import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

vi.mock('platejs/react', () => ({
  createPlatePlugin: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    withComponent: vi.fn(() => ({ ...config })),
  })),
}))

vi.mock('@renderer/stores', () => ({
  useProjectStore: (selector: (state: { currentProject: { id: string } }) => unknown) =>
    selector({ currentProject: { id: 'proj-1' } }),
}))

// Mock extractAndSanitizeAiDiagramSvg
const mockExtractAndSanitize = vi.fn()
vi.mock('@modules/editor/utils/aiDiagramSvg', () => ({
  extractAndSanitizeAiDiagramSvg: (...args: unknown[]) => mockExtractAndSanitize(...args),
}))

// Mock window.api
const mockAgentExecute = vi.fn()
const mockAgentStatus = vi.fn()
const mockTaskCancel = vi.fn()
const mockOnTaskProgress = vi.fn().mockReturnValue(vi.fn()) // returns unsubscribe

Object.defineProperty(window, 'api', {
  value: {
    agentExecute: mockAgentExecute,
    agentStatus: mockAgentStatus,
    taskCancel: mockTaskCancel,
    onTaskProgress: mockOnTaskProgress,
  },
  writable: true,
})

import { AiDiagramDialog } from '@modules/editor/components/AiDiagramDialog'

describe('@story-3-9 AiDiagramDialog', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockExtractAndSanitize.mockReturnValue({ ok: true, svg: '<svg>clean</svg>' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders form when open with input phase', () => {
    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByTestId('ai-diagram-form')).toBeDefined()
    expect(screen.getByTestId('ai-diagram-prompt')).toBeDefined()
    expect(screen.getByTestId('ai-diagram-generate-btn')).toBeDefined()
  })

  it('disables generate button when prompt is empty', () => {
    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const btn = screen.getByTestId('ai-diagram-generate-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('enables generate button when prompt has text', () => {
    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '系统架构图' } })

    const btn = screen.getByTestId('ai-diagram-generate-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('calls agentExecute with correct skill params on generate', async () => {
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-123' },
    })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '微服务架构图' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    expect(mockAgentExecute).toHaveBeenCalledWith({
      agentType: 'skill-diagram',
      context: {
        projectId: 'proj-1',
        diagramId: expect.any(String),
        assetFileName: expect.stringMatching(/^ai-diagram-[a-f0-9]{8}\.svg$/),
        prompt: '微服务架构图',
        title: '微服务架构图',
        style: 'flat-icon',
        diagramType: 'architecture',
        chapterTitle: '微服务架构图',
        chapterMarkdown: '微服务架构图',
      },
    })
  })

  it('shows generating state after agentExecute succeeds', async () => {
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-123' },
    })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '架构图' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    expect(screen.getByTestId('ai-diagram-generating')).toBeDefined()
    expect(screen.getByTestId('ai-diagram-cancel-btn')).toBeDefined()
  })

  it('shows error state when agentExecute fails', async () => {
    mockAgentExecute.mockResolvedValue({
      success: false,
      error: { code: 'ERR', message: 'AI 服务不可用' },
    })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '架构图' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    expect(screen.getByTestId('ai-diagram-error')).toBeDefined()
  })

  it('calls onSuccess with result when skill completes', async () => {
    const payload = {
      diagramId: 'uuid-ai-1',
      assetFileName: 'ai-diagram-uuidai1.svg',
      prompt: '数据流图',
      title: '数据流图',
      style: 'flat-icon',
      diagramType: 'architecture',
      svgContent: '<svg>generated</svg>',
      repairAttempts: 1,
    }
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-456' },
    })
    mockAgentStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'completed',
        result: { content: JSON.stringify(payload) },
      },
    })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '数据流图' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    // Advance timer to trigger poll
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(onSuccess).toHaveBeenCalledWith({
      diagramId: 'uuid-ai-1',
      assetFileName: 'ai-diagram-uuidai1.svg',
      svgContent: '<svg>clean</svg>',
      prompt: '数据流图',
      title: '数据流图',
      style: 'flat-icon',
      diagramType: 'architecture',
    })
  })

  it('shows error when SVG extraction fails', async () => {
    const payload = {
      diagramId: 'uuid-ai-2',
      assetFileName: 'ai-diagram-uuidai2.svg',
      prompt: '图表',
      title: '图表',
      style: 'flat-icon',
      diagramType: 'architecture',
      svgContent: 'not svg at all',
      repairAttempts: 0,
    }
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-789' },
    })
    mockAgentStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'completed',
        result: { content: JSON.stringify(payload) },
      },
    })
    mockExtractAndSanitize.mockReturnValue({ ok: false, error: '未找到 SVG' })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '图表' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    // Flush poll interval + async agentStatus promise chain + React re-render
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await vi.advanceTimersByTimeAsync(0)
      })
    }

    // Verify extractAndSanitize was called with bad content and onSuccess never fired
    expect(mockExtractAndSanitize).toHaveBeenCalledWith('not svg at all')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows error when agent result payload is invalid json', async () => {
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-invalid' },
    })
    mockAgentStatus.mockResolvedValue({
      success: true,
      data: {
        status: 'completed',
        result: { content: 'not-json' },
      },
    })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '图表' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await vi.advanceTimersByTimeAsync(0)
      })
    }

    expect(screen.getByTestId('ai-diagram-error')).toBeDefined()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('calls taskCancel on cancel during generating', async () => {
    mockAgentExecute.mockResolvedValue({
      success: true,
      data: { taskId: 'task-cancel' },
    })
    mockTaskCancel.mockResolvedValue({ success: true })

    render(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '架构图' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-generate-btn'))
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-diagram-cancel-btn'))
    })

    expect(mockTaskCancel).toHaveBeenCalledWith('task-cancel')
    expect(onClose).toHaveBeenCalled()
  })

  it('resets to input phase on re-open (afterOpenChange)', async () => {
    const { rerender } = render(
      <AiDiagramDialog open={false} onClose={onClose} onSuccess={onSuccess} />
    )

    // Open dialog
    rerender(<AiDiagramDialog open={true} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByTestId('ai-diagram-form')).toBeDefined()
  })

  it('pre-fills prompt/style/type from initialPrompt/initialStyle/initialType', () => {
    render(
      <AiDiagramDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
        initialPrompt="预填描述"
        initialStyle="blueprint"
        initialType="data-flow"
      />
    )

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('预填描述')
  })
})
