import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { TemplateSelector } from '@modules/editor/components/TemplateSelector'
import type { TemplateSummary, ProposalTemplate } from '@shared/template-types'

const mockTemplates: TemplateSummary[] = [
  {
    id: 'standard-technical',
    name: '标准技术方案模板',
    description: '适用于一般 IT 项目',
    sectionCount: 8,
    source: 'built-in',
  },
  {
    id: 'standard-military',
    name: '军工/政务模板',
    description: '适用于军工项目',
    sectionCount: 10,
    source: 'company',
  },
]

const mockPreviewTemplate: ProposalTemplate = {
  id: 'standard-technical',
  name: '标准技术方案模板',
  description: '适用于一般 IT 项目',
  version: '1.0',
  source: 'built-in',
  sections: [
    { id: 's1', title: '项目概述', level: 1, children: [] },
    { id: 's2', title: '需求分析', level: 1, children: [] },
  ],
}

describe('@story-3-3 TemplateSelector', () => {
  const defaultProps = {
    templates: mockTemplates,
    loading: false,
    selectedId: null,
    previewTemplate: null,
    previewLoading: false,
    generating: false,
    onSelect: vi.fn(),
    onGenerate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders template card list', () => {
    render(<TemplateSelector {...defaultProps} />)
    expect(screen.getByTestId('template-card-standard-technical')).toBeDefined()
    expect(screen.getByTestId('template-card-standard-military')).toBeDefined()
  })

  it('shows loading spinner when loading', () => {
    render(<TemplateSelector {...defaultProps} loading={true} />)
    expect(screen.getByTestId('template-loading')).toBeDefined()
  })

  it('shows empty state when no templates', () => {
    render(<TemplateSelector {...defaultProps} templates={[]} />)
    expect(screen.getByTestId('template-empty')).toBeDefined()
  })

  it('triggers onSelect when card is clicked', () => {
    render(<TemplateSelector {...defaultProps} />)
    fireEvent.click(screen.getByTestId('template-card-standard-technical'))
    expect(defaultProps.onSelect).toHaveBeenCalledWith('standard-technical')
  })

  it('shows preview placeholder when no template selected', () => {
    render(<TemplateSelector {...defaultProps} />)
    expect(screen.getByText('选择模板后可预览章节结构')).toBeDefined()
  })

  it('shows template structure preview when template selected', () => {
    render(
      <TemplateSelector
        {...defaultProps}
        selectedId="standard-technical"
        previewTemplate={mockPreviewTemplate}
      />
    )
    expect(screen.getByText('项目概述')).toBeDefined()
    expect(screen.getByText('需求分析')).toBeDefined()
  })

  it('disables generate button when no template selected', () => {
    render(<TemplateSelector {...defaultProps} />)
    const btn = screen.getByTestId('generate-skeleton-btn')
    expect(btn).toHaveProperty('disabled', true)
  })

  it('enables generate button when template selected', () => {
    render(<TemplateSelector {...defaultProps} selectedId="standard-technical" />)
    const btn = screen.getByTestId('generate-skeleton-btn')
    expect(btn).toHaveProperty('disabled', false)
  })

  it('triggers onGenerate when generate button clicked', () => {
    render(<TemplateSelector {...defaultProps} selectedId="standard-technical" />)
    fireEvent.click(screen.getByTestId('generate-skeleton-btn'))
    expect(defaultProps.onGenerate).toHaveBeenCalled()
  })

  it('displays source tags correctly', () => {
    render(<TemplateSelector {...defaultProps} />)
    expect(screen.getByText('内置')).toBeDefined()
    expect(screen.getByText('公司')).toBeDefined()
  })

  it('displays section count', () => {
    render(<TemplateSelector {...defaultProps} />)
    expect(screen.getByText('8 个章节')).toBeDefined()
    expect(screen.getByText('10 个章节')).toBeDefined()
  })
})
