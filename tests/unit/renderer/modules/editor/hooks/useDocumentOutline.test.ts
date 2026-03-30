import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { extractHeadings, buildTree } from '@modules/editor/hooks/useDocumentOutline'
import { useDocumentOutline } from '@modules/editor/hooks/useDocumentOutline'

describe('@story-3-2 useDocumentOutline / extractHeadings', () => {
  it('@p0 extracts H1-H4 headings from markdown', () => {
    const md = '# Title\n## Section\n### Sub\n#### Deep\ntext'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(4)
    expect(headings[0]).toMatchObject({ title: 'Title', level: 1 })
    expect(headings[1]).toMatchObject({ title: 'Section', level: 2 })
    expect(headings[2]).toMatchObject({ title: 'Sub', level: 3 })
    expect(headings[3]).toMatchObject({ title: 'Deep', level: 4 })
  })

  it('@p0 ignores headings inside fenced code blocks (backticks)', () => {
    const md = '# Real\n```\n# Not a heading\n```\n## Also Real'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(2)
    expect(headings[0].title).toBe('Real')
    expect(headings[1].title).toBe('Also Real')
  })

  it('@p0 ignores headings inside fenced code blocks (tildes)', () => {
    const md = '# Real\n~~~\n# Not a heading\n~~~\n## Also Real'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(2)
  })

  it('@p0 tracks occurrenceIndex for same-name headings', () => {
    const md = '## Chapter\ntext\n## Chapter\nmore text\n## Chapter'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(3)
    expect(headings[0].occurrenceIndex).toBe(0)
    expect(headings[1].occurrenceIndex).toBe(1)
    expect(headings[2].occurrenceIndex).toBe(2)
  })

  it('@p0 tracks occurrenceIndex across heading levels for same title', () => {
    const md = '# Intro\n## Intro\n### Intro'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(3)
    expect(headings[0]).toMatchObject({ title: 'Intro', level: 1, occurrenceIndex: 0 })
    expect(headings[1]).toMatchObject({ title: 'Intro', level: 2, occurrenceIndex: 1 })
    expect(headings[2]).toMatchObject({ title: 'Intro', level: 3, occurrenceIndex: 2 })
  })

  it('@p0 strips inline formatting from heading titles', () => {
    const md = '# **Bold Title**\n## *Italic*\n### ~~Struck~~\n#### `code`'
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('Bold Title')
    expect(headings[1].title).toBe('Italic')
    expect(headings[2].title).toBe('Struck')
    expect(headings[3].title).toBe('code')
  })

  it('@p0 strips link syntax from heading titles keeping text', () => {
    const md = '# [Click Here](http://url)'
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('Click Here')
  })

  it('@p0 preserves literal underscores in heading titles', () => {
    const md = '# API_v2\n## my_module_name'
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('API_v2')
    expect(headings[1].title).toBe('my_module_name')
  })

  it('@p0 strips emphasis underscores but preserves mid-word underscores', () => {
    const md = '# _Italic Title_\n## __Bold__ API_v2'
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('Italic Title')
    expect(headings[1].title).toBe('Bold API_v2')
  })

  it('@p0 preserves underscores in Chinese and mixed CJK/ASCII headings', () => {
    const md = '# 模块_名称\n## 标题_v2\n### 系统_设计_文档'
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('模块_名称')
    expect(headings[1].title).toBe('标题_v2')
    expect(headings[2].title).toBe('系统_设计_文档')
  })

  it('@p1 returns empty for empty string', () => {
    expect(extractHeadings('')).toHaveLength(0)
  })

  it('@p1 returns empty for text with no headings', () => {
    expect(extractHeadings('Just some text\nMore text')).toHaveLength(0)
  })

  it('@p1 does not match H5 or H6', () => {
    const md = '##### H5\n###### H6'
    expect(extractHeadings(md)).toHaveLength(0)
  })

  it('@p1 trims heading titles', () => {
    const md = '# Title with spaces  '
    const headings = extractHeadings(md)
    expect(headings[0].title).toBe('Title with spaces')
  })

  it('@p1 stores lineIndex', () => {
    const md = 'text\n# First\nmore\n## Second'
    const headings = extractHeadings(md)
    expect(headings[0].lineIndex).toBe(1)
    expect(headings[1].lineIndex).toBe(3)
  })

  it('@p1 handles unclosed fenced code block (rest is ignored)', () => {
    const md = '# Before\n```\n# Inside\n## Still inside'
    const headings = extractHeadings(md)
    expect(headings).toHaveLength(1)
    expect(headings[0].title).toBe('Before')
  })
})

describe('@story-3-2 useDocumentOutline / buildTree', () => {
  it('@p0 nests H2 under H1', () => {
    const flat = extractHeadings('# Parent\n## Child')
    const tree = buildTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('Parent')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].title).toBe('Child')
  })

  it('@p0 builds multi-level nesting', () => {
    const flat = extractHeadings('# A\n## B\n### C\n## D')
    const tree = buildTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2) // B and D
    expect(tree[0].children[0].children).toHaveLength(1) // C under B
    expect(tree[0].children[1].children).toHaveLength(0) // D has no children
  })

  it('@p0 handles sibling top-level headings', () => {
    const flat = extractHeadings('# First\n# Second\n# Third')
    const tree = buildTree(flat)
    expect(tree).toHaveLength(3)
  })

  it('@p1 returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([])
  })
})

describe('@story-3-2 useDocumentOutline hook', () => {
  it('@p0 updates the outline when markdown headings change', () => {
    const { result, rerender } = renderHook(({ markdown }) => useDocumentOutline(markdown), {
      initialProps: {
        markdown: '# 第一章',
      },
    })

    expect(result.current[0]?.title).toBe('第一章')

    rerender({ markdown: '# 第二章' })

    expect(result.current[0]?.title).toBe('第二章')
  })
})
