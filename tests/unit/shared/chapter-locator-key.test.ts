import { describe, it, expect } from 'vitest'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

describe('createChapterLocatorKey', () => {
  it('creates key in level:title:occurrenceIndex format', () => {
    const locator: ChapterHeadingLocator = { title: '公司简介', level: 2, occurrenceIndex: 0 }
    expect(createChapterLocatorKey(locator)).toBe('2:公司简介:0')
  })

  it('handles titles with colons', () => {
    const locator: ChapterHeadingLocator = {
      title: '第三章：技术方案',
      level: 3,
      occurrenceIndex: 1,
    }
    expect(createChapterLocatorKey(locator)).toBe('3:第三章：技术方案:1')
  })

  it('handles different heading levels', () => {
    const h2: ChapterHeadingLocator = { title: 'Test', level: 2, occurrenceIndex: 0 }
    const h3: ChapterHeadingLocator = { title: 'Test', level: 3, occurrenceIndex: 0 }
    const h4: ChapterHeadingLocator = { title: 'Test', level: 4, occurrenceIndex: 0 }

    expect(createChapterLocatorKey(h2)).toBe('2:Test:0')
    expect(createChapterLocatorKey(h3)).toBe('3:Test:0')
    expect(createChapterLocatorKey(h4)).toBe('4:Test:0')
  })

  it('differentiates by occurrence index for duplicate titles', () => {
    const first: ChapterHeadingLocator = { title: '概述', level: 2, occurrenceIndex: 0 }
    const second: ChapterHeadingLocator = { title: '概述', level: 2, occurrenceIndex: 1 }

    expect(createChapterLocatorKey(first)).toBe('2:概述:0')
    expect(createChapterLocatorKey(second)).toBe('2:概述:1')
    expect(createChapterLocatorKey(first)).not.toBe(createChapterLocatorKey(second))
  })

  it('handles empty title', () => {
    const locator: ChapterHeadingLocator = { title: '', level: 2, occurrenceIndex: 0 }
    expect(createChapterLocatorKey(locator)).toBe('2::0')
  })
})
