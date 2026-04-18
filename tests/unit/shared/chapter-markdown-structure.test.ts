import { describe, expect, it } from 'vitest'
import {
  findParentHeading,
  findPreviousSiblingHeading,
  getSectionSubtreeBlock,
  indentSectionSubtree,
  insertSiblingAfterSection,
  outdentSectionSubtree,
} from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const loc = (title: string, level: 1 | 2 | 3 | 4, occurrenceIndex = 0): ChapterHeadingLocator => ({
  title,
  level,
  occurrenceIndex,
})

describe('@story-11-3 chapter-markdown structure helpers', () => {
  describe('getSectionSubtreeBlock', () => {
    it('@p0 captures heading + body until shallower heading', () => {
      const md = '# A\nbody A\n## A.1\nbody A1\n# B\nbody B\n'
      const block = getSectionSubtreeBlock(md, loc('A', 1))
      expect(block).not.toBeNull()
      expect(block!.heading.lineIndex).toBe(0)
      expect(block!.endLineIndex).toBe(4)
      expect(block!.lines).toEqual(['# A', 'body A', '## A.1', 'body A1'])
    })

    it('@p1 includes deeply nested descendants', () => {
      const md = '## A\n### A.1\n#### A.1.1\n## B\n'
      const block = getSectionSubtreeBlock(md, loc('A', 2))
      expect(block!.lines).toEqual(['## A', '### A.1', '#### A.1.1'])
    })

    it('@p1 returns null for unknown locator', () => {
      expect(getSectionSubtreeBlock('# X\n', loc('Y', 1))).toBeNull()
    })
  })

  describe('findPreviousSiblingHeading / findParentHeading', () => {
    it('@p0 finds previous sibling at same level under same parent', () => {
      const md = '## A\n### A.1\n## B\n'
      const prev = findPreviousSiblingHeading(md, loc('B', 2))
      expect(prev?.title).toBe('A')
    })

    it('@p0 returns null when no previous sibling', () => {
      const md = '## A\n### A.1\n'
      expect(findPreviousSiblingHeading(md, loc('A', 2))).toBeNull()
      expect(findPreviousSiblingHeading(md, loc('A.1', 3))).toBeNull()
    })

    it('@p0 finds parent heading at shallower level', () => {
      const md = '## A\n### A.1\n#### A.1.1\n'
      expect(findParentHeading(md, loc('A.1.1', 4))?.title).toBe('A.1')
    })

    it('@p1 returns null for top-level node', () => {
      expect(findParentHeading('# A\n', loc('A', 1))).toBeNull()
    })
  })

  describe('insertSiblingAfterSection', () => {
    it('@p0 inserts new heading after subtree at same level', () => {
      const md = '## A\nbody A\n### A.1\nbody A1\n## B\n'
      const out = insertSiblingAfterSection(md, loc('A', 2))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown).toBe('## A\nbody A\n### A.1\nbody A1\n\n## 新章节\n\n## B\n')
      expect(out.result.affectedLevel).toBe(2)
      expect(out.result.insertedTitle).toBe('新章节')
    })

    it('@p0 honors caller-provided title', () => {
      const md = '# A\n'
      const out = insertSiblingAfterSection(md, loc('A', 1), '自定义')
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown).toContain('# 自定义')
    })

    it('@p1 returns not-found when locator missing', () => {
      const out = insertSiblingAfterSection('# A\n', loc('Z', 1))
      expect(out).toEqual({ ok: false, reason: 'not-found' })
    })
  })

  describe('indentSectionSubtree', () => {
    it('@p0 indents single heading and rewrites level', () => {
      const md = '## A\n## B\nbody B\n'
      const out = indentSectionSubtree(md, loc('B', 2))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown).toBe('## A\n### B\nbody B\n')
      expect(out.result.affectedLevel).toBe(3)
    })

    it('@p0 indents whole subtree, preserving relative depth (no H4)', () => {
      const md = '# A\n## B\n## C\n### C.1\n'
      const out = indentSectionSubtree(md, loc('C', 2))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown).toBe('# A\n## B\n### C\n#### C.1\n')
    })

    it('@p0 rejects max-depth when shift would push past H4', () => {
      const md = '## A\n## B\n### B.1\n#### B.1.1\n'
      const out = indentSectionSubtree(md, loc('B', 2))
      expect(out).toEqual({ ok: false, reason: 'max-depth' })
    })

    it('@p1 rejects when no previous sibling (boundary no-op)', () => {
      const md = '## A\n### A.1\n'
      const out = indentSectionSubtree(md, loc('A.1', 3))
      expect(out).toEqual({ ok: false, reason: 'no-previous-sibling' })
    })
  })

  describe('outdentSectionSubtree', () => {
    it('@p0 outdents to grandparent and shifts levels', () => {
      const md = '## A\n### A.1\nbody A1\n## B\n'
      const out = outdentSectionSubtree(md, loc('A.1', 3))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown).toBe('## A\n\n## A.1\nbody A1\n## B\n')
      expect(out.result.affectedLevel).toBe(2)
    })

    it('@p0 keeps trailing siblings under former parent', () => {
      const md = '## A\n### A.1\n### A.2\n## B\n'
      const out = outdentSectionSubtree(md, loc('A.1', 3))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.result.markdown.split('\n').filter((l) => l.startsWith('#'))).toEqual([
        '## A',
        '### A.2',
        '## A.1',
        '## B',
      ])
    })

    it('@p1 rejects already-top-level', () => {
      const out = outdentSectionSubtree('# A\n', loc('A', 1))
      expect(out).toEqual({ ok: false, reason: 'already-top-level' })
    })

    it('@p1 handles duplicate titles via occurrenceIndex', () => {
      const md = '## A\n### A.1\n## A\n### A.1\n'
      const out = outdentSectionSubtree(md, loc('A.1', 3, 1))
      expect(out.ok).toBe(true)
      if (!out.ok) return
      // Second A.1 should have moved out under second A.
      const headings = out.result.markdown.split('\n').filter((l) => l.startsWith('#'))
      expect(headings).toEqual(['## A', '### A.1', '## A', '## A.1'])
    })
  })
})
