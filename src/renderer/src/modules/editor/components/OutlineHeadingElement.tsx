import { PlateElement } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'

/**
 * Custom heading element that injects a data-heading-text attribute
 * for outline scroll-to-heading navigation.
 */
/**
 * Recursively extracts plain text from a Slate node tree,
 * handling inline formatting nodes (bold, italic, links, etc.)
 * that wrap text in nested children.
 */
function extractText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) {
    return (n.children as unknown[]).map(extractText).join('')
  }
  return ''
}

export function OutlineHeadingElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const text = extractText(element).trim()

  return (
    <PlateElement {...props} data-heading-text={text}>
      {children}
    </PlateElement>
  )
}
