import { describe, it, expect } from 'vitest'
import { extractJsonArray, extractJsonObject } from '@main/utils/llm-json'

describe('extractJsonArray', () => {
  it('parses a clean JSON array', () => {
    const text = '[{"a": 1}, {"a": 2}]'
    expect(extractJsonArray(text)).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('extracts from code-fenced block', () => {
    const text = '```json\n[{"a": 1}]\n```'
    expect(extractJsonArray(text)).toEqual([{ a: 1 }])
  })

  it('extracts from surrounding prose', () => {
    const text = 'Here is the result:\n[{"a": 1}]\nDone.'
    expect(extractJsonArray(text)).toEqual([{ a: 1 }])
  })

  it('returns null when no array found', () => {
    expect(extractJsonArray('no json here')).toBeNull()
  })

  it('repairs unescaped Chinese-style double quotes in string values', () => {
    // Real production failure: MiniMax uses ASCII " as Chinese quotation marks
    const text = `\`\`\`json
[
  {
    "paragraphIndex": 0,
    "sourceType": "knowledge-base",
    "sourceRef": "工信部《"十四五"智能制造发展规划》政策文件",
    "confidence": 0.90
  }
]
\`\`\``
    const result = extractJsonArray<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].paragraphIndex).toBe(0)
    expect(result![0].sourceType).toBe('knowledge-base')
    // The repaired sourceRef should contain curly quotes instead of straight ones
    expect(String(result![0].sourceRef)).toContain('十四五')
  })

  it('repairs multiple unescaped quotes in a single string value', () => {
    // Another production failure: "两化融合" and "工业互联网"
    const text = `[
  {
    "paragraphIndex": 0,
    "snippet": "在国家"两化融合"和"工业互联网"发展战略的背景下",
    "sourceType": "knowledge-base"
  }
]`
    const result = extractJsonArray<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    const snippet = String(result![0].snippet)
    expect(snippet).toContain('两化融合')
    expect(snippet).toContain('工业互联网')
  })

  it('repairs quotes in extract-agent style output', () => {
    const text = `[
  {
    "description": "偏离要求：招标文件第五章"供货要求"未加注星号（"*"）的条款",
    "type": "mandatory"
  }
]`
    const result = extractJsonArray<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(String(result![0].description)).toContain('供货要求')
  })

  it('does not break already valid JSON with properly escaped quotes', () => {
    const text = '[{"key": "value with \\"escaped\\" quotes"}]'
    const result = extractJsonArray<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(result![0].key).toBe('value with "escaped" quotes')
  })

  it('handles multi-item arrays with mixed clean and broken strings', () => {
    const text = `[
  {"paragraphIndex": 0, "sourceType": "ai-inference", "confidence": 0.85},
  {"paragraphIndex": 1, "sourceType": "knowledge-base", "sourceRef": "《"十四五"规划》", "confidence": 0.9},
  {"paragraphIndex": 2, "sourceType": "no-source", "confidence": 0.5}
]`
    const result = extractJsonArray<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(3)
    expect(result![1].sourceType).toBe('knowledge-base')
  })
})

describe('extractJsonObject', () => {
  it('parses a clean JSON object', () => {
    const text = '{"pass": true, "issues": []}'
    expect(extractJsonObject(text)).toEqual({ pass: true, issues: [] })
  })

  it('repairs unescaped quotes in object values', () => {
    const text = '{"title": "关于"十四五"的规划", "count": 1}'
    const result = extractJsonObject<Record<string, unknown>>(text)
    expect(result).not.toBeNull()
    expect(String(result!.title)).toContain('十四五')
    expect(result!.count).toBe(1)
  })

  it('returns null for unparseable content', () => {
    expect(extractJsonObject('just some text')).toBeNull()
  })
})
