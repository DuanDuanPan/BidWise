import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { WritingStyleSelector } from '@modules/editor/components/WritingStyleSelector'

const mockWritingStyleList = vi.fn()
const mockDocumentGetMetadata = vi.fn()
const mockWritingStyleUpdateProject = vi.fn()
const mockMessageInfo = vi.fn()

// Attach mock api to window without replacing the entire window object
Object.defineProperty(window, 'api', {
  value: {
    writingStyleList: (...args: unknown[]) => mockWritingStyleList(...args),
    documentGetMetadata: (...args: unknown[]) => mockDocumentGetMetadata(...args),
    writingStyleUpdateProject: (...args: unknown[]) => mockWritingStyleUpdateProject(...args),
  },
  writable: true,
  configurable: true,
})

const mockMessageError = vi.fn()

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd')
  return {
    ...actual,
    message: {
      info: (...args: unknown[]) => mockMessageInfo(...args),
      error: (...args: unknown[]) => mockMessageError(...args),
    },
  }
})

const MOCK_STYLES = [
  {
    id: 'general',
    name: '通用文风',
    description: '通用文风描述',
    source: 'built-in',
  },
  {
    id: 'military',
    name: '军工文风',
    description: '军工文风描述',
    source: 'built-in',
  },
  {
    id: 'government',
    name: '政企文风',
    description: '政企文风描述',
    source: 'built-in',
  },
]

describe('@story-3-6 WritingStyleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWritingStyleList.mockResolvedValue({
      success: true,
      data: { styles: MOCK_STYLES },
    })
    mockDocumentGetMetadata.mockResolvedValue({
      success: true,
      data: { writingStyleId: 'general' },
    })
    mockWritingStyleUpdateProject.mockResolvedValue({
      success: true,
      data: { writingStyleId: 'military' },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 should render with default general style selected', async () => {
    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })
  })

  it('@p0 should load styles and metadata on mount', async () => {
    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(mockWritingStyleList).toHaveBeenCalledTimes(1)
      expect(mockDocumentGetMetadata).toHaveBeenCalledWith({ projectId: 'proj-1' })
    })
  })

  it('@p1 should show metadata writingStyleId as initial value', async () => {
    mockDocumentGetMetadata.mockResolvedValue({
      success: true,
      data: { writingStyleId: 'military' },
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('军工文风')).toBeInTheDocument()
    })
  })

  it('@p1 should fallback to general when metadata writingStyleId is invalid', async () => {
    mockDocumentGetMetadata.mockResolvedValue({
      success: true,
      data: { writingStyleId: 'deleted-style' },
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })
  })

  it('@p1 should fallback to general when metadata has no writingStyleId', async () => {
    mockDocumentGetMetadata.mockResolvedValue({
      success: true,
      data: {},
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })
  })

  it('@p0 should call updateProject when style is changed', async () => {
    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })

    // Open the select dropdown
    const select = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.mouseDown(select)
    })

    // Click on military style option
    const option = await screen.findByText('军工文风')
    await act(async () => {
      fireEvent.click(option)
    })

    await waitFor(() => {
      expect(mockWritingStyleUpdateProject).toHaveBeenCalledWith({
        projectId: 'proj-1',
        writingStyleId: 'military',
      })
    })
  })

  it('@p1 should revert selection and show error on failed style change', async () => {
    mockWritingStyleUpdateProject.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'DB write failed' },
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.mouseDown(select)
    })

    const option = await screen.findByText('军工文风')
    await act(async () => {
      fireEvent.click(option)
    })

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('文风切换失败，请重试')
    })

    // Should revert to general — check the selection item specifically
    await waitFor(() => {
      const selectionItem = document.querySelector('.ant-select-selection-item')
      expect(selectionItem?.textContent).toBe('通用文风')
    })
  })

  it('@p1 should fallback to general when style list fails', async () => {
    mockWritingStyleList.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'Service unavailable' },
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })
  })

  it('@p1 should render company styles with 自定义 tag and divider', async () => {
    mockWritingStyleList.mockResolvedValue({
      success: true,
      data: {
        styles: [
          ...MOCK_STYLES,
          {
            id: 'custom-1',
            name: '行业文风',
            description: '行业文风描述',
            source: 'company',
          },
        ],
      },
    })

    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.mouseDown(select)
    })

    await waitFor(() => {
      expect(screen.getByText('行业文风')).toBeInTheDocument()
      expect(screen.getByText('自定义')).toBeInTheDocument()
    })
  })

  it('@p1 should have aria-label for accessibility', async () => {
    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', '选择写作风格')
  })

  it('@p1 should show info message after successful style change', async () => {
    render(<WritingStyleSelector projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText('通用文风')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    await act(async () => {
      fireEvent.mouseDown(select)
    })

    const option = await screen.findByText('军工文风')
    await act(async () => {
      fireEvent.click(option)
    })

    await waitFor(() => {
      expect(mockMessageInfo).toHaveBeenCalledWith('新文风将在下次生成章节时生效')
    })
  })
})
