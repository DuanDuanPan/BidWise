import { v4 as uuidv4 } from 'uuid'
import type { TenderFormat, TenderSection } from '@shared/analysis-types'
import type { WordSection } from './word-extractor'

interface RawSection {
  title: string
  startIndex: number
  level: number
}

/** Detect "第X章/节/部分" patterns */
const CHAPTER_PATTERN = /^第[一二三四五六七八九十百零\d]+[章节部分]\s*.*/gm

/** Detect "1. / 1.1 / 1.1.1" numbering */
const NUMERIC_L1_PATTERN = /^\d+[.、]\s*.+/gm
const NUMERIC_L2_PATTERN = /^\d+\.\d+\s*.+/gm
const NUMERIC_L3_PATTERN = /^\d+\.\d+\.\d+\s*.+/gm

/** Detect "一、/二、" Chinese numbering */
const CHINESE_NUM_PATTERN = /^[一二三四五六七八九十]+[、.]\s*.+/gm

/** Common tender keywords used as section titles */
const KEYWORD_TITLES = [
  '总则',
  '技术要求',
  '评分标准',
  '评分办法',
  '商务条款',
  '投标须知',
  '资格要求',
  '投标人须知',
  '招标范围',
  '合同条款',
  '投标文件格式',
]

function collectMatches(text: string, pattern: RegExp, level: number): RawSection[] {
  const sections: RawSection[] = []
  let match: RegExpExecArray | null
  // Reset lastIndex for global regex
  pattern.lastIndex = 0
  while ((match = pattern.exec(text)) !== null) {
    sections.push({
      title: match[0].trim(),
      startIndex: match.index,
      level,
    })
  }
  return sections
}

function detectKeywordSections(text: string): RawSection[] {
  const sections: RawSection[] = []
  for (const kw of KEYWORD_TITLES) {
    const idx = text.indexOf(kw)
    if (idx !== -1) {
      // Only match if keyword is at start of a line
      const lineStart = text.lastIndexOf('\n', idx) + 1
      const prefix = text.slice(lineStart, idx).trim()
      if (prefix.length === 0 || /^[一二三四五六七八九十\d]+[.、]?\s*$/.test(prefix)) {
        sections.push({ title: kw, startIndex: idx, level: 1 })
      }
    }
  }
  return sections
}

function buildTenderSections(
  text: string,
  rawSections: RawSection[],
  totalPages: number
): TenderSection[] {
  if (rawSections.length === 0) {
    return [
      {
        id: uuidv4(),
        title: '全文',
        content: text,
        pageStart: 1,
        pageEnd: totalPages || 1,
        level: 1,
      },
    ]
  }

  // Sort by position in text
  rawSections.sort((a, b) => a.startIndex - b.startIndex)

  // Deduplicate overlapping sections (same start position → keep higher priority / lower level)
  const deduped: RawSection[] = []
  for (const sec of rawSections) {
    const last = deduped[deduped.length - 1]
    if (last && Math.abs(last.startIndex - sec.startIndex) < 5) {
      // Keep the one with lower level number (higher hierarchy)
      if (sec.level < last.level) {
        deduped[deduped.length - 1] = sec
      }
      continue
    }
    deduped.push(sec)
  }

  // Estimate page numbers from character position
  const charsPerPage = totalPages > 0 ? text.length / totalPages : text.length

  return deduped.map((sec, idx) => {
    const nextStart = idx + 1 < deduped.length ? deduped[idx + 1].startIndex : text.length
    const content = text.slice(sec.startIndex, nextStart).trim()
    const pageStart = charsPerPage > 0 ? Math.max(1, Math.ceil(sec.startIndex / charsPerPage)) : 1
    const pageEnd = charsPerPage > 0 ? Math.max(pageStart, Math.ceil(nextStart / charsPerPage)) : 1

    return {
      id: uuidv4(),
      title: sec.title,
      content,
      pageStart,
      pageEnd: Math.min(pageEnd, totalPages || pageEnd),
      level: sec.level,
    }
  })
}

/**
 * Detect sections in tender document text.
 *
 * PDF path: pure regex + heuristic rules.
 * Word path: prefer HTML heading structure, fallback to regex.
 */
export function detectSections(
  text: string,
  format: TenderFormat,
  totalPages: number,
  htmlSections?: WordSection[]
): TenderSection[] {
  // Word path: use HTML heading structure if available
  if ((format === 'docx' || format === 'doc') && htmlSections && htmlSections.length > 0) {
    return htmlSections.map((sec) => ({
      id: uuidv4(),
      title: sec.title,
      content: sec.content,
      pageStart: 1,
      pageEnd: totalPages || 1,
      level: sec.level,
    }))
  }

  // PDF / fallback: regex-based detection
  const allSections: RawSection[] = [
    ...collectMatches(text, CHAPTER_PATTERN, 1),
    ...collectMatches(text, NUMERIC_L1_PATTERN, 1),
    ...collectMatches(text, NUMERIC_L2_PATTERN, 2),
    ...collectMatches(text, NUMERIC_L3_PATTERN, 3),
    ...collectMatches(text, CHINESE_NUM_PATTERN, 1),
    ...detectKeywordSections(text),
  ]

  return buildTenderSections(text, allSections, totalPages)
}
