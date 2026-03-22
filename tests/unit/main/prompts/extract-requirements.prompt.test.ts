import { describe, it, expect } from 'vitest'
import { extractRequirementsPrompt } from '@main/prompts/extract-requirements.prompt'
import type { ExtractRequirementsContext } from '@main/prompts/extract-requirements.prompt'

describe('extractRequirementsPrompt', () => {
  const baseContext: ExtractRequirementsContext = {
    sections: [
      { title: '总则', content: '项目概述', pageStart: 1, pageEnd: 5 },
      { title: '技术要求', content: '系统架构', pageStart: 6, pageEnd: 20 },
    ],
    rawText: '总则\n项目概述\n技术要求\n系统架构',
    totalPages: 42,
  }

  it('should contain key instructions for requirements extraction', () => {
    const prompt = extractRequirementsPrompt(baseContext)
    expect(prompt).toContain('技术需求条目清单')
    expect(prompt).toContain('sequenceNumber')
    expect(prompt).toContain('sourcePages')
    expect(prompt).toContain('category')
    expect(prompt).toContain('priority')
  })

  it('should contain key instructions for scoring model extraction', () => {
    const prompt = extractRequirementsPrompt(baseContext)
    expect(prompt).toContain('评分模型')
    expect(prompt).toContain('maxScore')
    expect(prompt).toContain('subItems')
    expect(prompt).toContain('reasoning')
    expect(prompt).toContain('JSON')
  })

  it('should include section summary', () => {
    const prompt = extractRequirementsPrompt(baseContext)
    expect(prompt).toContain('总则')
    expect(prompt).toContain('技术要求')
    expect(prompt).toContain('42')
  })

  it('should include raw text', () => {
    const prompt = extractRequirementsPrompt(baseContext)
    expect(prompt).toContain('项目概述')
    expect(prompt).toContain('系统架构')
  })

  it('should add scanned content note when hasScannedContent is true', () => {
    const prompt = extractRequirementsPrompt({ ...baseContext, hasScannedContent: true })
    expect(prompt).toContain('扫描件')
    expect(prompt).toContain('OCR')
  })

  it('should not add scanned note when hasScannedContent is false', () => {
    const prompt = extractRequirementsPrompt({ ...baseContext, hasScannedContent: false })
    expect(prompt).not.toContain('扫描件')
  })
})
