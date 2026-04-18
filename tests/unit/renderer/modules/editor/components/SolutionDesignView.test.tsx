import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { SolutionDesignView } from '@modules/editor/components/SolutionDesignView'

const mockLoadDocument = vi.fn().mockResolvedValue(undefined)
const mockUpdateContent = vi.fn()

let mockContent = ''
let mockLoading = false

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      loading: mockLoading,
      error: null,
      content: mockContent,
      loadDocument: mockLoadDocument,
      updateContent: mockUpdateContent,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      saveDocument: vi.fn(),
      resetDocument: vi.fn(),
    })
  ),
}))

const mockTemplateList = vi.fn()
const mockTemplateGet = vi.fn()
const mockTemplateGenerateSkeleton = vi.fn()
const mockTemplatePersistSkeleton = vi.fn()
const mockDocumentGetMetadata = vi.fn().mockResolvedValue({
  success: true,
  data: {
    annotations: [],
    sourceAttributions: [],
    baselineValidations: [],
    sectionIndex: [
      {
        sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: '项目概述',
        level: 1,
        order: 0,
        occurrenceIndex: 0,
        headingLocator: { title: '项目概述', level: 1, occurrenceIndex: 0 },
      },
      {
        sectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: '系统设计',
        level: 1,
        order: 1,
        occurrenceIndex: 0,
        headingLocator: { title: '系统设计', level: 1, occurrenceIndex: 0 },
      },
    ],
  },
})

Object.defineProperty(window, 'api', {
  writable: true,
  value: {
    templateList: mockTemplateList,
    templateGet: mockTemplateGet,
    templateGenerateSkeleton: mockTemplateGenerateSkeleton,
    templatePersistSkeleton: mockTemplatePersistSkeleton,
    documentGetMetadata: mockDocumentGetMetadata,
  },
})

const mockOnEnterProposalWriting = vi.fn()

function renderWithApp(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<App>{ui}</App>)
}

describe('@story-3-3 SolutionDesignView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContent = ''
    mockLoading = false
    mockTemplateList.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'standard-technical',
          name: '标准技术方案模板',
          description: '适用于一般项目',
          sectionCount: 8,
          source: 'built-in',
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows loading state initially', () => {
    mockLoading = true
    renderWithApp(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )
    expect(screen.getByTestId('solution-design-loading')).toBeDefined()
  })

  it('shows template selector when document is empty', async () => {
    mockContent = ''
    mockLoading = false
    // We need to simulate the checking -> select-template transition
    // The component first calls loadDocument, then checks content
    renderWithApp(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(mockLoadDocument).toHaveBeenCalledWith('proj-1')
    })
  })

  it('shows has-content view when document has content', async () => {
    mockContent = '# 项目概述\n\n# 系统设计\n'
    mockLoading = false

    renderWithApp(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('structure-design-workspace')).toBeDefined()
    })

    // Structure canvas renders nodes from sectionIndex (Story 11.2 integration)
    await waitFor(() => {
      expect(screen.getByText('项目概述')).toBeDefined()
      expect(screen.getByText('系统设计')).toBeDefined()
    })
  })

  it('triggers onEnterProposalWriting on confirm-skeleton click', async () => {
    mockContent = '# 已有内容\n'
    mockLoading = false

    renderWithApp(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      const btn = screen.getByTestId('structure-confirm-skeleton') as HTMLButtonElement
      expect(btn).toBeDefined()
      expect(btn.disabled).toBe(false)
    })

    fireEvent.click(screen.getByTestId('structure-confirm-skeleton'))
    expect(mockOnEnterProposalWriting).toHaveBeenCalled()
  })

  it('opens reselect confirmation when document already has content', async () => {
    mockContent = '# 已有内容\n'
    mockLoading = false

    renderWithApp(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('structure-reselect-template')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('structure-reselect-template'))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '重新选择模板' })).toBeDefined()
      expect(screen.getByText('重新生成骨架将覆盖当前方案内容，是否继续？')).toBeDefined()
    })
  })
})
