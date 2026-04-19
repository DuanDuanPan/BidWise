import { stripMarkdown } from '@platejs/markdown'
import type { ChapterHeadingLocator, RestoreAnchor } from './chapter-types'
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

/**
 * Count markdown characters using the same rule as the renderer status bar
 * (Story 11.4). Chinese characters are counted individually; markdown syntax
 * markers, code fences, list/table decorations and whitespace are stripped.
 * Kept here (shared) so main-side Undo toast summaries stay in lockstep with
 * `useWordCount()` — never let the two sides drift.
 */
export function countChapterCharacters(markdown: string): number {
  if (!markdown) return 0

  let text = stripFencedCodeBlocks(markdown)
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/\*{1,3}/g, '')
  text = text.replace(/(?<![\p{L}\p{N}_])_{1,3}|_{1,3}(?![\p{L}\p{N}_])/gu, '')
  text = text.replace(/~~/g, '')
  text = text.replace(/`/g, '')
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/^\|?[-:|][-:||\s]*$/gm, '')
  text = text.replace(/\|/g, '')
  text = text.replace(/^>\s*/gm, '')
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')
  text = text.replace(/^[\s]*\d+\.\s+/gm, '')
  text = text.replace(/^[-*_]{3,}$/gm, '')
  text = text.replace(/\s/g, '')
  return text.length
}

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
    if (!inFence) keptLines.push(line)
  }

  return keptLines.join('\n')
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

// ─── Story 11.3: 结构变更 subtree helper ─────────────────────────────────────

export type HeadingLevel = ChapterHeadingLocator['level']
export const MAX_HEADING_LEVEL: HeadingLevel = 4

/** 默认新章节标题 (Story 3.3 先例)。 */
export const DEFAULT_NEW_SECTION_TITLE = '新章节'

export interface SectionSubtreeBlock {
  heading: MarkdownHeadingInfo
  /** Exclusive end line index — points to the first line AFTER the subtree. */
  endLineIndex: number
  /** Raw markdown lines of the subtree, including the heading line. */
  lines: string[]
}

/**
 * Return the contiguous markdown block representing a heading and every
 * descendant (nested headings + their bodies). Stops at the first subsequent
 * heading with level ≤ target level, or at EOF.
 */
export function getSectionSubtreeBlock(
  markdown: string,
  locator: ChapterHeadingLocator
): SectionSubtreeBlock | null {
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
    endLineIndex,
    lines: lines.slice(heading.lineIndex, endLineIndex),
  }
}

/**
 * Locate the previous sibling heading (same level, under the same immediate
 * parent). Returns `null` at top-of-document boundary.
 */
export function findPreviousSiblingHeading(
  markdown: string,
  locator: ChapterHeadingLocator
): MarkdownHeadingInfo | null {
  const headings = extractMarkdownHeadings(markdown)
  const target = findMarkdownHeading(headings, locator)
  if (!target) return null

  let candidate: MarkdownHeadingInfo | null = null
  for (const h of headings) {
    if (h.lineIndex >= target.lineIndex) break
    if (h.level < target.level) {
      // New shallower ancestor — resets sibling search under that ancestor.
      candidate = null
    } else if (h.level === target.level) {
      candidate = h
    }
  }
  return candidate
}

/**
 * Locate the immediate parent heading. Returns `null` when target is already at
 * H1 (no parent possible).
 */
export function findParentHeading(
  markdown: string,
  locator: ChapterHeadingLocator
): MarkdownHeadingInfo | null {
  const headings = extractMarkdownHeadings(markdown)
  const target = findMarkdownHeading(headings, locator)
  if (!target || target.level === 1) return null

  let candidate: MarkdownHeadingInfo | null = null
  for (const h of headings) {
    if (h.lineIndex >= target.lineIndex) break
    if (h.level < target.level) {
      candidate = h
    }
  }
  return candidate
}

function shiftHeadingLevels(
  lines: string[],
  delta: number
): { ok: true; lines: string[] } | { ok: false; reason: 'max-depth' | 'min-depth' } {
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0

  const out: string[] = []
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
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    const match = HEADING_RE.exec(line)
    if (!match) {
      out.push(line)
      continue
    }
    const newLevel = match[1].length + delta
    if (newLevel > MAX_HEADING_LEVEL) return { ok: false, reason: 'max-depth' }
    if (newLevel < 1) return { ok: false, reason: 'min-depth' }
    out.push('#'.repeat(newLevel) + ' ' + match[2])
  }
  return { ok: true, lines: out }
}

export interface StructureMutationResult {
  markdown: string
  /** New heading's line index (insert) or moved heading's new line index (indent/outdent). */
  affectedLineIndex: number
  /** Resulting level of the heading that was inserted / moved. */
  affectedLevel: HeadingLevel
  /** Inserted heading's raw title (only for insertSibling). */
  insertedTitle?: string
}

export type StructureMutationError =
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'no-previous-sibling' }
  | { ok: false; reason: 'already-top-level' }
  | { ok: false; reason: 'max-depth' }
  | { ok: false; reason: 'min-depth' }

/**
 * Insert a new heading at the same level immediately after the current
 * section's subtree. Default title is `新章节` (Story 3.3 convention).
 * Produces a clean `\n\n# 新章节\n` block so subsequent autosaves stay valid.
 */
export function insertSiblingAfterSection(
  markdown: string,
  locator: ChapterHeadingLocator,
  title: string = DEFAULT_NEW_SECTION_TITLE
): { ok: true; result: StructureMutationResult } | { ok: false; reason: 'not-found' } {
  const block = getSectionSubtreeBlock(markdown, locator)
  if (!block) return { ok: false, reason: 'not-found' }

  const lines = markdown.split('\n')
  const headingLine = '#'.repeat(block.heading.level) + ' ' + title
  const head = lines.slice(0, block.endLineIndex)
  const tail = lines.slice(block.endLineIndex)

  // Ensure blank line separation before new heading.
  const needsLeadingBlank = head.length > 0 && head[head.length - 1].trim() !== ''
  const insertedLineIndex = head.length + (needsLeadingBlank ? 1 : 0)
  const middle: string[] = []
  if (needsLeadingBlank) middle.push('')
  middle.push(headingLine)
  // Ensure blank line after inserted heading (before continuation) so editor
  // parsing keeps the heading on its own block.
  if (tail.length === 0 || tail[0].trim() !== '') {
    middle.push('')
  }

  return {
    ok: true,
    result: {
      markdown: [...head, ...middle, ...tail].join('\n'),
      affectedLineIndex: insertedLineIndex,
      affectedLevel: block.heading.level,
      insertedTitle: title,
    },
  }
}

/**
 * Demote a section and every descendant by one level, moving the whole subtree
 * to become the final child of the previous sibling. No-op on boundaries.
 */
export function indentSectionSubtree(
  markdown: string,
  locator: ChapterHeadingLocator
): { ok: true; result: StructureMutationResult } | StructureMutationError {
  const prevSibling = findPreviousSiblingHeading(markdown, locator)
  if (!prevSibling) {
    const block = getSectionSubtreeBlock(markdown, locator)
    return { ok: false, reason: block ? 'no-previous-sibling' : 'not-found' }
  }
  const block = getSectionSubtreeBlock(markdown, locator)
  if (!block) return { ok: false, reason: 'not-found' }

  const shifted = shiftHeadingLevels(block.lines, 1)
  if (!shifted.ok) return { ok: false, reason: 'max-depth' }

  // The subtree of prev sibling ends where the next heading at level ≤ prev
  // level appears. We splice target block to that boundary (so it becomes the
  // final child of prev sibling). Because target is the NEXT sibling, its
  // current position IS that boundary — so indenting just rewrites levels in
  // place. Confirmed by AC1 spec ("缩进为前一个同级兄弟的最后一个子节点").
  const lines = markdown.split('\n')
  const before = lines.slice(0, block.heading.lineIndex)
  const after = lines.slice(block.endLineIndex)
  const nextMarkdown = [...before, ...shifted.lines, ...after].join('\n')
  return {
    ok: true,
    result: {
      markdown: nextMarkdown,
      affectedLineIndex: block.heading.lineIndex,
      affectedLevel: (block.heading.level + 1) as HeadingLevel,
    },
  }
}

/**
 * Promote a section and every descendant by one level, moving the subtree to
 * become the next sibling of its former parent. No-op when already at top.
 */
export function outdentSectionSubtree(
  markdown: string,
  locator: ChapterHeadingLocator
): { ok: true; result: StructureMutationResult } | StructureMutationError {
  const block = getSectionSubtreeBlock(markdown, locator)
  if (!block) return { ok: false, reason: 'not-found' }
  if (block.heading.level === 1) return { ok: false, reason: 'already-top-level' }

  const parent = findParentHeading(markdown, locator)
  if (!parent) return { ok: false, reason: 'already-top-level' }

  const parentLocator: ChapterHeadingLocator = {
    title: parent.title,
    level: parent.level,
    occurrenceIndex: parent.occurrenceIndex,
  }
  const parentBlock = getSectionSubtreeBlock(markdown, parentLocator)
  if (!parentBlock) return { ok: false, reason: 'not-found' }

  const shifted = shiftHeadingLevels(block.lines, -1)
  if (!shifted.ok) return { ok: false, reason: shifted.reason }

  const lines = markdown.split('\n')
  // Remove block from current location.
  const withoutBlock = [
    ...lines.slice(0, block.heading.lineIndex),
    ...lines.slice(block.endLineIndex),
  ]
  // Adjust parent subtree end: because block lived INSIDE the parent subtree,
  // parentBlock.endLineIndex > block.endLineIndex except when block was the
  // final descendant. Recompute parent subtree end on the reduced array.
  const removedCount = block.endLineIndex - block.heading.lineIndex
  const newParentEnd = parentBlock.endLineIndex - removedCount

  const before = withoutBlock.slice(0, newParentEnd)
  const after = withoutBlock.slice(newParentEnd)
  const needsLeadingBlank = before.length > 0 && before[before.length - 1].trim() !== ''
  const middle = needsLeadingBlank ? ['', ...shifted.lines] : shifted.lines
  const nextLines = [...before, ...middle, ...after]
  return {
    ok: true,
    result: {
      markdown: nextLines.join('\n'),
      affectedLineIndex: before.length + (needsLeadingBlank ? 1 : 0),
      affectedLevel: (block.heading.level - 1) as HeadingLevel,
    },
  }
}

// ─── Story 11.9: insertChild + moveSubtree (persisted DnD real contract) ────

/**
 * Insert a new heading as the LAST child of `parentLocator`. When the parent
 * already has descendants the new heading goes after the parent subtree's last
 * own-child; when the parent has no children it goes directly after the parent
 * line. Rejects with `max-depth` when the new level would exceed H4.
 */
export function insertChildAtEnd(
  markdown: string,
  parentLocator: ChapterHeadingLocator,
  title: string = DEFAULT_NEW_SECTION_TITLE
):
  | { ok: true; result: StructureMutationResult }
  | { ok: false; reason: 'not-found' | 'max-depth' } {
  const parentBlock = getSectionSubtreeBlock(markdown, parentLocator)
  if (!parentBlock) return { ok: false, reason: 'not-found' }
  const newLevel = (parentBlock.heading.level + 1) as HeadingLevel
  if (newLevel > MAX_HEADING_LEVEL) return { ok: false, reason: 'max-depth' }

  const lines = markdown.split('\n')
  // Insert position is exactly the parent subtree end — appends after any
  // existing descendants, keeping ordering contiguous.
  const insertPos = parentBlock.endLineIndex
  const head = lines.slice(0, insertPos)
  const tail = lines.slice(insertPos)

  const headingLine = '#'.repeat(newLevel) + ' ' + title
  const needsLeadingBlank = head.length > 0 && head[head.length - 1].trim() !== ''
  const insertedLineIndex = head.length + (needsLeadingBlank ? 1 : 0)
  const middle: string[] = []
  if (needsLeadingBlank) middle.push('')
  middle.push(headingLine)
  if (tail.length === 0 || tail[0].trim() !== '') {
    middle.push('')
  }

  return {
    ok: true,
    result: {
      markdown: [...head, ...middle, ...tail].join('\n'),
      affectedLineIndex: insertedLineIndex,
      affectedLevel: newLevel,
      insertedTitle: title,
    },
  }
}

export type MoveSubtreePlacement = 'before' | 'after' | 'inside'

export type MoveSubtreeError =
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'cycle' }
  | { ok: false; reason: 'max-depth' }
  | { ok: false; reason: 'min-depth' }
  | { ok: false; reason: 'same-position' }

/**
 * Move a section + descendants to a new position relative to `dropLocator`.
 *
 * - `before`: drag becomes immediate previous sibling of drop (level = drop.level).
 * - `after` : drag becomes immediate next sibling of drop (level = drop.level).
 * - `inside`: drag becomes the LAST child of drop (level = drop.level + 1).
 *
 * Cycles (drop inside drag subtree) are rejected. Depth overflow (drag subtree
 * bottom > H4 after shift) is rejected. When the move is a no-op (drag already
 * at target position), returns `same-position` so callers can skip commit.
 */
export function moveSubtreeInMarkdown(
  markdown: string,
  dragLocator: ChapterHeadingLocator,
  dropLocator: ChapterHeadingLocator,
  placement: MoveSubtreePlacement
): { ok: true; result: StructureMutationResult } | MoveSubtreeError {
  const dragBlock = getSectionSubtreeBlock(markdown, dragLocator)
  if (!dragBlock) return { ok: false, reason: 'not-found' }
  const dropBlock = getSectionSubtreeBlock(markdown, dropLocator)
  if (!dropBlock) return { ok: false, reason: 'not-found' }

  // Cycle guard: drop must not live inside drag subtree.
  if (
    dropBlock.heading.lineIndex >= dragBlock.heading.lineIndex &&
    dropBlock.heading.lineIndex < dragBlock.endLineIndex
  ) {
    return { ok: false, reason: 'cycle' }
  }

  const targetLevel: HeadingLevel =
    placement === 'inside'
      ? ((dropBlock.heading.level + 1) as HeadingLevel)
      : (dropBlock.heading.level as HeadingLevel)
  if (targetLevel > MAX_HEADING_LEVEL) return { ok: false, reason: 'max-depth' }
  if (targetLevel < 1) return { ok: false, reason: 'min-depth' }

  const delta = targetLevel - dragBlock.heading.level
  const shifted = shiftHeadingLevels(dragBlock.lines, delta)
  if (!shifted.ok) return { ok: false, reason: shifted.reason }

  const lines = markdown.split('\n')
  const linesAfterRemove = [
    ...lines.slice(0, dragBlock.heading.lineIndex),
    ...lines.slice(dragBlock.endLineIndex),
  ]

  // Re-resolve drop block on the reduced document — its position may have
  // shifted when the drag block was above it.
  const reducedMarkdown = linesAfterRemove.join('\n')
  const drop2 = getSectionSubtreeBlock(reducedMarkdown, dropLocator)
  if (!drop2) return { ok: false, reason: 'not-found' }

  let insertAt: number
  if (placement === 'before') {
    insertAt = drop2.heading.lineIndex
  } else {
    // 'after' and 'inside' both splice at the END of the drop subtree — for
    // 'inside' the higher `targetLevel` ensures the block gets parsed as a
    // descendant of drop; for 'after' the equal level makes it a next sibling.
    insertAt = drop2.endLineIndex
  }

  // Same-position short-circuit: if the moved block is already at the exact
  // computed insert target (same lines, same level), skip to avoid a no-op
  // commit that would still rewrite proposal.md.
  const reducedLines = reducedMarkdown.split('\n')
  const needsLeadingBlank =
    insertAt > 0 && reducedLines.length > 0 && reducedLines[insertAt - 1]?.trim() !== ''
  const insertedLineIndex = insertAt + (needsLeadingBlank ? 1 : 0)
  const middle: string[] = []
  if (needsLeadingBlank) middle.push('')
  middle.push(...shifted.lines)
  // Ensure a blank line separates the moved block from whatever follows.
  if (insertAt < reducedLines.length && reducedLines[insertAt]?.trim() !== '') {
    middle.push('')
  }

  const nextLines = [...reducedLines.slice(0, insertAt), ...middle, ...reducedLines.slice(insertAt)]
  const nextMarkdown = nextLines.join('\n')

  if (nextMarkdown === markdown) return { ok: false, reason: 'same-position' }

  return {
    ok: true,
    result: {
      markdown: nextMarkdown,
      affectedLineIndex: insertedLineIndex,
      affectedLevel: targetLevel,
    },
  }
}

// ─── Story 11.4: subtree extract / remove / restore ──────────────────────────

export interface SectionSubtreeExtract {
  subtreeMarkdown: string
  remainderMarkdown: string
  restoreAnchor: Pick<RestoreAnchor, 'previousHeadingLocator'>
  totalWordCount: number
  headings: MarkdownHeadingInfo[]
}

function headingLocator(heading: MarkdownHeadingInfo): ChapterHeadingLocator {
  return {
    title: heading.title,
    level: heading.level,
    occurrenceIndex: heading.occurrenceIndex,
  }
}

/**
 * Extract a heading's full subtree (heading line + descendants) from
 * `markdown` and return the document with that subtree removed plus a
 * structural anchor for Undo. Preserves duplicate-heading semantics by
 * routing through `findMarkdownHeading` + `occurrenceIndex`.
 */
export function extractSectionSubtree(
  markdown: string,
  locator: ChapterHeadingLocator
): SectionSubtreeExtract | null {
  const block = getSectionSubtreeBlock(markdown, locator)
  if (!block) return null

  const headings = extractMarkdownHeadings(markdown)
  const subtreeHeadings = headings.filter(
    (h) => h.lineIndex >= block.heading.lineIndex && h.lineIndex < block.endLineIndex
  )

  let previousHeading: MarkdownHeadingInfo | null = null
  for (const h of headings) {
    if (h.lineIndex >= block.heading.lineIndex) break
    previousHeading = h
  }

  const lines = markdown.split('\n')
  const remainderLines = [
    ...lines.slice(0, block.heading.lineIndex),
    ...lines.slice(block.endLineIndex),
  ]
  const subtreeMarkdown = block.lines.join('\n')

  return {
    subtreeMarkdown,
    remainderMarkdown: remainderLines.join('\n'),
    restoreAnchor: {
      previousHeadingLocator: previousHeading ? headingLocator(previousHeading) : null,
    },
    totalWordCount: countChapterCharacters(subtreeMarkdown),
    headings: subtreeHeadings,
  }
}

/**
 * Batch variant: extract several subtrees in document order, returning the
 * remainder + one extract per locator. Non-resolvable locators yield a `null`
 * slot so callers can correlate input ↔ output by index.
 *
 * Duplicate-heading safety: each extraction is re-resolved against the current
 * (progressively reduced) markdown, so later locators see the document after
 * earlier subtrees have already been sliced out.
 */
export function removeSectionSubtrees(
  markdown: string,
  locators: ChapterHeadingLocator[]
): { remainderMarkdown: string; extracts: Array<SectionSubtreeExtract | null> } {
  let current = markdown
  const extracts: Array<SectionSubtreeExtract | null> = []
  for (const locator of locators) {
    const extract = extractSectionSubtree(current, locator)
    if (!extract) {
      extracts.push(null)
      continue
    }
    extracts.push(extract)
    current = extract.remainderMarkdown
  }
  return { remainderMarkdown: current, extracts }
}

/**
 * Splice a previously extracted subtree back into `markdown` using the
 * `restoreAnchor` captured at extraction time. Resolution order:
 *
 *  1. `previousHeadingLocator` resolves → insert immediately after that
 *     sibling's current subtree (matches the original sibling ordering).
 *  2. `parentHeadingLocator` resolves with no previous sibling → prepend
 *     as first child of parent, i.e. insert before the parent's first
 *     existing descendant heading (or right after the parent heading line
 *     when parent currently has no descendants).
 *  3. Neither resolves → prepend at top of document.
 *
 * The caller is responsible for passing the parent locator when it still
 * exists; the service derives it from the current `sectionIndex`.
 */
export function restoreSectionSubtree(
  markdown: string,
  subtreeMarkdown: string,
  anchor: {
    previousHeadingLocator?: ChapterHeadingLocator | null
    parentHeadingLocator?: ChapterHeadingLocator | null
  }
): string {
  const subtreeLines = subtreeMarkdown.split('\n')
  const lines = markdown.split('\n')
  const insertAt = resolveRestoreInsertionPoint(markdown, anchor)
  const head = lines.slice(0, insertAt)
  const tail = lines.slice(insertAt)
  return [...head, ...subtreeLines, ...tail].join('\n')
}

function resolveRestoreInsertionPoint(
  markdown: string,
  anchor: {
    previousHeadingLocator?: ChapterHeadingLocator | null
    parentHeadingLocator?: ChapterHeadingLocator | null
  }
): number {
  if (anchor.previousHeadingLocator) {
    const prevBlock = getSectionSubtreeBlock(markdown, anchor.previousHeadingLocator)
    if (prevBlock) return prevBlock.endLineIndex
  }
  if (anchor.parentHeadingLocator) {
    const parentBlock = getSectionSubtreeBlock(markdown, anchor.parentHeadingLocator)
    if (parentBlock) {
      // Deleted node had no previous sibling → it was the FIRST child of
      // parent. Using `parentBlock.endLineIndex` would append AFTER every
      // surviving sibling, flipping sibling order on restore. Instead,
      // anchor at the first descendant heading inside the parent block so
      // the restored subtree lands back at the head of the child list.
      const headings = extractMarkdownHeadings(markdown)
      const firstDescendant = headings.find(
        (h) => h.lineIndex > parentBlock.heading.lineIndex && h.lineIndex < parentBlock.endLineIndex
      )
      if (firstDescendant) return firstDescendant.lineIndex
      return parentBlock.endLineIndex
    }
  }
  return 0
}
