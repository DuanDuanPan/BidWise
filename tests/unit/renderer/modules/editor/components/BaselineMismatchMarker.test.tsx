import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { BaselineMismatchMarker } from '@modules/editor/components/BaselineMismatchMarker'
import type { BaselineValidation } from '@shared/source-attribution-types'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('@story-3-5 BaselineMismatchMarker', () => {
  const mismatchedValidation: BaselineValidation = {
    id: 'bv-1',
    sectionLocator: { title: '\u4ea7\u54c1\u529f\u80fd', level: 2, occurrenceIndex: 0 },
    paragraphIndex: 0,
    claim: '\u652f\u6301\u4e07\u7ea7\u5e76\u53d1',
    claimDigest: 'abc123',
    baselineRef: '\u5e76\u53d1\u652f\u6301: \u5343\u7ea7',
    matched: false,
    mismatchReason:
      '\u57fa\u7ebf\u4ec5\u652f\u6301\u5343\u7ea7\u5e76\u53d1\uff0c\u4e0d\u652f\u6301\u4e07\u7ea7',
  }

  it('@p0 should render mismatch marker for unmatched validation', () => {
    const { container } = render(<BaselineMismatchMarker validation={mismatchedValidation} />)
    const marker = container.querySelector('[data-testid="baseline-mismatch-marker"]')
    expect(marker).toBeInTheDocument()
  })

  it('@p0 should not render for matched validation', () => {
    const matched = { ...mismatchedValidation, matched: true }
    const { container } = render(<BaselineMismatchMarker validation={matched} />)
    expect(container.innerHTML).toBe('')
  })

  it('@p0 should have red color style', () => {
    const { container } = render(<BaselineMismatchMarker validation={mismatchedValidation} />)
    const marker = container.querySelector(
      '[data-testid="baseline-mismatch-marker"]'
    ) as HTMLElement
    expect(marker).toBeInTheDocument()
    // jsdom may normalize hex to rgb; accept either form
    const color = marker.style.color
    const isRedColor = color === '#FF4D4F' || color === 'rgb(255, 77, 79)' || color === '#ff4d4f'
    expect(isRedColor).toBe(true)
  })
})
