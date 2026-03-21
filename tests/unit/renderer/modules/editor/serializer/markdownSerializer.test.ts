import { describe, it, expect } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { serializeToMarkdown, deserializeFromMarkdown } from '@modules/editor/serializer'

function createTestEditor(): ReturnType<typeof createPlateEditor> {
  return createPlateEditor({ plugins: editorPlugins })
}

describe('markdownSerializer', () => {
  describe('serializeToMarkdown', () => {
    it('should serialize empty editor to empty or whitespace-only string', () => {
      const editor = createTestEditor()
      const md = serializeToMarkdown(editor)
      // Empty editor produces empty string or zero-width space
      expect(md.replace(/[\u200B\s]/g, '')).toBe('')
    })
  })

  describe('deserializeFromMarkdown', () => {
    it('should deserialize heading', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '# Hello World')
      expect(nodes).toBeDefined()
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize bold and italic', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '**bold** and *italic*')
      expect(nodes).toBeDefined()
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize unordered list', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '- item 1\n- item 2\n- item 3')
      expect(nodes).toBeDefined()
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize empty markdown to paragraph nodes', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '')
      expect(nodes).toBeDefined()
    })
  })

  describe('roundtrip', () => {
    it('should roundtrip headings', () => {
      const editor = createTestEditor()
      const source = '# Heading 1\n\n## Heading 2\n\n### Heading 3'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)
      expect(result).toContain('# Heading 1')
      expect(result).toContain('## Heading 2')
      expect(result).toContain('### Heading 3')
    })

    it('should roundtrip bold text', () => {
      const editor = createTestEditor()
      const source = '**bold text**'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)
      expect(result).toContain('**bold text**')
    })

    it('should roundtrip GFM tables', () => {
      const editor = createTestEditor()
      const source = '| 列1 | 列2 |\n| --- | --- |\n| A | B |'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)

      expect(result).toContain('| 列1 | 列2 |')
      expect(result).toMatch(/\|\s*A\s+\|\s*B\s+\|/)
    })
  })
})
