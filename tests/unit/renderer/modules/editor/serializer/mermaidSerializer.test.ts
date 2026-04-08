import { describe, it, expect, vi } from 'vitest'
import { MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'

vi.mock('platejs/react', () => ({
  createPlatePlugin: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    withComponent: vi.fn(() => ({ ...config })),
  })),
}))

import { serializeToMarkdown, deserializeFromMarkdown } from '@modules/editor/serializer'

type MockEditor = {
  children: unknown[]
  api: {
    markdown: { serialize: ReturnType<typeof vi.fn>; deserialize: ReturnType<typeof vi.fn> }
  }
}

function createMockEditor(children: unknown[] = []): MockEditor {
  const editor = {
    children,
    api: {
      markdown: {
        serialize: vi.fn(),
        deserialize: vi.fn((md: string) =>
          md.split('\n').map((line: string) => ({
            type: 'p',
            children: [{ text: line }],
          }))
        ),
      },
    },
  }
  editor.api.markdown.serialize.mockImplementation(() => {
    return (editor.children as Array<Record<string, unknown>>)
      .map((node) => {
        if (node.type === 'p') {
          const c = (node.children as Array<Record<string, unknown>>)[0]
          return c?.text as string
        }
        return ''
      })
      .join('\n')
  })
  return editor
}

describe('@story-3-8 mermaid serialization', () => {
  describe('serializeToMarkdown', () => {
    it('serializes mermaid void elements as HTML comment + fenced code block', () => {
      const editor = createMockEditor([
        { type: 'p', children: [{ text: 'Before' }] },
        {
          type: MERMAID_ELEMENT_TYPE,
          diagramId: 'uuid-1',
          assetFileName: 'mermaid-abc123.svg',
          source: 'graph TD\n  A[开始] --> B[结束]',
          caption: '',
          children: [{ text: '' }],
        },
        { type: 'p', children: [{ text: 'After' }] },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain('<!-- mermaid:uuid-1:mermaid-abc123.svg: -->')
      expect(result).toContain('```mermaid')
      expect(result).toContain('graph TD\n  A[开始] --> B[结束]')
      expect(result).toContain('```')
    })

    it('serializes caption via URL-encoding in the comment', () => {
      const editor = createMockEditor([
        {
          type: MERMAID_ELEMENT_TYPE,
          diagramId: 'uuid-cap',
          assetFileName: 'mermaid-cap.svg',
          source: 'graph TD\n  A-->B',
          caption: '系统架构图',
          children: [{ text: '' }],
        },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain(
        `<!-- mermaid:uuid-cap:mermaid-cap.svg:${encodeURIComponent('系统架构图')} -->`
      )
    })

    it('delegates to default serializer when no special blocks exist', () => {
      const editor = createMockEditor([{ type: 'p', children: [{ text: 'Hello' }] }])

      const result = serializeToMarkdown(editor)

      expect(result).toBe('Hello')
      expect(editor.api.markdown.serialize).toHaveBeenCalledTimes(1)
    })

    it('handles multiple mermaid blocks', () => {
      const editor = createMockEditor([
        {
          type: MERMAID_ELEMENT_TYPE,
          diagramId: 'id-1',
          assetFileName: 'mermaid-aaa.svg',
          source: 'graph TD\n  A-->B',
          caption: '',
          children: [{ text: '' }],
        },
        {
          type: MERMAID_ELEMENT_TYPE,
          diagramId: 'id-2',
          assetFileName: 'mermaid-bbb.svg',
          source: 'sequenceDiagram\n  A->>B: Hello',
          caption: '',
          children: [{ text: '' }],
        },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain('<!-- mermaid:id-1:mermaid-aaa.svg: -->')
      expect(result).toContain('<!-- mermaid:id-2:mermaid-bbb.svg: -->')
      expect(result).toContain('graph TD\n  A-->B')
      expect(result).toContain('sequenceDiagram\n  A->>B: Hello')
    })

    it('restores original children after serialization', () => {
      const original = [
        {
          type: MERMAID_ELEMENT_TYPE,
          diagramId: 'id-1',
          assetFileName: 'mermaid-x.svg',
          source: 'graph TD\n  X-->Y',
          caption: '',
          children: [{ text: '' }],
        },
      ]
      const editor = createMockEditor(original)

      serializeToMarkdown(editor)

      expect(editor.children).toBe(original)
    })
  })

  describe('deserializeFromMarkdown', () => {
    it('restores mermaid void elements from HTML comment + fenced code block', () => {
      const editor = createMockEditor()
      const markdown = [
        '# Title',
        '',
        '<!-- mermaid:uuid-1:mermaid-abc123.svg -->',
        '```mermaid',
        'graph TD',
        '  A[开始] --> B[结束]',
        '```',
        '',
        'Some text',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      ) as Record<string, unknown> | undefined
      expect(mermaidNode).toBeDefined()
      expect(mermaidNode!.diagramId).toBe('uuid-1')
      expect(mermaidNode!.assetFileName).toBe('mermaid-abc123.svg')
      expect(mermaidNode!.source).toBe('graph TD\n  A[开始] --> B[结束]')
      expect(mermaidNode!.caption).toBe('')
    })

    it('handles bare mermaid fenced code blocks (import scenario)', () => {
      const editor = createMockEditor()
      const markdown = ['```mermaid', 'graph LR', '  A-->B', '```'].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      ) as Record<string, unknown> | undefined
      expect(mermaidNode).toBeDefined()
      expect(mermaidNode!.source).toBe('graph LR\n  A-->B')
      // Auto-generated IDs
      expect(mermaidNode!.diagramId).toBeDefined()
      expect(typeof mermaidNode!.diagramId).toBe('string')
      expect(mermaidNode!.assetFileName).toMatch(/^mermaid-[a-z0-9]+\.svg$/)
    })

    it('leaves normal code blocks untouched', () => {
      const editor = createMockEditor()
      const markdown = ['```typescript', 'const x = 1', '```'].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      )
      expect(mermaidNode).toBeUndefined()
    })

    it('delegates to default deserializer when no mermaid patterns found', () => {
      const editor = createMockEditor()
      const markdown = '# Just a heading'

      deserializeFromMarkdown(editor, markdown)

      expect(editor.api.markdown.deserialize).toHaveBeenCalledWith('# Just a heading')
    })

    it('round-trips mermaid elements through serialize→deserialize', () => {
      const sourceCode = 'graph TD\n  A-->B\n  B-->C'
      const serialized = [
        '<!-- mermaid:uuid-rt:mermaid-rt.svg -->',
        '```mermaid',
        sourceCode,
        '```',
      ].join('\n')

      const editor = createMockEditor()
      const nodes = deserializeFromMarkdown(editor, serialized)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      ) as Record<string, unknown>

      // Re-serialize
      const editor2 = createMockEditor([mermaidNode])
      const result = serializeToMarkdown(editor2)

      expect(result).toContain('<!-- mermaid:uuid-rt:mermaid-rt.svg: -->')
      expect(result).toContain('```mermaid')
      expect(result).toContain(sourceCode)
    })

    it('round-trips caption through serialize→deserialize', () => {
      const caption = '系统架构图'
      const serialized = [
        `<!-- mermaid:uuid-cap:mermaid-cap.svg:${encodeURIComponent(caption)} -->`,
        '```mermaid',
        'graph TD',
        '  A-->B',
        '```',
      ].join('\n')

      const editor = createMockEditor()
      const nodes = deserializeFromMarkdown(editor, serialized)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(mermaidNode).toBeDefined()
      expect(mermaidNode.caption).toBe(caption)

      // Re-serialize and verify caption persists
      const editor2 = createMockEditor([mermaidNode])
      const result = serializeToMarkdown(editor2)
      expect(result).toContain(
        `<!-- mermaid:uuid-cap:mermaid-cap.svg:${encodeURIComponent(caption)} -->`
      )
    })

    it('deserializes old format (no caption field) with empty caption', () => {
      const editor = createMockEditor()
      const markdown = [
        '<!-- mermaid:uuid-old:mermaid-old.svg -->',
        '```mermaid',
        'graph TD',
        '  A-->B',
        '```',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const mermaidNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === MERMAID_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(mermaidNode).toBeDefined()
      expect(mermaidNode.caption).toBe('')
    })
  })
})
