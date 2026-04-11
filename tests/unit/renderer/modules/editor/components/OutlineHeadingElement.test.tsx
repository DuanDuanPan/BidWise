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
