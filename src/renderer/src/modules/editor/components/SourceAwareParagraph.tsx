import { useMemo } from 'react'
import { PlateElement, type PlateElementProps } from 'platejs/react'
import { useSourceAttributionContext } from '@modules/editor/context/useSourceAttributionContext'
import { SourceAttributionLabel } from './SourceAttributionLabel'
import { BaselineMismatchMarker } from './BaselineMismatchMarker'
import { createContentDigest } from '@shared/chapter-markdown'

/**
 * Paragraph element wrapper that renders source attribution labels
 * and baseline mismatch markers alongside the text content.
 * The labels are driven by SourceAttributionContext, NOT persisted in the Slate AST.
 */
export function SourceAwareParagraph(props: PlateElementProps): React.JSX.Element {
  const sourceAttr = useSourceAttributionContext()

  // Extract the text content of this paragraph to compute its digest
  const currentDigest = useMemo(() => {
    const texts: string[] = []
    function extractText(node: unknown): void {
      if (typeof node === 'object' && node !== null) {
        const n = node as Record<string, unknown>
        if (typeof n.text === 'string') {
          texts.push(n.text)
        }
        if (Array.isArray(n.children)) {
          for (const child of n.children) {
            extractText(child)
          }
        }
      }
    }
    extractText(props.element)
    const text = texts.join('').trim()
    return text ? createContentDigest(text) : ''
  }, [props.element])

  // Look up attribution/validation/isEdited from context's pre-computed map
  const { attribution, validation, isEdited } = useMemo(() => {
    if (!sourceAttr || !currentDigest) {
      return { attribution: null, validation: null, isEdited: false }
    }
    const entry = sourceAttr.paragraphLookup.get(currentDigest)
    if (!entry) {
      return { attribution: null, validation: null, isEdited: false }
    }
    return entry
  }, [sourceAttr, currentDigest])

  const isNoSource = attribution?.sourceType === 'no-source' && !isEdited

  return (
    <PlateElement
      {...props}
      style={{
        ...props.style,
        position: 'relative',
        ...(isNoSource ? { backgroundColor: '#FFFBE6' } : {}),
        ...(validation && !validation.matched
          ? { borderLeft: '2px solid #FF4D4F', paddingLeft: 8 }
          : {}),
      }}
    >
      {props.children}
      {attribution && (
        <span style={{ position: 'absolute', right: 0, top: 0 }} contentEditable={false}>
          <SourceAttributionLabel attribution={attribution} isEdited={isEdited} />
          {validation && !validation.matched && <BaselineMismatchMarker validation={validation} />}
        </span>
      )}
    </PlateElement>
  )
}
