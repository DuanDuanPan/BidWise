import DOMPurify from 'dompurify'

export type SvgExtractionResult = { ok: true; svg: string } | { ok: false; error: string }

/**
 * Extract the first complete `<svg>...</svg>` document from raw skill result text.
 * Handles cases where the SVG is wrapped in explanation text or ```svg fences.
 */
export function extractSvgFromRaw(raw: string): SvgExtractionResult {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: '返回内容为空' }
  }

  // Strip markdown code fences if present
  let content = raw.trim()
  const fenceMatch = content.match(/^```(?:svg|xml)?\s*\n([\s\S]*?)\n```\s*$/m)
  if (fenceMatch) {
    content = fenceMatch[1].trim()
  }

  // Find first <svg...>...</svg> block
  const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i)
  if (!svgMatch) {
    return { ok: false, error: '返回内容中未找到完整的 SVG 文档' }
  }

  return { ok: true, svg: svgMatch[0] }
}

/**
 * Validate SVG string via DOMParser — must parse as valid XML with <svg> root.
 */
export function validateSvgXml(svg: string): SvgExtractionResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return { ok: false, error: `SVG XML 解析失败: ${parseError.textContent?.slice(0, 200) ?? ''}` }
  }

  const root = doc.documentElement
  if (root.tagName.toLowerCase() !== 'svg') {
    return { ok: false, error: `SVG 根元素无效: ${root.tagName}` }
  }

  return { ok: true, svg }
}

/**
 * Sanitize SVG using DOMPurify with SVG profile.
 * Strips script, foreignObject, on* event attributes, and external href/xlink:href.
 */
export function sanitizeSvg(svg: string): SvgExtractionResult {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: [
      'onload',
      'onerror',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onanimationend',
      'onanimationstart',
    ],
  })

  if (!clean || !clean.trim()) {
    return { ok: false, error: 'SVG 净化后为空 — 可能包含不安全内容' }
  }

  // Strip all href/xlink:href that are not internal fragment refs (#id).
  // Catches http(s), protocol-relative (//), mailto:, data:, javascript:, etc.
  const strippedExternalRefs = clean.replace(
    /((?:xlink:)?href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_match, attr: string, dqVal?: string, sqVal?: string) => {
      const val = dqVal ?? sqVal ?? ''
      // Keep internal fragment references (e.g. href="#arrow-marker")
      if (val.startsWith('#') || val === '') return `${attr}="${val}"`
      // Strip everything else
      return `${attr}=""`
    }
  )

  return { ok: true, svg: strippedExternalRefs }
}

/**
 * Full pipeline: extract → validate → sanitize.
 * Returns sanitized SVG or a typed error suitable for inline display.
 */
export function extractAndSanitizeAiDiagramSvg(raw: string): SvgExtractionResult {
  const extracted = extractSvgFromRaw(raw)
  if (!extracted.ok) return extracted

  const validated = validateSvgXml(extracted.svg)
  if (!validated.ok) return validated

  return sanitizeSvg(validated.svg)
}
