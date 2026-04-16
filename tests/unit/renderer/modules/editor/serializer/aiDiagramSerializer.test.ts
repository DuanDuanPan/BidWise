import { describe, it, expect, vi } from 'vitest'
import { AI_DIAGRAM_ELEMENT_TYPE } from '@modules/editor/plugins/aiDiagramPlugin'

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

describe('@story-3-9 ai-diagram serialization', () => {
  describe('serializeToMarkdown', () => {
    it('serializes ai-diagram void elements as comment + image', () => {
      const editor = createMockEditor([
        { type: 'p', children: [{ text: 'Before' }] },
        {
          type: AI_DIAGRAM_ELEMENT_TYPE,
          diagramId: 'uuid-ai-1',
          assetFileName: 'ai-diagram-abc.svg',
          caption: '',
          prompt: 'test prompt',
          style: 'flat-icon',
          diagramType: 'architecture',
          children: [{ text: '' }],
        },
        { type: 'p', children: [{ text: 'After' }] },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain(
        '<!-- ai-diagram:uuid-ai-1:ai-diagram-abc.svg::test%20prompt:flat-icon:architecture -->'
      )
      expect(result).toContain('![](assets/ai-diagram-abc.svg)')
    })

    it('serializes caption with URL-encoding', () => {
      const editor = createMockEditor([
        {
          type: AI_DIAGRAM_ELEMENT_TYPE,
          diagramId: 'uuid-cap',
          assetFileName: 'ai-diagram-cap.svg',
          caption: '系统架构图',
          prompt: '',
          style: 'flat-icon',
          diagramType: 'architecture',
          children: [{ text: '' }],
        },
      ])

      const result = serializeToMarkdown(editor)

      expect(result).toContain(
        `<!-- ai-diagram:uuid-cap:ai-diagram-cap.svg:${encodeURIComponent('系统架构图')}::flat-icon:architecture -->`
      )
      expect(result).toContain('![系统架构图](assets/ai-diagram-cap.svg)')
    })
  })

  describe('deserializeFromMarkdown', () => {
    it('restores ai-diagram void elements from comment + image pair', () => {
      const editor = createMockEditor()
      const markdown = [
        '# Title',
        '',
        '<!-- ai-diagram:uuid-ai-1:ai-diagram-abc.svg -->',
        '![](assets/ai-diagram-abc.svg)',
        '',
        'Some text',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const aiNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === AI_DIAGRAM_ELEMENT_TYPE
      ) as Record<string, unknown> | undefined
      expect(aiNode).toBeDefined()
      expect(aiNode!.diagramId).toBe('uuid-ai-1')
      expect(aiNode!.assetFileName).toBe('ai-diagram-abc.svg')
      expect(aiNode!.caption).toBe('')
      expect(aiNode!.svgPersisted).toBe(true)
    })

    it('restores caption from encoded comment', () => {
      const caption = '数据流图'
      const editor = createMockEditor()
      const markdown = [
        `<!-- ai-diagram:uuid-cap:ai-diagram-x.svg:${encodeURIComponent(caption)} -->`,
        `![${caption}](assets/ai-diagram-x.svg)`,
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const aiNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === AI_DIAGRAM_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(aiNode.caption).toBe(caption)
    })

    it('restores prompt/style/diagramType from extended comment', () => {
      const editor = createMockEditor()
      const prompt = '系统整体架构图'
      const markdown = [
        `<!-- ai-diagram:uuid-ext:ai-diagram-ext.svg::${encodeURIComponent(prompt)}:blueprint:data-flow -->`,
        '![](assets/ai-diagram-ext.svg)',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const aiNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === AI_DIAGRAM_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(aiNode).toBeDefined()
      expect(aiNode.prompt).toBe(prompt)
      expect(aiNode.style).toBe('blueprint')
      expect(aiNode.diagramType).toBe('data-flow')
    })

    it('defaults prompt/style/type when old 3-field comment', () => {
      const editor = createMockEditor()
      const markdown = [
        '<!-- ai-diagram:uuid-old:ai-diagram-old.svg -->',
        '![](assets/ai-diagram-old.svg)',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, markdown)

      const aiNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === AI_DIAGRAM_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(aiNode.prompt).toBe('')
      expect(aiNode.style).toBe('flat-icon')
      expect(aiNode.diagramType).toBe('architecture')
    })

    it('round-trips prompt/style/type through serialize→deserialize', () => {
      const prompt = '微服务架构'
      const markdown = [
        `<!-- ai-diagram:uuid-rt:ai-diagram-rt.svg:${encodeURIComponent('测试图')}:${encodeURIComponent(prompt)}:dark-terminal:flowchart -->`,
        '![测试图](assets/ai-diagram-rt.svg)',
      ].join('\n')

      const editor = createMockEditor()
      const nodes = deserializeFromMarkdown(editor, markdown)

      const aiNode = nodes.find(
        (n) => (n as Record<string, unknown>).type === AI_DIAGRAM_ELEMENT_TYPE
      ) as Record<string, unknown>
      expect(aiNode).toBeDefined()
      expect(aiNode.prompt).toBe(prompt)
      expect(aiNode.style).toBe('dark-terminal')
      expect(aiNode.diagramType).toBe('flowchart')

      // Re-serialize
      const editor2 = createMockEditor([aiNode])
      const result = serializeToMarkdown(editor2)

      expect(result).toContain(`${encodeURIComponent(prompt)}:dark-terminal:flowchart -->`)
      expect(result).toContain('![测试图](assets/ai-diagram-rt.svg)')
    })
  })
})
