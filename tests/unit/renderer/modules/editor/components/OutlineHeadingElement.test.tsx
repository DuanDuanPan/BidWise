import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ChapterHeadingElement } from '@modules/editor/components/OutlineHeadingElement'

let mockContent = ''
let mockEditorChildren: unknown[] = []
let mockChapterGen: Record<string, unknown> | null = null
let mockSourceAttr: Record<string, unknown> | null = null

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      content: mockContent,
    })
  ),
}))

vi.mock('@modules/editor/context/useChapterGenerationContext', () => ({
  useChapterGenerationContext: vi.fn(() => mockChapterGen),
}))

vi.mock('@modules/editor/context/useSourceAttributionContext', () => ({
  useSourceAttributionContext: vi.fn(() => mockSourceAttr),
}))

vi.mock('platejs/react', () => ({
  PlateElement: ({
    children,
    element: _element,
    editor: _editor,
    leaf: _leaf,
    text: _text,
    ...props
  }: Record<string, unknown>) => <div {...props}>{children}</div>,
  useEditorRef: vi.fn(() => ({
    children: mockEditorChildren,
  })),
}))

describe('@story-3-5 ChapterHeadingElement', () => {
  beforeEach(() => {
    mockContent = '## 系统架构设计\n\n正文段落\n'
    mockEditorChildren = []
    mockChapterGen = {
      statuses: new Map(),
      currentProjectId: 'proj-1',
    }
    mockSourceAttr = {
      sections: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 keeps the progress card visible while source attribution is running after generation status is cleared', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]
    mockSourceAttr = {
      sections: new Map([
        [
          '2:系统架构设计:0',
          {
            attributions: [],
            baselineValidations: [],
            attributionPhase: 'running',
            baselinePhase: 'idle',
          },
        ],
      ]),
    }

    render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    expect(screen.getByTestId('chapter-generation-progress')).toBeInTheDocument()
    expect(screen.getByText('来源标注分析中...')).toBeInTheDocument()
  })

  it('@p0 keeps the progress card visible while baseline validation is running after attribution completes', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]
    mockSourceAttr = {
      sections: new Map([
        [
          '2:系统架构设计:0',
          {
            attributions: [],
            baselineValidations: [],
            attributionPhase: 'completed',
            baselinePhase: 'running',
          },
        ],
      ]),
    }

    render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    expect(screen.getByTestId('chapter-generation-progress')).toBeInTheDocument()
    expect(screen.getByText('基线验证中...')).toBeInTheDocument()
  })
})

describe('@story-4-3 ChapterAwareHeading data attributes', () => {
  beforeEach(() => {
    mockContent = '## 系统架构设计\n\n正文段落\n'
    mockEditorChildren = []
    mockChapterGen = {
      statuses: new Map(),
      currentProjectId: 'proj-1',
    }
    mockSourceAttr = {
      sections: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 renders data-heading-level attribute', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-level')).toBe('2')
  })

  it('@p0 renders data-heading-occurrence attribute', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-occurrence')).toBe('0')
  })

  it('@p0 renders data-heading-locator-key with correct format', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-locator-key')).toBe('2:系统架构设计:0')
  })

  it('@p0 H1 heading now renders data-heading-locator-key (story-5-2 expanded H1 support)', () => {
    mockContent = '# 项目标题\n\n正文段落\n'

    const headingElement = {
      type: 'h1',
      children: [{ text: '项目标题' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>项目标题</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-locator-key')).toBe('1:项目标题:0')
  })
})

describe('@story-5-2 H1 locator data attributes', () => {
  beforeEach(() => {
    mockContent = '# 项目标题\n\n正文段落\n'
    mockEditorChildren = []
    mockChapterGen = {
      statuses: new Map(),
      currentProjectId: 'proj-1',
    }
    mockSourceAttr = {
      sections: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 H1 heading renders data-heading-level=1', () => {
    const headingElement = {
      type: 'h1',
      children: [{ text: '项目标题' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>项目标题</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-level')).toBe('1')
  })

  it('@p0 H1 heading renders data-heading-occurrence=0 for first occurrence', () => {
    const headingElement = {
      type: 'h1',
      children: [{ text: '项目标题' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>项目标题</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-occurrence')).toBe('0')
  })

  it('@p0 H1 heading renders data-heading-text with heading text', () => {
    const headingElement = {
      type: 'h1',
      children: [{ text: '项目标题' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>项目标题</span>
      </ChapterHeadingElement>
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-heading-text')).toBe('项目标题')
  })
})

describe('heading visual hierarchy classes', () => {
  beforeEach(() => {
    mockChapterGen = {
      statuses: new Map(),
      currentProjectId: 'proj-1',
    }
    mockSourceAttr = {
      sections: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders H1 headings with a chapter-card treatment', () => {
    mockContent = '# 项目概述\n\n正文段落\n'
    const headingElement = {
      type: 'h1',
      children: [{ text: '项目概述' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>项目概述</span>
      </ChapterHeadingElement>
    )

    const heading = container.firstElementChild?.firstElementChild as HTMLElement
    expect(heading.className).toContain('rounded-2xl')
    expect(heading.className).toContain('bg-[linear-gradient(90deg,_#F7FAFF_0%,_#FFFFFF_85%)]')
    expect(heading.className).toContain('text-[22px]')
  })

  it('renders H2 headings with a divider treatment', () => {
    mockContent = '## 系统架构设计\n\n正文段落\n'
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    const heading = container.firstElementChild?.firstElementChild as HTMLElement
    expect(heading.className).toContain('border-b')
    expect(heading.className).toContain('text-[18px]')
    expect(heading.className).toContain('text-[#16324F]')
  })

  it('renders H3 headings with a left-accent treatment', () => {
    mockContent = '### 材料库系统集成\n\n正文段落\n'
    const headingElement = {
      type: 'h3',
      children: [{ text: '材料库系统集成' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>材料库系统集成</span>
      </ChapterHeadingElement>
    )

    const heading = container.firstElementChild?.firstElementChild as HTMLElement
    expect(heading.className).toContain('border-l-2')
    expect(heading.className).toContain('pl-3')
    expect(heading.className).toContain('text-[15px]')
  })

  it('renders H4 headings with a compact label treatment', () => {
    mockContent = '#### 输入输出\n\n正文段落\n'
    const headingElement = {
      type: 'h4',
      children: [{ text: '输入输出' }],
    }

    mockEditorChildren = [headingElement]

    const { container } = render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>输入输出</span>
      </ChapterHeadingElement>
    )

    const heading = container.firstElementChild?.firstElementChild as HTMLElement
    expect(heading.className).toContain('tracking-[0.02em]')
    expect(heading.className).toContain('text-[14px]')
    expect(heading.className).toContain('text-[#4A5B71]')
  })
})

describe('@story-3-11 batch failure UI switching', () => {
  beforeEach(() => {
    mockContent = '## 系统架构设计\n\n正文段落\n'
    mockEditorChildren = []
    mockSourceAttr = {
      sections: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 shows InlineErrorBar when batch-generating phase has error', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }
    mockEditorChildren = [headingElement]

    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
            phase: 'batch-generating',
            progress: 30,
            taskId: 'task-1',
            operationType: 'batch-generate',
            error: 'LLM timeout',
            batchSections: [
              { index: 0, title: '功能设计', level: 3, phase: 'failed', error: 'LLM timeout' },
              { index: 1, title: '接口设计', level: 3, phase: 'pending' },
            ],
          },
        ],
      ]),
      currentProjectId: 'proj-1',
    }

    render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    expect(screen.getByTestId('chapter-error-bar')).toBeInTheDocument()
    expect(screen.getByTestId('chapter-retry-btn')).toBeInTheDocument()
    expect(screen.getByTestId('chapter-skip-btn')).toBeInTheDocument()
  })

  it('@p0 does not show error bar during batch-generating without error', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }
    mockEditorChildren = [headingElement]

    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
            phase: 'batch-generating',
            progress: 50,
            taskId: 'task-1',
            operationType: 'batch-generate',
            message: '正在生成子章节 2/3',
          },
        ],
      ]),
      currentProjectId: 'proj-1',
    }

    render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    // No error bar when no error
    expect(screen.queryByTestId('chapter-error-bar')).not.toBeInTheDocument()
  })

  it('@p0 shows InlineErrorBar for standard failed phase', () => {
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }
    mockEditorChildren = [headingElement]

    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
            phase: 'failed',
            progress: 0,
            taskId: 'task-1',
            error: '生成失败',
          },
        ],
      ]),
      currentProjectId: 'proj-1',
    }

    render(
      <ChapterHeadingElement element={headingElement as never}>
        <span>系统架构设计</span>
      </ChapterHeadingElement>
    )

    expect(screen.getByTestId('chapter-error-bar')).toBeInTheDocument()
  })
})
