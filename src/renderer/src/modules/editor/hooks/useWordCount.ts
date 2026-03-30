import { useMemo } from 'react'

const FENCE_RE = /^(\s*)(`{3,}|~{3,})/

function stripFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n')
  const keptLines: string[] = []
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0

  for (const line of lines) {
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

    if (!inFence) {
      keptLines.push(line)
    }
  }

  return keptLines.join('\n')
}

/**
 * Strips Markdown syntax markers and counts characters.
 * Chinese characters are counted individually.
 */
function countCharacters(markdown: string): number {
  if (!markdown) return 0

  let text = stripFencedCodeBlocks(markdown)
  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Remove bold/italic markers (only strip underscores at word boundaries)
  text = text.replace(/\*{1,3}/g, '')
  text = text.replace(/(?<![\p{L}\p{N}_])_{1,3}|_{1,3}(?![\p{L}\p{N}_])/gu, '')
  // Remove strikethrough
  text = text.replace(/~~/g, '')
  // Remove inline code backticks
  text = text.replace(/`/g, '')
  // Remove link/image syntax, keep text
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Remove table separators
  text = text.replace(/^\|?[-:|][-:||\s]*$/gm, '')
  // Remove table pipes
  text = text.replace(/\|/g, '')
  // Remove blockquote markers
  text = text.replace(/^>\s*/gm, '')
  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')
  text = text.replace(/^[\s]*\d+\.\s+/gm, '')
  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}$/gm, '')

  // Strip all whitespace and count remaining characters
  text = text.replace(/\s/g, '')

  return text.length
}

export function useWordCount(markdown: string): number {
  return useMemo(() => countCharacters(markdown), [markdown])
}

export { countCharacters }
