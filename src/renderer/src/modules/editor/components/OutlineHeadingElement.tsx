import { PlateElement } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'

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

export const OutlineH1Element = OutlineHeadingElement
export const OutlineH2Element = OutlineHeadingElement
export const OutlineH3Element = OutlineHeadingElement
export const OutlineH4Element = OutlineHeadingElement
