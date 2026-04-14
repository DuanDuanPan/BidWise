/**
 * Utility for extracting and parsing JSON from LLM responses.
 *
 * LLMs (especially MiniMax) frequently produce structurally valid JSON
 * but embed unescaped ASCII double-quotes (U+0022) inside string values
 * as Chinese quotation marks, e.g.:
 *   "snippet": "在国家"两化融合"战略背景下"
 *
 * This module attempts a standard parse first, and falls back to a repair
 * pass that escapes those interior double-quotes before re-parsing.
 */

/**
 * Extract a JSON array from LLM text output.
 * Handles ```json fences and bare arrays.
 * Repairs unescaped interior double-quotes on parse failure.
 */
export function extractJsonArray<T = unknown>(text: string): T[] | null {
  const raw = extractRawJson(text, 'array')
  if (!raw) return null
  return parseWithRepair(raw) as T[] | null
}

/**
 * Extract a JSON object from LLM text output.
 * Handles ```json fences and bare objects.
 * Repairs unescaped interior double-quotes on parse failure.
 */
export function extractJsonObject<T = unknown>(text: string): T | null {
  const raw = extractRawJson(text, 'object')
  if (!raw) return null
  return parseWithRepair(raw) as T | null
}

// ─── Internal helpers ───

function extractRawJson(text: string, shape: 'array' | 'object'): string | null {
  // Try code-fenced block first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    const inner = fenceMatch[1].trim()
    if (inner.length > 0) return inner
  }

  // Fall back to greedy bracket matching
  if (shape === 'array') {
    const m = text.match(/\[[\s\S]*\]/)
    return m ? m[0] : null
  }
  const m = text.match(/\{[\s\S]*\}/)
  return m ? m[0] : null
}

function parseWithRepair(raw: string): unknown | null {
  // Fast path: try standard parse first
  try {
    return JSON.parse(raw)
  } catch {
    // Fall through to repair
  }

  // Repair: escape unescaped double-quotes inside JSON string values.
  //
  // Strategy: walk the string character-by-character, tracking whether
  // we are inside a JSON string. When inside a string, any `"` that is
  // NOT the closing quote (i.e. followed by content that doesn't match
  // a JSON structural pattern) is replaced with the Unicode equivalent
  // LEFT/RIGHT DOUBLE QUOTATION MARK (\u201C / \u201D).
  const repaired = repairUnescapedQuotes(raw)
  try {
    return JSON.parse(repaired)
  } catch {
    return null
  }
}

/**
 * Walk JSON text and replace unescaped interior `"` with curly quotes.
 *
 * Heuristic: when we encounter a `"` inside a string value, we check if
 * the character after the quote looks like a JSON structural token
 * (`:`, `,`, `}`, `]`, or whitespace followed by one of those).
 * If yes, it's the real closing quote. If no, it's an embedded quote
 * used as Chinese punctuation — replace it with \u201C or \u201D.
 */
function repairUnescapedQuotes(raw: string): string {
  const chars = Array.from(raw)
  const len = chars.length
  let i = 0
  const result: string[] = []
  let inString = false
  let toggleLeft = true // alternate between left and right curly quotes

  while (i < len) {
    const ch = chars[i]

    if (!inString) {
      result.push(ch)
      if (ch === '"') {
        inString = true
        toggleLeft = true
      }
      i++
      continue
    }

    // Inside a JSON string value
    if (ch === '\\') {
      // Escaped character — consume both
      result.push(ch)
      i++
      if (i < len) {
        result.push(chars[i])
        i++
      }
      continue
    }

    if (ch === '"') {
      // Is this the real closing quote?
      if (isClosingQuote(chars, i, len)) {
        result.push(ch)
        inString = false
        i++
        continue
      }
      // Interior quote — replace with curly equivalent
      result.push(toggleLeft ? '\u201C' : '\u201D')
      toggleLeft = !toggleLeft
      i++
      continue
    }

    result.push(ch)
    i++
  }

  return result.join('')
}

/**
 * Determine if the `"` at position `pos` is the real closing quote of
 * a JSON string, by looking at what follows it (skipping whitespace).
 *
 * After a closing string quote, valid JSON tokens are: `:`, `,`, `}`, `]`
 * or end-of-input.
 */
function isClosingQuote(chars: string[], pos: number, len: number): boolean {
  let j = pos + 1
  // Skip whitespace
  while (
    j < len &&
    (chars[j] === ' ' || chars[j] === '\t' || chars[j] === '\n' || chars[j] === '\r')
  ) {
    j++
  }
  if (j >= len) return true
  const next = chars[j]
  return next === ':' || next === ',' || next === '}' || next === ']'
}
