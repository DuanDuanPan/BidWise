import { describe, it, expect } from 'vitest'
import {
  countChapterCharacters,
  extractSectionSubtree,
  removeSectionSubtrees,
  restoreSectionSubtree,
} from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

describe('@story-11-4 countChapterCharacters', () => {
  it('counts Chinese characters individually', () => {
    expect(countChapterCharacters('中文字符计数')).toBe(6)
  })

  it('strips fenced code blocks', () => {
    const md = ['正文前', '```python', 'print("hello")', '```', '正文后'].join('\n')
    expect(countChapterCharacters(md)).toBe(6)
  })

  it('strips heading markers and whitespace', () => {
    expect(countChapterCharacters('### 公司简介\n\n正文段落')).toBe(8)
  })

  it('treats empty input as zero', () => {
    expect(countChapterCharacters('')).toBe(0)
  })
})

describe('@story-11-4 extractSectionSubtree', () => {
  it('returns heading + descendants + remainder and word count', () => {
    const md = [
      '# 公司',
      '',
      '## 业务',
      '方案正文A',
      '',
      '## 资质',
      '方案正文B',
      '',
      '# 附录',
      '尾段',
    ].join('\n')
    const locator: ChapterHeadingLocator = { title: '业务', level: 2, occurrenceIndex: 0 }
    const extract = extractSectionSubtree(md, locator)
    expect(extract).not.toBeNull()
    expect(extract!.subtreeMarkdown.split('\n')).toEqual(['## 业务', '方案正文A', ''])
    expect(extract!.remainderMarkdown).toBe(
      ['# 公司', '', '## 资质', '方案正文B', '', '# 附录', '尾段'].join('\n')
    )
    expect(extract!.restoreAnchor.previousHeadingLocator).toEqual({
      title: '公司',
      level: 1,
      occurrenceIndex: 0,
    })
    expect(extract!.totalWordCount).toBe(countChapterCharacters(extract!.subtreeMarkdown))
    expect(extract!.headings).toHaveLength(1)
  })

  it('extracts nested descendants together with the root', () => {
    const md = ['## A', '正文A', '### A1', '正文A1', '## B', '正文B'].join('\n')
    const extract = extractSectionSubtree(md, {
      title: 'A',
      level: 2,
      occurrenceIndex: 0,
    })
    expect(extract).not.toBeNull()
    expect(extract!.headings.map((h) => h.title)).toEqual(['A', 'A1'])
    expect(extract!.remainderMarkdown).toBe(['## B', '正文B'].join('\n'))
  })

  it('disambiguates duplicate titles via occurrenceIndex', () => {
    const md = ['## 公共', '第一段', '## 其他', '其他段', '## 公共', '第二段'].join('\n')
    const first = extractSectionSubtree(md, {
      title: '公共',
      level: 2,
      occurrenceIndex: 0,
    })
    const second = extractSectionSubtree(md, {
      title: '公共',
      level: 2,
      occurrenceIndex: 1,
    })
    expect(first!.subtreeMarkdown).toContain('第一段')
    expect(first!.subtreeMarkdown).not.toContain('第二段')
    expect(second!.subtreeMarkdown).toContain('第二段')
    expect(second!.subtreeMarkdown).not.toContain('第一段')
  })

  it('returns null when locator is missing', () => {
    expect(
      extractSectionSubtree('# 仅此一节', { title: '不存在', level: 2, occurrenceIndex: 0 })
    ).toBeNull()
  })
})

describe('@story-11-4 removeSectionSubtrees', () => {
  it('removes multiple subtrees in document order', () => {
    const md = ['## A', '段A', '## B', '段B', '## C', '段C'].join('\n')
    const { remainderMarkdown, extracts } = removeSectionSubtrees(md, [
      { title: 'A', level: 2, occurrenceIndex: 0 },
      { title: 'C', level: 2, occurrenceIndex: 0 },
    ])
    expect(extracts.every((e) => e !== null)).toBe(true)
    expect(remainderMarkdown).toBe(['## B', '段B'].join('\n'))
  })

  it('records null slot for unresolved locators', () => {
    const md = '## A\n段A'
    const { extracts } = removeSectionSubtrees(md, [
      { title: 'missing', level: 2, occurrenceIndex: 0 },
    ])
    expect(extracts).toEqual([null])
  })
})

describe('@story-11-4 restoreSectionSubtree', () => {
  it('re-inserts subtree after the previous sibling locator', () => {
    const original = ['## A', '段A', '## B', '段B', '## C', '段C'].join('\n')
    const extract = extractSectionSubtree(original, {
      title: 'B',
      level: 2,
      occurrenceIndex: 0,
    })!
    const restored = restoreSectionSubtree(extract.remainderMarkdown, extract.subtreeMarkdown, {
      previousHeadingLocator: extract.restoreAnchor.previousHeadingLocator,
    })
    expect(restored).toBe(original)
  })

  it('falls back to parent locator when previous sibling cannot be resolved', () => {
    const md = ['# 根', '前段'].join('\n')
    const subtree = ['## 新章', '段'].join('\n')
    const restored = restoreSectionSubtree(md, subtree, {
      previousHeadingLocator: { title: '不存在', level: 2, occurrenceIndex: 0 },
      parentHeadingLocator: { title: '根', level: 1, occurrenceIndex: 0 },
    })
    expect(restored).toBe(['# 根', '前段', '## 新章', '段'].join('\n'))
  })

  it('prepends at document start when no anchor resolves', () => {
    const md = '# 首节\n正文'
    const subtree = '## 孤块\n孤段'
    const restored = restoreSectionSubtree(md, subtree, {
      previousHeadingLocator: null,
      parentHeadingLocator: null,
    })
    expect(restored.startsWith('## 孤块\n孤段')).toBe(true)
    expect(restored).toContain('# 首节')
  })

  it('round-trips for a duplicate-title subtree', () => {
    const md = ['## 公共', '第一段', '## 其他', '其他段', '## 公共', '第二段'].join('\n')
    const locator: ChapterHeadingLocator = { title: '公共', level: 2, occurrenceIndex: 1 }
    const extract = extractSectionSubtree(md, locator)!
    const restored = restoreSectionSubtree(extract.remainderMarkdown, extract.subtreeMarkdown, {
      previousHeadingLocator: extract.restoreAnchor.previousHeadingLocator,
    })
    expect(restored).toBe(md)
  })

  it('prepends as first child of parent when no previous sibling (bug: 二、一)', () => {
    // User scenario: 新建章节一、二 → 删除章节一 → 撤销 → 必须恢复为 一、二。
    // Before the fix `parentBlock.endLineIndex` appended after 章节二, flipping
    // sibling order to 二、一 in both markdown and markdown-driven outline.
    const original = ['# 项目标书', '## 章节一', '段一', '## 章节二', '段二'].join('\n')
    const extract = extractSectionSubtree(original, {
      title: '章节一',
      level: 2,
      occurrenceIndex: 0,
    })!
    // First child of 项目标书 → `computeRestoreAnchor` captures null for
    // previousSibling, so `runUndo` only has the parent locator to anchor on.
    const restored = restoreSectionSubtree(extract.remainderMarkdown, extract.subtreeMarkdown, {
      previousHeadingLocator: null,
      parentHeadingLocator: { title: '项目标书', level: 1, occurrenceIndex: 0 },
    })
    expect(restored).toBe(original)
  })

  it('first-child restore keeps order stable across deeper subtrees', () => {
    const original = ['# 根', '## 章一', '段一', '### 小节', '小段', '## 章二', '段二'].join('\n')
    const remainder = ['# 根', '## 章二', '段二'].join('\n')
    const subtree = ['## 章一', '段一', '### 小节', '小段'].join('\n')
    const restored = restoreSectionSubtree(remainder, subtree, {
      previousHeadingLocator: null,
      parentHeadingLocator: { title: '根', level: 1, occurrenceIndex: 0 },
    })
    expect(restored).toBe(original)
  })
})

describe('@story-11-4 RestoreAnchor serialization', () => {
  it('round-trips through JSON', () => {
    const anchor = {
      parentSectionId: 'p-1',
      previousSiblingSectionId: 's-1',
      previousHeadingLocator: { title: 'A', level: 2 as const, occurrenceIndex: 0 },
    }
    const raw = JSON.stringify(anchor)
    expect(JSON.parse(raw)).toEqual(anchor)
  })
})
