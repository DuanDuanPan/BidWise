import { describe, it, expect } from 'vitest'
import { extractAddendumPrompt } from '@main/prompts/extract-addendum.prompt'
import type { ExtractAddendumContext } from '@main/prompts/extract-addendum.prompt'

const baseContext: ExtractAddendumContext = {
  addendumContent: '补遗通知：新增要求系统支持国产化适配。',
  existingRequirements: [
    { id: 'req-1', sequenceNumber: 1, description: '系统须支持千万级数据处理' },
  ],
}

describe('extractAddendumPrompt @story-2-8', () => {
  it('@p1 should include addendum content in the prompt', () => {
    const prompt = extractAddendumPrompt(baseContext)
    expect(prompt).toContain('国产化适配')
  })

  it('@p1 should include existing requirements for reference', () => {
    const prompt = extractAddendumPrompt(baseContext)
    expect(prompt).toContain('千万级数据处理')
  })

  it('@p1 should specify JSON output format', () => {
    const prompt = extractAddendumPrompt(baseContext)
    expect(prompt).toContain('description')
    expect(prompt).toContain('category')
    expect(prompt).toContain('priority')
    expect(prompt).toContain('sourcePages')
  })

  it('@p2 should handle empty existing requirements', () => {
    const prompt = extractAddendumPrompt({
      addendumContent: '补遗内容',
    })
    expect(prompt).toContain('无已有需求')
  })

  it('@p2 should emphasize extracting only new/changed items', () => {
    const prompt = extractAddendumPrompt(baseContext)
    expect(prompt).toContain('新增或实质变更')
    expect(prompt).toContain('不要重复回传')
  })

  it('@p1 should include originalSequenceNumber in output format for modify/delete tracking', () => {
    const prompt = extractAddendumPrompt(baseContext)
    expect(prompt).toContain('originalSequenceNumber')
    expect(prompt).toContain('modified')
  })
})
