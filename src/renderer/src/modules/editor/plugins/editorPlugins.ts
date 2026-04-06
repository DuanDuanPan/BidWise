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
import { ParagraphPlugin } from '@platejs/core/react'
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
import {
  OutlineHeadingElement,
  ChapterHeadingElement,
} from '@modules/editor/components/OutlineHeadingElement'
import { SourceAwareParagraph } from '@modules/editor/components/SourceAwareParagraph'

export const editorPlugins = [
  ParagraphPlugin.withComponent(SourceAwareParagraph),
  H1Plugin.withComponent(OutlineHeadingElement),
  H2Plugin.withComponent(ChapterHeadingElement),
  H3Plugin.withComponent(ChapterHeadingElement),
  H4Plugin.withComponent(ChapterHeadingElement),
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
  ListItemContentPlugin.withComponent(SourceAwareParagraph),
  TablePlugin,
  CodeBlockPlugin,
  CodeLinePlugin,
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),
]
