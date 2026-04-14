import { randomUUID } from 'crypto'
import mermaid from 'mermaid'
import { XMLParser } from 'fast-xml-parser'

export type DiagramType = 'mermaid' | 'drawio'

const DIAGRAM_PLACEHOLDER_RE = /%%DIAGRAM:(mermaid|drawio):([^:\n]+):([A-Za-z0-9+/=]+)%%/g

export interface DiagramPlaceholder {
  placeholderId: string
  type: DiagramType
  title: string
  description: string
  assetFileName: string
}

export interface DiagramValidationResult {
  valid: boolean
  error?: string
}

export interface ParsedDiagramPlaceholders {
  placeholders: DiagramPlaceholder[]
  markdownWithSkeletons: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  parseTagValue: false,
  trimValues: false,
})

function toSkeletonMarker(placeholder: DiagramPlaceholder): string {
  return `> [图表生成中] ${placeholder.title} {#diagram-placeholder:${placeholder.placeholderId}}`
}

function fileNamePrefix(type: DiagramType): string {
  return type === 'mermaid' ? 'mermaid' : 'diagram'
}

function decodeBase64Text(input: string): string {
  try {
    return Buffer.from(input, 'base64').toString('utf-8').trim()
  } catch {
    return ''
  }
}

function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

export function parseDiagramPlaceholders(markdown: string): ParsedDiagramPlaceholders {
  const placeholders: DiagramPlaceholder[] = []
  const markdownWithSkeletons = markdown.replace(
    DIAGRAM_PLACEHOLDER_RE,
    (_match, type: DiagramType, rawTitle: string, encodedDescription: string) => {
      const placeholderId = randomUUID()
      const title = sanitizeTitle(rawTitle)
      const shortId = placeholderId.slice(0, 8)
      const assetFileName =
        type === 'mermaid'
          ? `${fileNamePrefix(type)}-${shortId}.svg`
          : `${fileNamePrefix(type)}-${shortId}.drawio`

      const placeholder: DiagramPlaceholder = {
        placeholderId,
        type,
        title,
        description: decodeBase64Text(encodedDescription),
        assetFileName,
      }
      placeholders.push(placeholder)
      return toSkeletonMarker(placeholder)
    }
  )

  return {
    placeholders,
    markdownWithSkeletons,
  }
}

export function replaceSkeletonWithDiagram(
  markdown: string,
  placeholderId: string,
  diagramMarkdown: string
): string {
  const lines = markdown.split('\n')
  const marker = `{#diagram-placeholder:${placeholderId}}`
  const nextLines: string[] = []

  for (const line of lines) {
    if (line.includes(marker)) {
      nextLines.push(diagramMarkdown)
      continue
    }
    nextLines.push(line)
  }

  return nextLines.join('\n')
}

export function removeSkeletonPlaceholder(markdown: string, placeholderId: string): string {
  const lines = markdown.split('\n')
  const marker = `{#diagram-placeholder:${placeholderId}}`
  return lines.filter((line) => !line.includes(marker)).join('\n')
}

export function buildMermaidMarkdown(input: {
  diagramId: string
  assetFileName: string
  caption: string
  source: string
}): string {
  const encodedCaption = input.caption ? encodeURIComponent(input.caption) : ''
  const comment = `<!-- mermaid:${input.diagramId}:${input.assetFileName}:${encodedCaption} -->`
  return `${comment}\n\`\`\`mermaid\n${input.source.trim()}\n\`\`\``
}

export function buildDrawioMarkdown(input: {
  diagramId: string
  assetFileName: string
  caption: string
}): string {
  const comment = `<!-- drawio:${input.diagramId}:${input.assetFileName} -->`
  const pngFileName = input.assetFileName.replace(/\.drawio$/, '.png')
  return `${comment}\n![${input.caption}](assets/${pngFileName})`
}

export async function validateMermaidDiagram(source: string): Promise<DiagramValidationResult> {
  try {
    await mermaid.parse(source)
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function collectMxCells(rootNode: unknown): unknown[] {
  if (!rootNode || typeof rootNode !== 'object') return []
  const root = rootNode as Record<string, unknown>
  const mxCell = root.mxCell
  if (Array.isArray(mxCell)) return mxCell
  if (mxCell !== undefined) return [mxCell]
  return []
}

export function validateDrawioDiagram(xml: string): DiagramValidationResult {
  try {
    const parsed = xmlParser.parse(xml) as Record<string, unknown>
    const mxGraphModel = parsed.mxGraphModel
    if (!mxGraphModel || typeof mxGraphModel !== 'object') {
      return { valid: false, error: '缺少 mxGraphModel 根元素' }
    }

    const root = (mxGraphModel as Record<string, unknown>).root
    if (!root || typeof root !== 'object') {
      return { valid: false, error: '缺少 mxGraphModel.root 节点' }
    }

    const cells = collectMxCells(root)
    if (cells.length < 2) {
      return { valid: false, error: 'mxCell 节点数量不足，无法形成有效图表' }
    }
    if (cells.length > 50) {
      return { valid: false, error: `mxCell 节点过多(${cells.length})，上限 50` }
    }

    const hasRootCell = cells.some((cell) => {
      if (!cell || typeof cell !== 'object') return false
      const attrs = cell as Record<string, unknown>
      return attrs['@_id'] === '0' || attrs['@_id'] === '1'
    })

    if (!hasRootCell) {
      return { valid: false, error: '缺少基础根 mxCell 节点（id=0/1）' }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function extractJsonObject<T>(content: string): T | null {
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null
  }

  try {
    return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as T
  } catch {
    return null
  }
}
