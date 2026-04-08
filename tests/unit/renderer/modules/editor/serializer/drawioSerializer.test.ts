import { describe, it, expect, vi } from 'vitest'
import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'

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
  // serialize must read editor.children at call time (not closure time)
  // because serializeToMarkdown swaps children before calling serialize
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

describe('@story-3-7 drawio serialization', () => {
  describe('serializeToMarkdown', () => {
    it('serializes drawio void elements as comment + image markdown', () => {
      const editor = createMockEditor([
        { type: 'p', children: [{ text: 'Before' }] },
        {
          type: DRAWIO_ELEMENT_TYPE,
          diagramId: 'uuid-1',
          assetFileName: 'diagram-abc.drawio',
          caption: '系统架构图',
          children: [{ text: '' }],
        },
        { type: 'p', children: [{ text: 'After' }] },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain('<!-- drawio:uuid-1:diagram-abc.drawio -->')
      expect(result).toContain('![系统架构图](assets/diagram-abc.png)')
    })

    it('delegates to default serializer when no drawio blocks exist', () => {
      const editor = createMockEditor([{ type: 'p', children: [{ text: 'Hello' }] }])

      const result = serializeToMarkdown(editor)

      expect(result).toBe('Hello')
      expect(editor.api.markdown.serialize).toHaveBeenCalledTimes(1)
    })

    it('handles multiple drawio blocks', () => {
      const editor = createMockEditor([
        {
          type: DRAWIO_ELEMENT_TYPE,
          diagramId: 'id-1',
          assetFileName: 'a.drawio',
          caption: '',
          children: [{ text: '' }],
        },
        {
          type: DRAWIO_ELEMENT_TYPE,
          diagramId: 'id-2',
          assetFileName: 'b.drawio',
          caption: '图2',
          children: [{ text: '' }],
        },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain('<!-- drawio:id-1:a.drawio -->')
      expect(result).toContain('![](assets/a.png)')
      expect(result).toContain('<!-- drawio:id-2:b.drawio -->')
      expect(result).toContain('![图2](assets/b.png)')
    })

    it('restores original children after serialization', () => {
      const original = [
        {
          type: DRAWIO_ELEMENT_TYPE,
          diagramId: 'id-1',
          assetFileName: 'x.drawio',
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
    it('restores drawio void elements from comment + image pattern', () => {
      const editor = createMockEditor()
      const markdown =
        '# Title\n\n<!-- drawio:uuid-1:diagram-abc.drawio -->\n![架构图](assets/diagram-abc.png)\n\nSome text'

      const nodes = deserializeFromMarkdown(editor, markdown)

      const drawioNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === DRAWIO_ELEMENT_TYPE
      ) as Record<string, unknown> | undefined
      expect(drawioNode).toBeDefined()
      expect(drawioNode!.diagramId).toBe('uuid-1')
      expect(drawioNode!.assetFileName).toBe('diagram-abc.drawio')
      expect(drawioNode!.caption).toBe('架构图')
    })

    it('leaves normal images untouched (no drawio comment)', () => {
      const editor = createMockEditor()
      const markdown = '![photo](assets/photo.png)'

      const nodes = deserializeFromMarkdown(editor, markdown)

      const drawioNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === DRAWIO_ELEMENT_TYPE
      )
      expect(drawioNode).toBeUndefined()
    })

    it('delegates to default deserializer when no drawio patterns found', () => {
      const editor = createMockEditor()
      const markdown = '# Just a heading'

      deserializeFromMarkdown(editor, markdown)

      expect(editor.api.markdown.deserialize).toHaveBeenCalledWith('# Just a heading')
    })
  })
})
