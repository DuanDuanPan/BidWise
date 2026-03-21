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
import { TablePlugin } from '@platejs/table/react'
import { CodeBlockPlugin, CodeLinePlugin } from '@platejs/code-block/react'
import { MarkdownPlugin } from '@platejs/markdown'
import remarkGfm from 'remark-gfm'

export const editorPlugins = [
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
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),
]
