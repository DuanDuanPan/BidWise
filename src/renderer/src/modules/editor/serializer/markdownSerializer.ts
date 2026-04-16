import { DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'
import type { DrawioElement } from '@modules/editor/plugins/drawioPlugin'
import { MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'
import type { MermaidElement } from '@modules/editor/plugins/mermaidPlugin'
import { AI_DIAGRAM_ELEMENT_TYPE } from '@modules/editor/plugins/aiDiagramPlugin'
import type { AiDiagramElement } from '@modules/editor/plugins/aiDiagramPlugin'

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

// ── AI Diagram Markdown patterns ──

// Format: <!-- ai-diagram:id:file:caption:prompt:style:type -->
// Fields 4-6 (prompt/style/type) optional for backward compat
const AI_DIAGRAM_COMMENT_RE =
  /^<!-- ai-diagram:([^:]+):([^:]+?)(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))? -->$/
const AI_DIAGRAM_IMAGE_RE = /^!\[((?:[^\]\\]|\\.)*)\]\(assets\/(.+?\.svg)\)$/

const AI_DIAGRAM_PLACEHOLDER_PREFIX = 'AI-DIAGRAM-PH-'
const AI_DIAGRAM_PLACEHOLDER_SUFFIX = '-END'
const AI_DIAGRAM_PLACEHOLDER_RE = /AI-DIAGRAM-PH-(\d+)-END/g

// ── AI Diagram Failed Markdown patterns ──

// Format: <!-- ai-diagram-failed:id:file:caption:prompt:style:type:error -->
const AI_DIAGRAM_FAILED_COMMENT_RE =
  /^<!-- ai-diagram-failed:([^:]+):([^:]+?)(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))? -->$/
const AI_DIAGRAM_FAILED_BLOCKQUOTE_RE = /^>\s*\[图表生成失败\]/

const HEADING_LINE_RE = /^(#{1,4})\s+(.+?)\s*$/
const GUIDANCE_LINE_RE = /^>\s*(.+?)\s*$/

type GuidanceHeadingPair = {
  level: number
  title: string
  guidance: string
}

function collectGuidanceHeadingPairs(markdown: string): GuidanceHeadingPair[] {
  const lines = markdown.split('\n')
  const pairs: GuidanceHeadingPair[] = []

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(HEADING_LINE_RE)
    if (!headingMatch) continue

    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') {
      j += 1
    }

    const guidanceMatch = lines[j]?.match(GUIDANCE_LINE_RE)
    if (!guidanceMatch) continue

    pairs.push({
      level: headingMatch[1].length,
      title: headingMatch[2].trim(),
      guidance: guidanceMatch[1].trim(),
    })
  }

  return pairs
}

function getNodePlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''

  const candidate = node as { text?: unknown; children?: unknown[] }
  if (typeof candidate.text === 'string') {
    return candidate.text
  }
  if (!Array.isArray(candidate.children)) {
    return ''
  }

  return candidate.children.map((child) => getNodePlainText(child)).join('')
}

function replaceNodeText(node: unknown, text: string): unknown {
  if (!node || typeof node !== 'object') {
    return node
  }

  return {
    ...(node as Record<string, unknown>),
    children: [{ text }],
  }
}

function repairMergedGuidanceHeadings(
  nodes: unknown[],
  guidancePairs: GuidanceHeadingPair[]
): unknown[] {
  if (guidancePairs.length === 0) {
    return nodes
  }

  const repairedNodes: unknown[] = []

  for (const node of nodes) {
    const candidate = node as { type?: unknown }
    const level = typeof candidate.type === 'string' ? Number(candidate.type.slice(1)) : NaN
    if (!Number.isInteger(level) || level < 1 || level > 4) {
      repairedNodes.push(node)
      continue
    }

    const plainText = getNodePlainText(node).trim()
    const matchedPair = guidancePairs.find(
      (pair) =>
        pair.level === level &&
        (plainText === `${pair.title}> ${pair.guidance}` ||
          plainText === `${pair.title}>${pair.guidance}`)
    )

    if (!matchedPair) {
      repairedNodes.push(node)
      continue
    }

    repairedNodes.push(replaceNodeText(node, matchedPair.title))
    repairedNodes.push({
      type: 'blockquote',
      children: [{ text: matchedPair.guidance }],
    })
  }

  return repairedNodes
}

/** 将当前编辑器内容序列化为 Markdown */
export function serializeToMarkdown(editor: EditorWithMarkdownApi): string {
  // 1. Collect drawio, mermaid & ai-diagram elements and replace them with placeholder text nodes
  const drawioBlocks: DrawioElement[] = []
  const mermaidBlocks: MermaidElement[] = []
  const aiDiagramBlocks: AiDiagramElement[] = []
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
    } else if (n.type === AI_DIAGRAM_ELEMENT_TYPE) {
      const index = aiDiagramBlocks.length
      aiDiagramBlocks.push(n as unknown as AiDiagramElement)
      patchedChildren.push({
        type: 'p',
        children: [
          {
            text: `${AI_DIAGRAM_PLACEHOLDER_PREFIX}${index}${AI_DIAGRAM_PLACEHOLDER_SUFFIX}`,
          },
        ],
      })
    } else {
      patchedChildren.push(node)
    }
  }

  // If no special blocks, just serialize normally
  if (drawioBlocks.length === 0 && mermaidBlocks.length === 0 && aiDiagramBlocks.length === 0) {
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

  // 5. Replace ai-diagram placeholders
  markdown = markdown.replace(AI_DIAGRAM_PLACEHOLDER_RE, (_match, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    const block = aiDiagramBlocks[index]
    if (!block) return ''

    const encodedCaption = block.caption ? encodeURIComponent(block.caption) : ''
    const encodedPrompt = block.prompt ? encodeURIComponent(block.prompt) : ''
    const styleToken = block.style || ''
    const typeToken = block.diagramType || ''

    // Failed diagram: serialize as ai-diagram-failed comment + blockquote
    if (block.generationError) {
      const e = encodeURIComponent
      const failedComment = `<!-- ai-diagram-failed:${e(block.diagramId)}:${e(block.assetFileName)}:${encodedCaption}:${encodedPrompt}:${e(styleToken)}:${e(typeToken)}:${e(block.generationError)} -->`
      const blockquote = `> [图表生成失败] ${block.caption || ''}（${typeToken || 'skill'}）: ${block.generationError}`
      return `${failedComment}\n${blockquote}`
    }

    const comment = `<!-- ai-diagram:${block.diagramId}:${block.assetFileName}:${encodedCaption}:${encodedPrompt}:${styleToken}:${typeToken} -->`
    const image = `![${escapeMarkdownAlt(block.caption || '')}](assets/${block.assetFileName})`
    return `${comment}\n${image}`
  })

  return markdown
}

/** 将 Markdown 反序列化为 Plate 编辑器节点 */
export function deserializeFromMarkdown(
  editor: { api: { markdown: { deserialize: (md: string) => unknown[] } } },
  markdown: string
): unknown[] {
  const guidancePairs = collectGuidanceHeadingPairs(markdown)

  // 1. Pre-process: extract drawio, mermaid & ai-diagram blocks and replace with placeholders
  const drawioDataMap: Map<number, { diagramId: string; assetFileName: string; caption: string }> =
    new Map()
  const mermaidDataMap: Map<
    number,
    { diagramId: string; assetFileName: string; source: string; caption: string }
  > = new Map()
  const aiDiagramDataMap: Map<
    number,
    {
      diagramId: string
      assetFileName: string
      caption: string
      prompt: string
      style: string
      diagramType: string
      generationError?: string
    }
  > = new Map()

  const lines = markdown.split('\n')
  const processedLines: string[] = []
  let drawioPlaceholderIndex = 0
  let mermaidPlaceholderIndex = 0
  let aiDiagramPlaceholderIndex = 0

  for (let i = 0; i < lines.length; i++) {
    // Check ai-diagram-failed comment + blockquote pair
    const aiDiagramFailedMatch = lines[i].match(AI_DIAGRAM_FAILED_COMMENT_RE)
    if (aiDiagramFailedMatch) {
      const safeDecodeOrEmpty = (v: string | undefined): string => {
        if (!v) return ''
        try {
          return decodeURIComponent(v)
        } catch {
          return v
        }
      }
      const diagramId = safeDecodeOrEmpty(aiDiagramFailedMatch[1])
      const assetFileName = safeDecodeOrEmpty(aiDiagramFailedMatch[2])
      const caption = safeDecodeOrEmpty(aiDiagramFailedMatch[3])
      const prompt = safeDecodeOrEmpty(aiDiagramFailedMatch[4])
      const style = safeDecodeOrEmpty(aiDiagramFailedMatch[5])
      const diagramType = safeDecodeOrEmpty(aiDiagramFailedMatch[6])
      const generationError = safeDecodeOrEmpty(aiDiagramFailedMatch[7]) || '图表生成失败'
      aiDiagramDataMap.set(aiDiagramPlaceholderIndex, {
        diagramId,
        assetFileName,
        caption,
        prompt,
        style,
        diagramType,
        generationError,
      })
      processedLines.push(
        `${AI_DIAGRAM_PLACEHOLDER_PREFIX}${aiDiagramPlaceholderIndex}${AI_DIAGRAM_PLACEHOLDER_SUFFIX}`
      )
      aiDiagramPlaceholderIndex++
      // Skip the following blockquote line if it matches the failure pattern
      if (i + 1 < lines.length && AI_DIAGRAM_FAILED_BLOCKQUOTE_RE.test(lines[i + 1])) {
        i++
      }
      continue
    }

    // Check ai-diagram comment+image pair
    const aiDiagramCommentMatch = lines[i].match(AI_DIAGRAM_COMMENT_RE)
    if (aiDiagramCommentMatch && i + 1 < lines.length) {
      const imageMatch = lines[i + 1].match(AI_DIAGRAM_IMAGE_RE)
      if (imageMatch) {
        const diagramId = aiDiagramCommentMatch[1]
        const assetFileName = aiDiagramCommentMatch[2]
        const safeDecodeOrEmpty = (v: string | undefined): string => {
          if (!v) return ''
          try {
            return decodeURIComponent(v)
          } catch {
            return v
          }
        }
        const caption = safeDecodeOrEmpty(aiDiagramCommentMatch[3])
        const prompt = safeDecodeOrEmpty(aiDiagramCommentMatch[4])
        const style = aiDiagramCommentMatch[5] ?? ''
        const diagramType = aiDiagramCommentMatch[6] ?? ''
        aiDiagramDataMap.set(aiDiagramPlaceholderIndex, {
          diagramId,
          assetFileName,
          caption,
          prompt,
          style,
          diagramType,
        })
        processedLines.push(
          `${AI_DIAGRAM_PLACEHOLDER_PREFIX}${aiDiagramPlaceholderIndex}${AI_DIAGRAM_PLACEHOLDER_SUFFIX}`
        )
        aiDiagramPlaceholderIndex++
        i++ // Skip the image line
        continue
      }
    }

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
  if (drawioDataMap.size === 0 && mermaidDataMap.size === 0 && aiDiagramDataMap.size === 0) {
    return repairMergedGuidanceHeadings(editor.api.markdown.deserialize(markdown), guidancePairs)
  }

  // 2. Deserialize the processed markdown
  const nodes = editor.api.markdown.deserialize(processedLines.join('\n'))

  // 3. Post-process: replace placeholder paragraphs with void elements
  const restoredNodes = nodes.map((node) => {
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
              svgPersisted: false,
              children: [{ text: '' }],
            }
          }
        }
        const aiDiagramMatch = child.text.match(/AI-DIAGRAM-PH-(\d+)-END/)
        if (aiDiagramMatch) {
          const idx = parseInt(aiDiagramMatch[1], 10)
          const data = aiDiagramDataMap.get(idx)
          if (data) {
            const node: Record<string, unknown> = {
              type: AI_DIAGRAM_ELEMENT_TYPE,
              diagramId: data.diagramId,
              assetFileName: data.assetFileName,
              caption: data.caption,
              prompt: data.prompt || '',
              style: (data.style || 'flat-icon') as 'flat-icon',
              diagramType: (data.diagramType || 'architecture') as 'architecture',
              svgPersisted: !data.generationError,
              children: [{ text: '' }],
            }
            if (data.generationError) {
              node.generationError = data.generationError
            }
            return node
          }
        }
      }
    }
    return node
  })

  return repairMergedGuidanceHeadings(restoredNodes, guidancePairs)
}
