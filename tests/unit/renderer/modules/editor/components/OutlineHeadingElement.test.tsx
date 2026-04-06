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
