import { useMemo } from 'react'

/**
 * Strips Markdown syntax markers and counts characters.
 * Chinese characters are counted individually.
 */
function countCharacters(markdown: string): number {
  if (!markdown) return 0

  let text = markdown
  // Remove entire fenced code blocks (markers + body)
  text = text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1\s*$/gm, '')
  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Remove bold/italic markers (only strip underscores at word boundaries)
  text = text.replace(/\*{1,3}/g, '')
  text = text.replace(/(?<!\w)_{1,3}|_{1,3}(?!\w)/g, '')
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

// Export for testing
export { countCharacters }
