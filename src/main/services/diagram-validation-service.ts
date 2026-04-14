import { randomUUID } from 'crypto'
import { XMLParser } from 'fast-xml-parser'
import { mermaidRuntimeClient } from '@main/services/diagram-runtime/mermaid-runtime-client'
import {
  normalizeMermaidSource,
  preflightMermaidSource,
} from '@main/services/diagram-runtime/mermaid-source'

export type DiagramType = 'mermaid' | 'drawio'

// Accept any type token so LLM-hallucinated types like "C4Container" are still captured;
// non-standard types are normalized to 'mermaid' in parseDiagramPlaceholders.
const DIAGRAM_PLACEHOLDER_RE = /%%DIAGRAM:([A-Za-z0-9_-]+):([^:\n]+):([\s\S]*?)%%/g
const BASE64_TEXT_RE = /^[A-Za-z0-9+/]+={0,2}$/
const DIAGRAM_PLACEHOLDER_LINE_RE = /^%%DIAGRAM:[A-Za-z0-9_-]+:/

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
  failureKind?: 'infrastructure'
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

function tryDecodeBase64Text(input: string): string | null {
  const normalized = input.replace(/\s+/g, '')
  if (!normalized || normalized.length % 4 === 1 || !BASE64_TEXT_RE.test(normalized)) {
    return null
  }

  try {
    const decodedBuffer = Buffer.from(normalized, 'base64')
    if (decodedBuffer.length === 0) return null

    const canonicalInput = normalized.replace(/=+$/, '')
    const canonicalOutput = decodedBuffer.toString('base64').replace(/=+$/, '')
    if (canonicalInput !== canonicalOutput) {
      return null
    }

    const decodedText = decodedBuffer.toString('utf-8').trim()
    if (!decodedText || decodedText.includes('\uFFFD')) {
      return null
    }

    return decodedText
  } catch {
    return null
  }
}

function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

function repairUnclosedDiagramPlaceholders(markdown: string): string {
  let repairedMarkdown = markdown
  let cursor = 0

  while (cursor < repairedMarkdown.length) {
    const startIndex = repairedMarkdown.indexOf('%%DIAGRAM:', cursor)
    if (startIndex === -1) break

    const lineStart = repairedMarkdown.lastIndexOf('\n', startIndex) + 1
    const lineEndIndex = repairedMarkdown.indexOf('\n', startIndex)
    const safeLineEnd = lineEndIndex === -1 ? repairedMarkdown.length : lineEndIndex
    const line = repairedMarkdown.slice(lineStart, safeLineEnd)

    if (!DIAGRAM_PLACEHOLDER_LINE_RE.test(line.trim())) {
      cursor = startIndex + 10
      continue
    }

    const nextStartIndex = repairedMarkdown.indexOf('%%DIAGRAM:', startIndex + 10)
    const searchLimit = nextStartIndex === -1 ? repairedMarkdown.length : nextStartIndex
    const closeIndex = repairedMarkdown.indexOf('%%', startIndex + 2)

    if (closeIndex !== -1 && closeIndex < searchLimit) {
      cursor = closeIndex + 2
      continue
    }

    repairedMarkdown =
      repairedMarkdown.slice(0, safeLineEnd) + '%%' + repairedMarkdown.slice(safeLineEnd)
    cursor = safeLineEnd + 2
  }

  return repairedMarkdown
}

function normalizeDescription(rawDescription: string): string {
  const trimmed = rawDescription.trim()
  const wrapped = trimmed.match(/^base64\(([\s\S]*)\)$/i)
  const candidate = (wrapped ? wrapped[1] : trimmed).trim()
  const decoded = tryDecodeBase64Text(candidate)
  if (decoded) return decoded

  const lastColonIndex = candidate.lastIndexOf(':')
  if (lastColonIndex > -1) {
    const prefix = candidate.slice(0, lastColonIndex).replace(/\s+/g, ' ').trim()
    const suffix = candidate.slice(lastColonIndex + 1).trim()
    const decodedSuffix = tryDecodeBase64Text(suffix)

    if (decodedSuffix) {
      return prefix || decodedSuffix
    }
  }

  return candidate.replace(/\s+/g, ' ').trim()
}

function normalizeDiagramType(raw: string): DiagramType {
  const lower = raw.toLowerCase()
  if (lower === 'drawio' || lower === 'draw.io') return 'drawio'
  return 'mermaid' // C4Container, architecture-beta, flowchart, etc. → all mermaid
}

export function parseDiagramPlaceholders(markdown: string): ParsedDiagramPlaceholders {
  const repairedMarkdown = repairUnclosedDiagramPlaceholders(markdown)
  const placeholders: DiagramPlaceholder[] = []
  const markdownWithSkeletons = repairedMarkdown.replace(
    DIAGRAM_PLACEHOLDER_RE,
    (_match, rawType: string, rawTitle: string, rawDescription: string) => {
      const type = normalizeDiagramType(rawType)
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
        description: normalizeDescription(rawDescription),
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

export function buildDiagramFailureMarkdown(input: {
  type: DiagramType
  caption: string
  error: string
}): string {
  const normalizedError = input.error.replace(/\s+/g, ' ').trim()
  return `> [图表生成失败] ${input.caption}（${input.type}）: ${normalizedError}`
}

export async function validateMermaidDiagram(source: string): Promise<DiagramValidationResult> {
  const { normalizedSource, error } = preflightMermaidSource(source)
  if (error) {
    return {
      valid: false,
      error,
    }
  }

  try {
    return await mermaidRuntimeClient.validate(normalizedSource)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      valid: false,
      error: errorMessage,
      failureKind: 'infrastructure',
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

export { normalizeMermaidSource }
