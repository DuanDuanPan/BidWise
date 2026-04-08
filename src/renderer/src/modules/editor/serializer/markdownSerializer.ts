import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'
import type { DrawioElement } from '@modules/editor/plugins/drawioPlugin'

type EditorWithMarkdownApi = {
  children: unknown[]
  api: { markdown: { serialize: () => string; deserialize: (md: string) => unknown[] } }
}

// ── Drawio Markdown patterns ──

const DRAWIO_COMMENT_RE = /^<!-- drawio:([^:]+):(.+?) -->$/
const DRAWIO_IMAGE_RE = /^!\[([^\]]*)\]\(assets\/(.+?\.png)\)$/

// Placeholder used during serialization: a unique string that won't appear in real content
const DRAWIO_PLACEHOLDER_PREFIX = 'DRAWIO-PH-'
const DRAWIO_PLACEHOLDER_SUFFIX = '-END'
const DRAWIO_PLACEHOLDER_RE = /DRAWIO-PH-(\d+)-END/g

/** 将当前编辑器内容序列化为 Markdown */
export function serializeToMarkdown(editor: EditorWithMarkdownApi): string {
  // 1. Collect drawio elements and replace them with placeholder text nodes
  const drawioBlocks: DrawioElement[] = []
  const originalNodes: unknown[] = []
  const patchedChildren: unknown[] = []

  for (const node of editor.children) {
    const n = node as Record<string, unknown>
    if (n.type === DRAWIO_ELEMENT_TYPE) {
      const index = drawioBlocks.length
      drawioBlocks.push(n as unknown as DrawioElement)
      originalNodes.push(node)
      // Insert a paragraph with a unique placeholder that survives markdown serialization
      patchedChildren.push({
        type: 'p',
        children: [{ text: `${DRAWIO_PLACEHOLDER_PREFIX}${index}${DRAWIO_PLACEHOLDER_SUFFIX}` }],
      })
    } else {
      patchedChildren.push(node)
    }
  }

  // If no drawio blocks, just serialize normally
  if (drawioBlocks.length === 0) {
    return editor.api.markdown.serialize()
  }

  // 2. Temporarily swap children, serialize, then restore
  const savedChildren = editor.children
  ;(editor as { children: unknown[] }).children = patchedChildren

  let markdown: string
  try {
    markdown = editor.api.markdown.serialize()
  } finally {
    ;(editor as { children: unknown[] }).children = savedChildren
  }

  // 3. Replace placeholders with drawio markdown blocks
  markdown = markdown.replace(DRAWIO_PLACEHOLDER_RE, (_match, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    const block = drawioBlocks[index]
    if (!block) return ''

    const pngFileName = block.assetFileName.replace(/\.drawio$/, '.png')
    const comment = `<!-- drawio:${block.diagramId}:${block.assetFileName} -->`
    const image = `![${block.caption || ''}](assets/${pngFileName})`
    return `${comment}\n${image}`
  })

  return markdown
}

/** 将 Markdown 反序列化为 Plate 编辑器节点 */
export function deserializeFromMarkdown(
  editor: { api: { markdown: { deserialize: (md: string) => unknown[] } } },
  markdown: string
): unknown[] {
  // 1. Pre-process: extract drawio comment+image pairs and replace with placeholders
  const drawioDataMap: Map<number, { diagramId: string; assetFileName: string; caption: string }> =
    new Map()

  const lines = markdown.split('\n')
  const processedLines: string[] = []
  let placeholderIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const commentMatch = lines[i].match(DRAWIO_COMMENT_RE)
    if (commentMatch && i + 1 < lines.length) {
      const imageMatch = lines[i + 1].match(DRAWIO_IMAGE_RE)
      if (imageMatch) {
        const diagramId = commentMatch[1]
        const assetFileName = commentMatch[2]
        const caption = imageMatch[1]
        drawioDataMap.set(placeholderIndex, { diagramId, assetFileName, caption })
        processedLines.push(
          `${DRAWIO_PLACEHOLDER_PREFIX}${placeholderIndex}${DRAWIO_PLACEHOLDER_SUFFIX}`
        )
        placeholderIndex++
        i++ // Skip the image line
        continue
      }
    }
    processedLines.push(lines[i])
  }

  // If no drawio blocks found, deserialize normally
  if (drawioDataMap.size === 0) {
    return editor.api.markdown.deserialize(markdown)
  }

  // 2. Deserialize the processed markdown
  const nodes = editor.api.markdown.deserialize(processedLines.join('\n'))

  // 3. Post-process: replace placeholder paragraphs with drawio void elements
  return nodes.map((node) => {
    const n = node as Record<string, unknown>
    if (n.type === 'p' && Array.isArray(n.children) && n.children.length === 1) {
      const child = n.children[0] as Record<string, unknown>
      if (typeof child.text === 'string') {
        const match = child.text.match(/DRAWIO-PH-(\d+)-END/)
        if (match) {
          const idx = parseInt(match[1], 10)
          const data = drawioDataMap.get(idx)
          if (data) {
            return {
              type: DRAWIO_ELEMENT_TYPE,
              diagramId: data.diagramId,
              assetFileName: data.assetFileName,
              caption: data.caption,
              children: [{ text: '' }],
            }
          }
        }
      }
    }
    return node
  })
}
