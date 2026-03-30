import { describe, expect, it } from 'vitest'
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from '@platejs/list-classic/react'
import { CodeBlockPlugin, CodeLinePlugin } from '@platejs/code-block/react'
import { TablePlugin } from '@platejs/table/react'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { OutlineHeadingElement } from '@modules/editor/components/OutlineHeadingElement'

describe('@story-3-1 editorPlugins', () => {
  it('registers the rich-text plugins required by the story acceptance criteria', () => {
    expect(editorPlugins).toEqual(
      expect.arrayContaining([
        BoldPlugin,
        ItalicPlugin,
        UnderlinePlugin,
        StrikethroughPlugin,
        CodePlugin,
        BlockquotePlugin,
        ListPlugin,
        BulletedListPlugin,
        NumberedListPlugin,
        ListItemPlugin,
        ListItemContentPlugin,
        TablePlugin,
        CodeBlockPlugin,
        CodeLinePlugin,
      ])
    )
  })

  it('@story-3-2 heading plugins (H1-H4) are present with custom components', () => {
    const headingKeys = ['h1', 'h2', 'h3', 'h4']
    const pluginKeys = editorPlugins.map((p) => (p as { key?: string }).key).filter(Boolean)
    for (const key of headingKeys) {
      expect(pluginKeys).toContain(key)
    }
  })

  it('@story-3-2 heading plugins use OutlineHeadingElement component for scroll matching', () => {
    const headingKeys = ['h1', 'h2', 'h3', 'h4']
    for (const key of headingKeys) {
      const plugin = editorPlugins.find((p) => (p as { key?: string }).key === key)
      expect(plugin).toBeDefined()
      // withComponent sets the render component on the plugin node config
      const nodeConfig = (plugin as Record<string, unknown>).node as
        | Record<string, unknown>
        | undefined
      expect(nodeConfig?.component).toBe(OutlineHeadingElement)
    }
  })
})
