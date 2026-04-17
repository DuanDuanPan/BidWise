import { describe, it, expect } from 'vitest'
import { extractMarkdownHeadings, type MarkdownHeadingInfo } from '@shared/chapter-markdown'
import { ancestorChainFromRoot, headingTreeDistance } from '@main/utils/heading-tree-distance'

const SAMPLE = [
  '# Proposal',
  '## 1 Introduction',
  'intro body',
  '## 2 Architecture',
  '### 2.1 Overview',
  'body',
  '### 2.2 Components',
  'body',
  '#### 2.2.1 Auth',
  'body',
  '## 3 Deployment',
  'body',
].join('\n')

describe('@story-3-12 headingTreeDistance', () => {
  const headings = extractMarkdownHeadings(SAMPLE)
  const byTitle = (t: string): MarkdownHeadingInfo => headings.find((h) => h.title === t)!

  it('@p0 identifies ancestor with single hop', () => {
    const { distance, relation } = headingTreeDistance(
      headings,
      byTitle('2.1 Overview'),
      byTitle('2 Architecture')
    )
    expect(relation).toBe('ancestor')
    expect(distance).toBe(1)
  })

  it('@p0 identifies descendant (inverse of ancestor)', () => {
    const { distance, relation } = headingTreeDistance(
      headings,
      byTitle('2 Architecture'),
      byTitle('2.1 Overview')
    )
    expect(relation).toBe('descendant')
    expect(distance).toBe(1)
  })

  it('@p0 identifies siblings at distance 2', () => {
    const { distance, relation } = headingTreeDistance(
      headings,
      byTitle('2.1 Overview'),
      byTitle('2.2 Components')
    )
    expect(relation).toBe('sibling')
    expect(distance).toBe(2)
  })

  it('@p0 classifies cross-branch as other', () => {
    const { distance, relation } = headingTreeDistance(
      headings,
      byTitle('1 Introduction'),
      byTitle('2.2.1 Auth')
    )
    expect(relation).toBe('other')
    expect(distance).toBe(4)
  })

  it('@p0 classifies top-level siblings correctly', () => {
    const { distance, relation } = headingTreeDistance(
      headings,
      byTitle('2 Architecture'),
      byTitle('3 Deployment')
    )
    expect(relation).toBe('sibling')
    expect(distance).toBe(2)
  })

  it('@p1 ancestor chain returns path from root for nested descendant', () => {
    const path = ancestorChainFromRoot(headings, byTitle('2.2.1 Auth'))
    expect(path.map((h) => h.title)).toEqual([
      'Proposal',
      '2 Architecture',
      '2.2 Components',
      '2.2.1 Auth',
    ])
  })
})
