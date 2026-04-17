import { stripMarkdown } from '@platejs/markdown'
import type { ChapterHeadingLocator } from './chapter-types'
import type { RenderableParagraph } from './source-attribution-types'

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/
const GUIDANCE_RE = /^>\s*/

export interface MarkdownHeadingInfo {
  rawTitle: string
  title: string
  level: ChapterHeadingLocator['level']
  lineIndex: number
  occurrenceIndex: number
}

export interface MarkdownSection {
  heading: MarkdownHeadingInfo
  contentLines: string[]
  endLineIndex: number
}

export function normalizeHeadingTitle(title: string): string {
  return title
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createContentDigest(content: string): string {
  const bytes = new TextEncoder().encode(content)
  const words: number[] = []

  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] ?? 0) | (bytes[i] << (24 - (i % 4) * 8))
  }

  const bitLength = bytes.length * 8
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)))
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Array<number>(64)

  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) {
      w[j] = words[i + j] ?? 0
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3)
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10)
      w[j] = add32(w[j - 16], s0, w[j - 7], s1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = add32(h, s1, ch, K[j], w[j])
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = add32(s0, maj)

      h = g
      g = f
      f = e
      e = add32(d, temp1)
      d = c
      c = b
      b = a
      a = add32(temp1, temp2)
    }

    h0 = add32(h0, a)
    h1 = add32(h1, b)
    h2 = add32(h2, c)
    h3 = add32(h3, d)
    h4 = add32(h4, e)
    h5 = add32(h5, f)
    h6 = add32(h6, g)
    h7 = add32(h7, h)
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
    .slice(0, 16)
}

function rightRotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

function add32(...values: number[]): number {
  let result = 0
  for (const value of values) {
    result = (result + value) | 0
  }
  return result >>> 0
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeadingInfo[] {
  const lines = markdown.split('\n')
  const headings: MarkdownHeadingInfo[] = []
  const occurrenceCount = new Map<string, number>()
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0

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
    if (!match) continue

    const level = match[1].length as ChapterHeadingLocator['level']
    const rawTitle = match[2].trim()
    const title = normalizeHeadingTitle(rawTitle)
    const occurrenceKey = `${level}:${title}`
    const occurrenceIndex = occurrenceCount.get(occurrenceKey) ?? 0
    occurrenceCount.set(occurrenceKey, occurrenceIndex + 1)
    headings.push({ rawTitle, title, level, lineIndex: i, occurrenceIndex })
  }

  return headings
}

export function findMarkdownHeading(
  headings: MarkdownHeadingInfo[],
  locator: ChapterHeadingLocator
): MarkdownHeadingInfo | undefined {
  const normalizedTitle = normalizeHeadingTitle(locator.title)
  return headings.find(
    (heading) =>
      heading.level === locator.level &&
      heading.title === normalizedTitle &&
      heading.occurrenceIndex === locator.occurrenceIndex
  )
}

export function getMarkdownSection(
  markdown: string,
  locator: ChapterHeadingLocator
): MarkdownSection | null {
  const lines = markdown.split('\n')
  const headings = extractMarkdownHeadings(markdown)
  const heading = findMarkdownHeading(headings, locator)
  if (!heading) return null

  let endLineIndex = lines.length
  for (const candidate of headings) {
    if (candidate.lineIndex > heading.lineIndex && candidate.level <= heading.level) {
      endLineIndex = candidate.lineIndex
      break
    }
  }

  return {
    heading,
    contentLines: lines.slice(heading.lineIndex + 1, endLineIndex),
    endLineIndex,
  }
}

export function extractMarkdownSectionContent(
  markdown: string,
  locator: ChapterHeadingLocator
): string {
  return getMarkdownSection(markdown, locator)?.contentLines.join('\n') ?? ''
}

/**
 * "直属正文" — lines belonging to a heading but EXCLUDING any nested sub-headings
 * (and their bodies). Stops at the first subsequent heading of any level.
 *
 * Used by chapter-summary cache (Story 3.12) for digest, fallback summary, and
 * the empty-direct-body filter in global summary context construction.
 */
export function getMarkdownDirectSectionBody(
  markdown: string,
  locator: ChapterHeadingLocator
): string {
  const lines = markdown.split('\n')
  const headings = extractMarkdownHeadings(markdown)
  const heading = findMarkdownHeading(headings, locator)
  if (!heading) return ''

  let endLineIndex = lines.length
  for (const candidate of headings) {
    if (candidate.lineIndex > heading.lineIndex) {
      endLineIndex = candidate.lineIndex
      break
    }
  }
  return lines.slice(heading.lineIndex + 1, endLineIndex).join('\n')
}

/**
 * Same as `getMarkdownDirectSectionBody` but works directly on a pre-extracted
 * heading list — avoids re-parsing the markdown when callers already hold the
 * heading set (e.g. during global summary context construction).
 */
export function getMarkdownDirectSectionBodyByHeading(
  lines: string[],
  headings: MarkdownHeadingInfo[],
  heading: MarkdownHeadingInfo
): string {
  let endLineIndex = lines.length
  for (const candidate of headings) {
    if (candidate.lineIndex > heading.lineIndex) {
      endLineIndex = candidate.lineIndex
      break
    }
  }
  return lines.slice(heading.lineIndex + 1, endLineIndex).join('\n')
}

export function isMarkdownDirectBodyEmpty(body: string): boolean {
  return isMarkdownSectionContentEmpty(body.split('\n'))
}

export function isMarkdownSectionContentEmpty(contentLines: string[]): boolean {
  for (const line of contentLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (FENCE_RE.test(line)) return false
    if (GUIDANCE_RE.test(trimmed)) continue
    if (HEADING_RE.test(line)) continue
    return false
  }

  return true
}

export function isMarkdownSectionEmpty(markdown: string, locator: ChapterHeadingLocator): boolean {
  const section = getMarkdownSection(markdown, locator)
  if (!section) return true
  return isMarkdownSectionContentEmpty(section.contentLines)
}

/**
 * Extract renderable paragraphs from a markdown section's content.
 * Alpha: only plain-text paragraphs and list items are annotatable blocks.
 * Headings, blank lines, guidance blockquotes, and fenced code blocks are skipped.
 */
export function extractRenderableParagraphs(sectionMarkdown: string): RenderableParagraph[] {
  const lines = sectionMarkdown.split('\n')
  const paragraphs: RenderableParagraph[] = []
  let paragraphIndex = 0
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
    if (inFence) continue

    const trimmed = line.trim()

    // Skip blank lines
    if (trimmed === '') continue
    // Skip headings
    if (HEADING_RE.test(line)) continue
    // Skip guidance blockquotes
    if (GUIDANCE_RE.test(trimmed) && !trimmed.match(/^>\s*[-*+]\s/)) continue

    // Plain-text paragraph or list item
    const renderedText = stripMarkdown(trimmed).replace(/\s+/g, ' ').trim()
    paragraphs.push({
      paragraphIndex,
      text: trimmed,
      digest: createContentDigest(renderedText || trimmed),
    })
    paragraphIndex++
  }

  return paragraphs
}

export function replaceMarkdownSection(
  markdown: string,
  locator: ChapterHeadingLocator,
  markdownContent: string
): string | null {
  const section = getMarkdownSection(markdown, locator)
  if (!section) return null

  const lines = markdown.split('\n')
  const newLines = [
    ...lines.slice(0, section.heading.lineIndex + 1),
    '',
    markdownContent,
    '',
    ...lines.slice(section.endLineIndex),
  ]

  return newLines.join('\n')
}

/**
 * Remove a duplicated chapter heading when the AI echoes the current section title
 * as the first Markdown block of the generated body.
 */
export function sanitizeGeneratedChapterMarkdown(
  markdownContent: string,
  locator: ChapterHeadingLocator
): string {
  const lines = markdownContent.split('\n')
  let firstContentLine = 0

  while (firstContentLine < lines.length && lines[firstContentLine].trim() === '') {
    firstContentLine += 1
  }

  const firstLine = lines[firstContentLine]
  if (!firstLine) return markdownContent.trim()

  const headingMatch = HEADING_RE.exec(firstLine)
  if (!headingMatch) return markdownContent.trim()

  const generatedTitle = normalizeHeadingTitle(headingMatch[2].trim())
  const targetTitle = normalizeHeadingTitle(locator.title)
  if (generatedTitle !== targetTitle) return markdownContent.trim()

  let contentStart = firstContentLine + 1
  while (contentStart < lines.length && lines[contentStart].trim() === '') {
    contentStart += 1
  }

  return lines.slice(contentStart).join('\n').trim()
}

/**
 * Normalize heading levels in AI-generated markdown so that all sub-headings
 * fall within [targetLevel + 1, min(targetLevel + 2, 4)].
 *
 * When the AI outputs headings at levels higher than the target chapter (e.g. H1/H2
 * for an H3 chapter), these headings "escape" the section boundary and corrupt the
 * document hierarchy.  This function shifts all heading levels by a fixed offset and
 * clamps the result to H4 (the maximum level supported by HEADING_RE).
 */
export function normalizeGeneratedHeadingLevels(
  markdownContent: string,
  targetLevel: ChapterHeadingLocator['level']
): string {
  const expectedMinLevel = targetLevel + 1
  const maxLevel = Math.min(targetLevel + 2, 4) as 1 | 2 | 3 | 4

  const lines = markdownContent.split('\n')
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0

  // First pass: find the minimum heading level present in the content
  let actualMinLevel = Infinity
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
    if (inFence) continue

    const match = HEADING_RE.exec(line)
    if (match) {
      actualMinLevel = Math.min(actualMinLevel, match[1].length)
    }
  }

  // No headings or already within valid range
  if (actualMinLevel === Infinity || actualMinLevel >= expectedMinLevel) {
    return markdownContent
  }

  const offset = expectedMinLevel - actualMinLevel

  console.warn(
    `[chapter-markdown] Heading level normalization triggered: target=${targetLevel}, actualMin=${actualMinLevel}, offset=+${offset}`
  )

  // Second pass: shift heading levels
  inFence = false
  fenceChar = null
  fenceLen = 0

  const result = lines.map((line) => {
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
      return line
    }
    if (inFence) return line

    const match = HEADING_RE.exec(line)
    if (!match) return line

    const originalLevel = match[1].length
    const newLevel = Math.min(originalLevel + offset, maxLevel)
    return '#'.repeat(newLevel) + ' ' + match[2]
  })

  return result.join('\n')
}
