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
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      matchCount++
    }
  }
}
