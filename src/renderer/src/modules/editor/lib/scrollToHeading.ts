/**
 * Scrolls the editor to a heading element matching the given text and occurrence index.
 * Uses data-heading-text attributes injected by OutlineHeadingElement.
 */
export function scrollToHeading(headingText: string, occurrenceIndex: number): void {
  const scrollContainer = document.querySelector('[data-editor-scroll-container="true"]')
  if (!scrollContainer) return

  const headingElements = scrollContainer.querySelectorAll('[data-heading-text]')
  let matchCount = 0

  for (const el of headingElements) {
    if (el.getAttribute('data-heading-text') === headingText) {
      if (matchCount === occurrenceIndex) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      matchCount++
    }
  }
}
