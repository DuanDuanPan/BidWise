/**
 * SVG extraction and basic validation helpers for main-process use.
 * Extracts the first complete <svg>...</svg> document from raw AI output.
 */

const SVG_OPEN_RE = /<svg[\s>]/i
const SVG_CLOSE_RE = /<\/svg\s*>/gi

export interface SvgExtractionResult {
  svg: string | null
  error?: string
}

/**
 * Extract the first complete `<svg>...</svg>` from raw text.
 * Strips any content before the opening `<svg` and after the closing `</svg>`.
 */
export function extractFirstSvg(raw: string): SvgExtractionResult {
  const openMatch = SVG_OPEN_RE.exec(raw)
  if (!openMatch) {
    return { svg: null, error: 'No <svg> opening tag found in response' }
  }

  // Find the last </svg> (handles nested SVG elements)
  let lastCloseIndex = -1
  let closeMatch: RegExpExecArray | null
  SVG_CLOSE_RE.lastIndex = openMatch.index
  while ((closeMatch = SVG_CLOSE_RE.exec(raw)) !== null) {
    lastCloseIndex = closeMatch.index + closeMatch[0].length
  }

  if (lastCloseIndex === -1) {
    return { svg: null, error: 'No closing </svg> tag found' }
  }

  const svg = raw.slice(openMatch.index, lastCloseIndex).trim()
  if (svg.length < 30) {
    return { svg: null, error: 'Extracted SVG is too short to be valid' }
  }

  return { svg }
}
