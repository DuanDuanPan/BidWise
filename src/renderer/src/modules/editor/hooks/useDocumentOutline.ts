import { useMemo } from 'react'

type OutlineLevel = 1 | 2 | 3 | 4

export interface OutlineNode {
  key: string
  title: string
  level: OutlineLevel
  lineIndex: number
  occurrenceIndex: number
  children: OutlineNode[]
}

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/

/**
 * Strips inline Markdown formatting from heading text so it matches
 * the plain text that Slate/Plate renders in the DOM.
 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → keep text
    .replace(/\*{1,3}/g, '') // bold/italic (asterisks)
    .replace(/(?<![\p{L}\p{N}_])_{1,3}|_{1,3}(?![\p{L}\p{N}_])/gu, '') // emphasis underscores at word boundaries (Unicode-aware)
    .replace(/~~/g, '') // strikethrough
    .replace(/`/g, '') // inline code
    .trim()
}

/**
 * Extracts a flat list of headings from Markdown, skipping fenced code blocks.
 */
function extractHeadings(markdown: string): OutlineNode[] {
  const lines = markdown.split('\n')
  const headings: OutlineNode[] = []
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0
  const occurrenceCount = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      const char = marker[0]
      const len = marker.length
      if (inFence) {
        if (char === fenceChar && len >= fenceLen) {
          inFence = false
          fenceChar = null
          fenceLen = 0
        }
      } else {
        inFence = true
        fenceChar = char
        fenceLen = len
      }
      continue
    }

    if (inFence) continue

    const match = HEADING_RE.exec(line)
    if (match) {
      const level = match[1].length as OutlineLevel
      const title = stripInlineFormatting(match[2])
      const occKey = title
      const count = occurrenceCount.get(occKey) ?? 0
      occurrenceCount.set(occKey, count + 1)

      headings.push({
        key: `heading-${i}`,
        title,
        level,
        lineIndex: i,
        occurrenceIndex: count,
        children: [],
      })
    }
  }

  return headings
}

/**
 * Builds a nested tree from a flat heading list based on heading levels.
 */
function buildTree(flatHeadings: OutlineNode[]): OutlineNode[] {
  const root: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const heading of flatHeadings) {
    const node: OutlineNode = { ...heading, children: [] }

    // Pop stack until we find a parent with a lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return root
}

export function useDocumentOutline(markdown: string): OutlineNode[] {
  return useMemo(() => {
    if (!markdown) return []
    const flat = extractHeadings(markdown)
    return buildTree(flat)
  }, [markdown])
}

export { extractHeadings, buildTree }
