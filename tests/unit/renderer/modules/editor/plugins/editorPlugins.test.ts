import { describe, expect, it } from 'vitest'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import {
  OutlineHeadingElement,
  ChapterHeadingElement,
} from '@modules/editor/components/OutlineHeadingElement'
import { SourceAwareParagraph } from '@modules/editor/components/SourceAwareParagraph'

/** Helper: find a plugin by its `key` property. */
function findPlugin(key: string) {
  return editorPlugins.find((p) => (p as { key?: string }).key === key)
}

/** Helper: extract the attached component from a plugin's node config. */
function pluginComponent(key: string): unknown {
  const plugin = findPlugin(key)
  if (!plugin) return undefined
  return (plugin as Record<string, unknown>).node
    ? ((plugin as Record<string, unknown>).node as Record<string, unknown>).component
    : undefined
}

describe('@story-3-1 editorPlugins', () => {
  // Keys as declared by their Plate plugin definitions
  const expectedKeys = [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'code',
    'blockquote',
    'listClassic',
    'ul',
    'ol',
    'li',
    'lic',
    'table',
    'code_block',
    'code_line',
    'markdown',
  ]

  it('registers all rich-text plugin keys required by acceptance criteria', () => {
    const pluginKeys = editorPlugins
      .map((p) => (p as { key?: string }).key)
      .filter(Boolean)

    for (const key of expectedKeys) {
      expect(pluginKeys, `missing plugin key: ${key}`).toContain(key)
    }
  })

  it('@story-3-5 ParagraphPlugin uses SourceAwareParagraph renderer', () => {
    expect(pluginComponent('p')).toBe(SourceAwareParagraph)
  })

  it('@story-3-5 ListItemContentPlugin uses SourceAwareParagraph renderer', () => {
    expect(pluginComponent('lic')).toBe(SourceAwareParagraph)
  })

  it('@story-3-2 H1 uses OutlineHeadingElement, H2-H4 use ChapterHeadingElement', () => {
    expect(pluginComponent('h1')).toBe(OutlineHeadingElement)
    expect(pluginComponent('h2')).toBe(ChapterHeadingElement)
    expect(pluginComponent('h3')).toBe(ChapterHeadingElement)
    expect(pluginComponent('h4')).toBe(ChapterHeadingElement)
  })

  it('@story-3-5 MarkdownPlugin is present and configured', () => {
    const plugin = findPlugin('markdown') as Record<string, unknown> | undefined
    expect(plugin).toBeDefined()
    // .configure() stores config lazily via __configuration; verify it exists
    expect(plugin!.__configuration).toBeDefined()
    const config =
      typeof plugin!.__configuration === 'function'
        ? (plugin!.__configuration as (ctx: unknown) => Record<string, unknown>)({})
        : (plugin!.__configuration as Record<string, unknown>)
    const options = config.options as Record<string, unknown> | undefined
    expect(options).toBeDefined()
    expect(Array.isArray(options!.remarkPlugins)).toBe(true)
    expect((options!.remarkPlugins as unknown[]).length).toBeGreaterThan(0)
  })
})
