import { describe, it, expect } from 'vitest'
import { extractFirstSvg } from '@main/utils/svg-extract'

describe('svg-extract @story-3-10', () => {
  it('@p0 should extract a complete SVG from raw text', () => {
    const raw =
      'Some text before\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect x="10" y="10" width="100" height="50"/></svg>\nSome text after'
    const result = extractFirstSvg(raw)
    expect(result.svg).toContain('<svg')
    expect(result.svg).toContain('</svg>')
    expect(result.error).toBeUndefined()
  })

  it('@p0 should return null when no SVG found', () => {
    const result = extractFirstSvg('No SVG content here')
    expect(result.svg).toBeNull()
    expect(result.error).toContain('No <svg> opening tag')
  })

  it('@p0 should return null when closing tag is missing', () => {
    const result = extractFirstSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/>')
    expect(result.svg).toBeNull()
    expect(result.error).toContain('No closing </svg>')
  })

  it('@p1 should handle nested SVG elements', () => {
    const raw = '<svg><g><svg><rect/></svg></g></svg>'
    const result = extractFirstSvg(raw)
    expect(result.svg).toBe('<svg><g><svg><rect/></svg></g></svg>')
  })

  it('@p1 should strip markdown fences before SVG', () => {
    const raw =
      '```xml\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle r="10"/></svg>\n```'
    const result = extractFirstSvg(raw)
    expect(result.svg).toContain('<svg')
    expect(result.svg).not.toContain('```')
  })

  it('@p0 should reject too-short SVG', () => {
    const result = extractFirstSvg('<svg></svg>')
    expect(result.svg).toBeNull()
    expect(result.error).toContain('too short')
  })
})
