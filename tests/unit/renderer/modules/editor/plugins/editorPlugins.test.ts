import { describe, expect, it } from 'vitest'
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
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

describe('@story-3-1 editorPlugins', () => {
  it('registers the rich-text plugins required by the story acceptance criteria', () => {
    expect(editorPlugins).toEqual(
      expect.arrayContaining([
        H1Plugin,
        H2Plugin,
        H3Plugin,
        H4Plugin,
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
})
