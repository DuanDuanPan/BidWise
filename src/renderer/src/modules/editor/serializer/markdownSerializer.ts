import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'
import type { DrawioElement } from '@modules/editor/plugins/drawioPlugin'
import { MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'
import type { MermaidElement } from '@modules/editor/plugins/mermaidPlugin'

type EditorWithMarkdownApi = {
  children: unknown[]
  api: { markdown: { serialize: () => string; deserialize: (md: string) => unknown[] } }
}

// ── Drawio Markdown patterns ──

const DRAWIO_COMMENT_RE = /^<!-- drawio:([^:]+):(.+?) -->$/
const DRAWIO_IMAGE_RE = /^!\[((?:[^\]\\]|\\.)*)\]\(assets\/(.+?\.png)\)$/

// Placeholder used during serialization: a unique string that won't appear in real content
const DRAWIO_PLACEHOLDER_PREFIX = 'DRAWIO-PH-'
const DRAWIO_PLACEHOLDER_SUFFIX = '-END'
const DRAWIO_PLACEHOLDER_RE = /DRAWIO-PH-(\d+)-END/g

// ── Mermaid Markdown patterns ──

const MERMAID_COMMENT_RE = /^<!-- mermaid:([^:]+):([^:]+?)(?::(.*)?)? -->$/
const MERMAID_FENCE_START_RE = /^```mermaid\s*$/
const MERMAID_FENCE_END_RE = /^```\s*$/

function escapeMarkdownAlt(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function unescapeMarkdownAlt(text: string): string {
  return text.replace(/\\(.)/g, '$1')
}

const MERMAID_PLACEHOLDER_PREFIX = 'MERMAID-PH-'
const MERMAID_PLACEHOLDER_SUFFIX = '-END'
const MERMAID_PLACEHOLDER_RE = /MERMAID-PH-(\d+)-END/g

/** 将当前编辑器内容序列化为 Markdown */
export function serializeToMarkdown(editor: EditorWithMarkdownApi): string {
  // 1. Collect drawio & mermaid elements and replace them with placeholder text nodes
  const drawioBlocks: DrawioElement[] = []
  const mermaidBlocks: MermaidElement[] = []
  const patchedChildren: unknown[] = []

  for (const node of editor.children) {
    const n = node as Record<string, unknown>
    if (n.type === DRAWIO_ELEMENT_TYPE) {
      const index = drawioBlocks.length
      drawioBlocks.push(n as unknown as DrawioElement)
      patchedChildren.push({
        type: 'p',
        children: [{ text: `${DRAWIO_PLACEHOLDER_PREFIX}${index}${DRAWIO_PLACEHOLDER_SUFFIX}` }],
      })
    } else if (n.type === MERMAID_ELEMENT_TYPE) {
      const index = mermaidBlocks.length
      mermaidBlocks.push(n as unknown as MermaidElement)
      patchedChildren.push({
        type: 'p',
        children: [{ text: `${MERMAID_PLACEHOLDER_PREFIX}${index}${MERMAID_PLACEHOLDER_SUFFIX}` }],
      })
    } else {
      patchedChildren.push(node)
    }
  }

  // If no special blocks, just serialize normally
  if (drawioBlocks.length === 0 && mermaidBlocks.length === 0) {
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

  // 3. Replace drawio placeholders
  markdown = markdown.replace(DRAWIO_PLACEHOLDER_RE, (_match, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    const block = drawioBlocks[index]
    if (!block) return ''

    const pngFileName = block.assetFileName.replace(/\.drawio$/, '.png')
    const comment = `<!-- drawio:${block.diagramId}:${block.assetFileName} -->`
    const image = `![${escapeMarkdownAlt(block.caption || '')}](assets/${pngFileName})`
    return `${comment}\n${image}`
  })

  // 4. Replace mermaid placeholders
  markdown = markdown.replace(MERMAID_PLACEHOLDER_RE, (_match, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    const block = mermaidBlocks[index]
    if (!block) return ''

    const encodedCaption = block.caption ? encodeURIComponent(block.caption) : ''
    const comment = `<!-- mermaid:${block.diagramId}:${block.assetFileName}:${encodedCaption} -->`
    return `${comment}\n\`\`\`mermaid\n${block.source}\n\`\`\``
  })

  return markdown
}

/** 将 Markdown 反序列化为 Plate 编辑器节点 */
export function deserializeFromMarkdown(
  editor: { api: { markdown: { deserialize: (md: string) => unknown[] } } },
  markdown: string
): unknown[] {
  // 1. Pre-process: extract drawio & mermaid blocks and replace with placeholders
  const drawioDataMap: Map<number, { diagramId: string; assetFileName: string; caption: string }> =
    new Map()
  const mermaidDataMap: Map<
    number,
    { diagramId: string; assetFileName: string; source: string; caption: string }
  > = new Map()

  const lines = markdown.split('\n')
  const processedLines: string[] = []
  let drawioPlaceholderIndex = 0
  let mermaidPlaceholderIndex = 0

  for (let i = 0; i < lines.length; i++) {
    // Check drawio comment+image pair
    const drawioCommentMatch = lines[i].match(DRAWIO_COMMENT_RE)
    if (drawioCommentMatch && i + 1 < lines.length) {
      const imageMatch = lines[i + 1].match(DRAWIO_IMAGE_RE)
      if (imageMatch) {
        const diagramId = drawioCommentMatch[1]
        const assetFileName = drawioCommentMatch[2]
        const caption = unescapeMarkdownAlt(imageMatch[1])
        drawioDataMap.set(drawioPlaceholderIndex, { diagramId, assetFileName, caption })
        processedLines.push(
          `${DRAWIO_PLACEHOLDER_PREFIX}${drawioPlaceholderIndex}${DRAWIO_PLACEHOLDER_SUFFIX}`
        )
        drawioPlaceholderIndex++
        i++ // Skip the image line
        continue
      }
    }

    // Check mermaid comment + fenced code block
    const mermaidCommentMatch = lines[i].match(MERMAID_COMMENT_RE)
    if (mermaidCommentMatch && i + 1 < lines.length && MERMAID_FENCE_START_RE.test(lines[i + 1])) {
      const diagramId = mermaidCommentMatch[1]
      const assetFileName = mermaidCommentMatch[2]
      const caption = mermaidCommentMatch[3] ? decodeURIComponent(mermaidCommentMatch[3]) : ''
      const sourceLines: string[] = []
      let j = i + 2
      while (j < lines.length && !MERMAID_FENCE_END_RE.test(lines[j])) {
        sourceLines.push(lines[j])
        j++
      }
      mermaidDataMap.set(mermaidPlaceholderIndex, {
        diagramId,
        assetFileName,
        source: sourceLines.join('\n'),
        caption,
      })
      processedLines.push(
        `${MERMAID_PLACEHOLDER_PREFIX}${mermaidPlaceholderIndex}${MERMAID_PLACEHOLDER_SUFFIX}`
      )
      mermaidPlaceholderIndex++
      i = j // Skip past closing fence
      continue
    }

    // Check bare mermaid fenced code block (no comment — import scenario)
    if (MERMAID_FENCE_START_RE.test(lines[i])) {
      const sourceLines: string[] = []
      let j = i + 1
      while (j < lines.length && !MERMAID_FENCE_END_RE.test(lines[j])) {
        sourceLines.push(lines[j])
        j++
      }
      const shortId = crypto.randomUUID().slice(0, 8)
      mermaidDataMap.set(mermaidPlaceholderIndex, {
        diagramId: crypto.randomUUID(),
        assetFileName: `mermaid-${shortId}.svg`,
        source: sourceLines.join('\n'),
        caption: '',
      })
      processedLines.push(
        `${MERMAID_PLACEHOLDER_PREFIX}${mermaidPlaceholderIndex}${MERMAID_PLACEHOLDER_SUFFIX}`
      )
      mermaidPlaceholderIndex++
      i = j // Skip past closing fence
      continue
    }

    processedLines.push(lines[i])
  }

  // If no special blocks found, deserialize normally
  if (drawioDataMap.size === 0 && mermaidDataMap.size === 0) {
    return editor.api.markdown.deserialize(markdown)
  }

  // 2. Deserialize the processed markdown
  const nodes = editor.api.markdown.deserialize(processedLines.join('\n'))

  // 3. Post-process: replace placeholder paragraphs with void elements
  return nodes.map((node) => {
    const n = node as Record<string, unknown>
    if (n.type === 'p' && Array.isArray(n.children) && n.children.length === 1) {
      const child = n.children[0] as Record<string, unknown>
      if (typeof child.text === 'string') {
        const drawioMatch = child.text.match(/DRAWIO-PH-(\d+)-END/)
        if (drawioMatch) {
          const idx = parseInt(drawioMatch[1], 10)
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
        const mermaidMatch = child.text.match(/MERMAID-PH-(\d+)-END/)
        if (mermaidMatch) {
          const idx = parseInt(mermaidMatch[1], 10)
          const data = mermaidDataMap.get(idx)
          if (data) {
            return {
              type: MERMAID_ELEMENT_TYPE,
              diagramId: data.diagramId,
              assetFileName: data.assetFileName,
              source: data.source,
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
