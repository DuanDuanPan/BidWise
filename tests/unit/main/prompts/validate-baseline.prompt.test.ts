import { describe, it, expect } from 'vitest'
import {
  validateBaselinePrompt,
  VALIDATE_BASELINE_SYSTEM_PROMPT,
} from '@main/prompts/validate-baseline.prompt'
import type { ValidateBaselineContext } from '@main/prompts/validate-baseline.prompt'
import { createContentDigest } from '@shared/chapter-markdown'

describe('@story-3-5 validateBaselinePrompt', () => {
  const baseContext: ValidateBaselineContext = {
    chapterTitle: '\u4ea7\u54c1\u529f\u80fd\u63cf\u8ff0',
    paragraphs: [
      {
        paragraphIndex: 0,
        text: '\u672c\u7cfb\u7edf\u652f\u6301\u4e07\u7ea7\u5e76\u53d1\u8bbf\u95ee',
        digest: createContentDigest(
          '\u672c\u7cfb\u7edf\u652f\u6301\u4e07\u7ea7\u5e76\u53d1\u8bbf\u95ee'
        ),
      },
      {
        paragraphIndex: 1,
        text: '\u63d0\u4f9b\u56fd\u5bc6\u7b97\u6cd5 SM2/SM4 \u52a0\u5bc6\u80fd\u529b',
        digest: createContentDigest(
          '\u63d0\u4f9b\u56fd\u5bc6\u7b97\u6cd5 SM2/SM4 \u52a0\u5bc6\u80fd\u529b'
        ),
      },
    ],
    productBaseline:
      '## \u4ea7\u54c1\u57fa\u7ebf\n- \u5e76\u53d1\u652f\u6301: \u5343\u7ea7\u5e76\u53d1\n- \u52a0\u5bc6: AES-256, \u6682\u4e0d\u652f\u6301\u56fd\u5bc6',
  }

  it('@p0 should include chapter title', () => {
    const prompt = validateBaselinePrompt(baseContext)
    expect(prompt).toContain('\u4ea7\u54c1\u529f\u80fd\u63cf\u8ff0')
  })

  it('@p0 should include product baseline content', () => {
    const prompt = validateBaselinePrompt(baseContext)
    expect(prompt).toContain('\u4ea7\u54c1\u80fd\u529b\u57fa\u7ebf')
    expect(prompt).toContain('\u5e76\u53d1\u652f\u6301')
    expect(prompt).toContain('AES-256')
  })

  it('@p0 should include all paragraphs with indices', () => {
    const prompt = validateBaselinePrompt(baseContext)
    expect(prompt).toContain('[\u6bb5\u843d 0]')
    expect(prompt).toContain('[\u6bb5\u843d 1]')
    expect(prompt).toContain('\u4e07\u7ea7\u5e76\u53d1')
    expect(prompt).toContain('SM2/SM4')
  })

  it('@p0 should require claim extraction and match status', () => {
    const prompt = validateBaselinePrompt(baseContext)
    expect(prompt).toContain('claim')
    expect(prompt).toContain('matched')
    expect(prompt).toContain('mismatchReason')
    expect(prompt).toContain('paragraphIndex')
  })

  it('@p0 should require JSON output format', () => {
    const prompt = validateBaselinePrompt(baseContext)
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('baselineRef')
  })

  it('@p0 should define a professional system prompt', () => {
    expect(VALIDATE_BASELINE_SYSTEM_PROMPT).toContain('\u4ea7\u54c1\u529f\u80fd\u9a8c\u8bc1')
    expect(VALIDATE_BASELINE_SYSTEM_PROMPT).toContain('JSON')
    expect(VALIDATE_BASELINE_SYSTEM_PROMPT).toContain('\u57fa\u7ebf')
  })
})
