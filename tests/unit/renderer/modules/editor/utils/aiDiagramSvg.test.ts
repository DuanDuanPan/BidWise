import { describe, it, expect } from 'vitest'
import {
  extractSvgFromRaw,
  validateSvgXml,
  sanitizeSvg,
  extractAndSanitizeAiDiagramSvg,
} from '@modules/editor/utils/aiDiagramSvg'

describe('@story-3-9 aiDiagramSvg', () => {
  const validSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>'

  describe('extractSvgFromRaw', () => {
    it('extracts clean SVG', () => {
      const result = extractSvgFromRaw(validSvg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).toContain('<svg')
    })

    it('extracts SVG wrapped in explanation text', () => {
      const raw = `Here is your diagram:\n\n${validSvg}\n\nHope this helps!`
      const result = extractSvgFromRaw(raw)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).toContain('<rect')
    })

    it('extracts SVG from ```svg fence', () => {
      const raw = '```svg\n' + validSvg + '\n```'
      const result = extractSvgFromRaw(raw)
      expect(result.ok).toBe(true)
    })

    it('extracts SVG from ```xml fence', () => {
      const raw = '```xml\n' + validSvg + '\n```'
      const result = extractSvgFromRaw(raw)
      expect(result.ok).toBe(true)
    })

    it('fails on empty content', () => {
      const result = extractSvgFromRaw('')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('为空')
    })

    it('fails on non-SVG content', () => {
      const result = extractSvgFromRaw('Just some text without any SVG')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('未找到')
    })
  })

  describe('validateSvgXml', () => {
    it('validates well-formed SVG', () => {
      const result = validateSvgXml(validSvg)
      expect(result.ok).toBe(true)
    })

    it('rejects malformed XML', () => {
      const result = validateSvgXml('<svg><rect></svg>')
      expect(result.ok).toBe(false)
    })

    it('rejects non-SVG root', () => {
      const result = validateSvgXml('<div xmlns="http://www.w3.org/2000/svg"></div>')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('根元素无效')
    })
  })

  describe('sanitizeSvg', () => {
    it('passes safe SVG through', () => {
      const result = sanitizeSvg(validSvg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).toContain('<rect')
    })

    it('strips script tags', () => {
      const malicious =
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>'
      const result = sanitizeSvg(malicious)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('script')
    })

    it('strips foreignObject', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hack</div></foreignObject></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('foreignObject')
    })

    it('strips external href (https)', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.com"><rect/></a></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('evil.com')
    })

    it('strips protocol-relative href (//evil.com)', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="//evil.com/path"><rect/></a></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('evil.com')
    })

    it('strips mailto: href', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="mailto:x@evil.com"><rect/></a></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('mailto:')
    })

    it('strips data: URI href', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>alert(1)</script>"><rect/></a></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).not.toContain('data:text')
    })

    it('preserves internal #fragment hrefs', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon-arrow"/><marker id="icon-arrow"><path d="M0,0 L10,5 L0,10"/></marker></svg>'
      const result = sanitizeSvg(svg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).toContain('#icon-arrow')
    })
  })

  describe('extractAndSanitizeAiDiagramSvg (full pipeline)', () => {
    it('processes valid SVG end-to-end', () => {
      const result = extractAndSanitizeAiDiagramSvg(validSvg)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.svg).toContain('<svg')
    })

    it('processes fenced SVG end-to-end', () => {
      const raw = '```svg\n' + validSvg + '\n```'
      const result = extractAndSanitizeAiDiagramSvg(raw)
      expect(result.ok).toBe(true)
    })

    it('returns error for non-SVG content', () => {
      const result = extractAndSanitizeAiDiagramSvg('No SVG here')
      expect(result.ok).toBe(false)
    })
  })
})
