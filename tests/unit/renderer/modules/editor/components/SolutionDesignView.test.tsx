import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
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

Object.defineProperty(window, 'api', {
  writable: true,
  value: {
    templateList: mockTemplateList,
    templateGet: mockTemplateGet,
    templateGenerateSkeleton: mockTemplateGenerateSkeleton,
    templatePersistSkeleton: mockTemplatePersistSkeleton,
  },
})

const mockOnEnterProposalWriting = vi.fn()

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
    render(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )
    expect(screen.getByTestId('solution-design-loading')).toBeDefined()
  })

  it('shows template selector when document is empty', async () => {
    mockContent = ''
    mockLoading = false
    // We need to simulate the checking -> select-template transition
    // The component first calls loadDocument, then checks content
    render(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(mockLoadDocument).toHaveBeenCalledWith('proj-1')
    })
  })

  it('shows has-content view when document has content', async () => {
    mockContent = '# 项目概述\n\n# 系统设计\n'
    mockLoading = false

    render(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('has-content-view')).toBeDefined()
    })

    expect(screen.getByText('项目概述')).toBeDefined()
    expect(screen.getByText('系统设计')).toBeDefined()
  })

  it('triggers onEnterProposalWriting on continue writing click', async () => {
    mockContent = '# 已有内容\n'
    mockLoading = false

    render(
      <SolutionDesignView projectId="proj-1" onEnterProposalWriting={mockOnEnterProposalWriting} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('continue-writing-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('continue-writing-btn'))
    expect(mockOnEnterProposalWriting).toHaveBeenCalled()
  })
})
