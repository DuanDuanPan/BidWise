import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SourceAwareParagraph } from '@modules/editor/components/SourceAwareParagraph'
import { createContentDigest } from '@shared/chapter-markdown'

let mockEditorChildren: unknown[] = []
let mockNodePath: number[] = [0]
let mockSourceAttr: Record<string, unknown> | null = null

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
  useNodePath: vi.fn(() => mockNodePath),
}))

describe('@story-3-5 SourceAwareParagraph', () => {
  beforeEach(() => {
    mockEditorChildren = []
    mockNodePath = [0]
    mockSourceAttr = {
      paragraphLookup: new Map(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('@p0 resolves repeated paragraph text by section paragraph index rather than global digest', () => {
    const repeatedText = '重复段落'
    const headingElement = {
      type: 'h2',
      children: [{ text: '系统架构设计' }],
    }
    const firstParagraph = {
      type: 'p',
      children: [{ text: repeatedText }],
    }
    const secondParagraph = {
      type: 'p',
      children: [{ text: repeatedText }],
    }

    mockEditorChildren = [headingElement, firstParagraph, secondParagraph]
    mockSourceAttr = {
      paragraphLookup: new Map([
        [
          '2:系统架构设计:0:0',
          {
            attribution: {
              id: 'attr-0',
              sectionLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
              paragraphIndex: 0,
              paragraphDigest: createContentDigest(repeatedText),
              sourceType: 'asset-library',
              confidence: 0.9,
            },
            validation: null,
            isEdited: false,
          },
        ],
        [
          '2:系统架构设计:0:1',
          {
            attribution: {
              id: 'attr-1',
              sectionLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
              paragraphIndex: 1,
              paragraphDigest: createContentDigest(repeatedText),
              sourceType: 'knowledge-base',
              confidence: 0.9,
            },
            validation: null,
            isEdited: false,
          },
        ],
      ]),
    }

    const { rerender } = render(
      <SourceAwareParagraph element={firstParagraph as never}>
        <span>{repeatedText}</span>
      </SourceAwareParagraph>
    )

    expect(screen.getByTestId('source-attribution-label')).toHaveAttribute(
      'data-source-type',
      'asset-library'
    )

    mockNodePath = [2]

    rerender(
      <SourceAwareParagraph element={secondParagraph as never}>
        <span>{repeatedText}</span>
      </SourceAwareParagraph>
    )

    expect(screen.getByTestId('source-attribution-label')).toHaveAttribute(
      'data-source-type',
      'knowledge-base'
    )
  })
})
