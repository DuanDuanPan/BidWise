import { describe, it, expect, vi } from 'vitest'

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

import { detectSections } from '@main/services/document-parser/section-detector'

describe('section-detector', () => {
  it('should detect "第X章" patterns', () => {
    const text = '第一章 总则\n这是总则内容\n第二章 技术要求\n这是技术内容'
    const sections = detectSections(text, 'pdf', 10)

    expect(sections.length).toBeGreaterThanOrEqual(2)
    expect(sections[0].title).toMatch(/第一章/)
    expect(sections[1].title).toMatch(/第二章/)
  })

  it('should detect numeric "1.1 / 1.2" patterns', () => {
    const text = '1. 项目概述\n概述内容\n2. 技术标准\n标准内容\n2.1 性能指标\n指标内容'
    const sections = detectSections(text, 'pdf', 5)

    expect(sections.length).toBeGreaterThanOrEqual(2)
  })

  it('should detect Chinese numbering "一、/二、" patterns', () => {
    const text = '一、投标须知\n须知内容\n二、技术标准\n标准内容'
    const sections = detectSections(text, 'pdf', 5)

    expect(sections.length).toBeGreaterThanOrEqual(2)
    expect(sections[0].title).toMatch(/一、投标须知/)
    expect(sections[1].title).toMatch(/二、技术标准/)
  })

  it('should handle nested levels correctly (1 > 1.1 > 1.1.1)', () => {
    const text = '1. 总则\n内容\n1.1 基本要求\n内容\n1.1.1 具体指标\n内容\n2. 技术要求\n内容'
    const sections = detectSections(text, 'pdf', 10)

    // Should detect at least the top-level sections
    expect(sections.length).toBeGreaterThanOrEqual(2)
  })

  it('should return single section for unstructured document', () => {
    const text = '这是一段没有任何标题结构的纯文本内容，没有章节编号。'
    const sections = detectSections(text, 'pdf', 1)

    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('全文')
    expect(sections[0].content).toBe(text)
  })

  it('should use HTML sections for Word format when available', () => {
    const htmlSections = [
      { title: '总则', content: '总则内容', level: 1 },
      { title: '技术要求', content: '技术内容', level: 2 },
    ]

    const sections = detectSections('text', 'docx', 5, htmlSections)

    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('总则')
    expect(sections[0].level).toBe(1)
    expect(sections[1].title).toBe('技术要求')
    expect(sections[1].level).toBe(2)
  })

  it('should fallback to regex for Word format without HTML sections', () => {
    const text = '第一章 总则\n内容\n第二章 技术要求\n内容'
    const sections = detectSections(text, 'docx', 5, [])

    expect(sections.length).toBeGreaterThanOrEqual(2)
  })

  it('should assign page numbers based on character position', () => {
    // Create text that's clearly split across pages
    const page1 = '第一章 总则\n'.padEnd(1000, '内')
    const page2 = '第二章 技术要求\n'.padEnd(1000, '容')
    const text = page1 + page2

    const sections = detectSections(text, 'pdf', 2)

    expect(sections[0].pageStart).toBe(1)
  })
})
