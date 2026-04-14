import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

export function scrollToHeading(
  containerEl: HTMLElement | null,
  target: Pick<OutlineNode, 'title' | 'occurrenceIndex'>
): void {
  if (!containerEl) return

  const headingElements = containerEl.querySelectorAll('[data-heading-text]')
  let matchCount = 0

  for (const el of headingElements) {
    if (el.getAttribute('data-heading-text') === target.title) {
      if (matchCount === target.occurrenceIndex) {
        // Use non-animated scrolling so chapter jumps do not keep running
        // after the user immediately starts scrolling or editing elsewhere.
        el.scrollIntoView({ behavior: 'auto', block: 'start' })
        return
      }
      matchCount++
    }
  }
}
