import { useMemo } from 'react'
import { PlateElement, type PlateElementProps, useEditorRef } from 'platejs/react'
import { useSourceAttributionContext } from '@modules/editor/context/useSourceAttributionContext'
import { SourceAttributionLabel } from './SourceAttributionLabel'
import { BaselineMismatchMarker } from './BaselineMismatchMarker'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import { createParagraphLookupKey } from '@modules/editor/hooks/useSourceAttribution'

function extractText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const n = node as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (!Array.isArray(n.children)) return ''
  return (n.children as unknown[]).map(extractText).join('')
}

function getHeadingLevel(type: string | undefined): ChapterHeadingLocator['level'] | null {
  switch (type) {
    case 'h2':
      return 2
    case 'h3':
      return 3
    case 'h4':
      return 4
    default:
      return null
  }
}

function isAnnotatableNode(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  const type = (node as Record<string, unknown>).type
  return type === 'p' || type === 'lic'
}

function resolveParagraphLookupKey(nodes: unknown[], target: unknown): string | null {
  const headingCounts = new Map<string, number>()
  let activeSection: ChapterHeadingLocator | null = null
  let paragraphIndex = 0
  let result: string | null = null

  const visit = (node: unknown): void => {
    if (result || typeof node !== 'object' || node === null) return

    const record = node as Record<string, unknown>
    const type = typeof record.type === 'string' ? record.type : undefined
    const headingLevel = getHeadingLevel(type)

    if (headingLevel) {
      const title = extractText(node).trim()
      if (title) {
        const occurrenceKey = `${headingLevel}:${title}`
        const occurrenceIndex = headingCounts.get(occurrenceKey) ?? 0
        headingCounts.set(occurrenceKey, occurrenceIndex + 1)
        activeSection = { title, level: headingLevel, occurrenceIndex }
        paragraphIndex = 0
      }
    }

    if (node === target && activeSection && isAnnotatableNode(node)) {
      result = createParagraphLookupKey(activeSection, paragraphIndex)
      return
    }

    if (activeSection && isAnnotatableNode(node)) {
      paragraphIndex += 1
    }

    if (!Array.isArray(record.children)) return
    for (const child of record.children) {
      visit(child)
      if (result) return
    }
  }

  for (const node of nodes) {
    visit(node)
    if (result) break
  }

  return result
}

/** Color for the left-border accent by source type */
const SOURCE_BORDER_COLORS: Record<string, string> = {
  'asset-library': '#1677FF',
  'knowledge-base': '#52C41A',
  'ai-inference': '#FAAD14',
  'no-source': '#D48806',
  'user-edited': '#D9D9D9',
}

/**
 * Paragraph element wrapper that renders source attribution labels
 * and baseline mismatch markers alongside the text content.
 * The labels are driven by SourceAttributionContext, NOT persisted in the Slate AST.
 *
 * Design: left-border accent indicates source type at rest.
 * Full label appears on hover via CSS opacity transition to avoid blocking text.
 */
export function SourceAwareParagraph(props: PlateElementProps): React.JSX.Element {
  const sourceAttr = useSourceAttributionContext()
  const editor = useEditorRef()
  const paragraphLookupKey = useMemo(
    () => resolveParagraphLookupKey(editor.children, props.element),
    [editor.children, props.element]
  )

  // Look up attribution/validation/isEdited from context's pre-computed map
  const { attribution, validation, isEdited } = useMemo(() => {
    if (!sourceAttr || !paragraphLookupKey) {
      return { attribution: null, validation: null, isEdited: false }
    }
    const entry = sourceAttr.paragraphLookup.get(paragraphLookupKey)
    if (!entry) {
      return { attribution: null, validation: null, isEdited: false }
    }
    return entry
  }, [sourceAttr, paragraphLookupKey])

  const isNoSource = attribution?.sourceType === 'no-source' && !isEdited
  const hasMismatch = validation != null && !validation.matched
  const effectiveType = isEdited ? 'user-edited' : attribution?.sourceType
  const borderColor = effectiveType ? SOURCE_BORDER_COLORS[effectiveType] : undefined

  return (
    <PlateElement
      {...props}
      className={`source-aware-paragraph ${props.className ?? ''}`}
      style={{
        ...props.style,
        position: 'relative',
        // Left accent border for attributed paragraphs (source type color)
        ...(attribution && !hasMismatch
          ? { borderLeft: `2px solid ${borderColor}`, paddingLeft: 10 }
          : {}),
        // Subtle background tint for no-source paragraphs
        ...(isNoSource ? { backgroundColor: '#FFFBE6' } : {}),
        // Mismatch state: red border takes priority
        ...(hasMismatch ? { borderLeft: '2px solid #FF4D4F', paddingLeft: 10 } : {}),
      }}
    >
      {props.children}
      {attribution && (
        <span
          className="source-label-anchor"
          style={{
            position: 'absolute',
            right: -4,
            top: 2,
            transform: 'translateX(100%)',
            opacity: 0,
            transition: 'opacity 0.15s ease-in-out',
            pointerEvents: 'none',
            zIndex: 1,
          }}
          contentEditable={false}
        >
          <span style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center' }}>
            <SourceAttributionLabel attribution={attribution} isEdited={isEdited} />
            {hasMismatch && <BaselineMismatchMarker validation={validation} />}
          </span>
        </span>
      )}
    </PlateElement>
  )
}
