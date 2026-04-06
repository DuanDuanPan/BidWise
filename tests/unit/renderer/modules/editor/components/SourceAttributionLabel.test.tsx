import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SourceAttributionLabel } from '@modules/editor/components/SourceAttributionLabel'
import type { SourceAttribution } from '@shared/source-attribution-types'

afterEach(() => {
  cleanup()
  // Clean up Ant Design Popover portals
  document.body.innerHTML = ''
})

const baseAttribution: SourceAttribution = {
  id: 'sa-1',
  sectionLocator: { title: '\u7cfb\u7edf\u67b6\u6784', level: 2, occurrenceIndex: 0 },
  paragraphIndex: 0,
  paragraphDigest: 'abc123',
  sourceType: 'asset-library',
  sourceRef: 'cases/smart-city.md',
  snippet: '\u667a\u6167\u57ce\u5e02\u65b9\u6848',
  confidence: 0.85,
}

describe('@story-3-5 SourceAttributionLabel', () => {
  it('@p0 should render asset-library label', () => {
    const { container } = render(
      <SourceAttributionLabel attribution={baseAttribution} isEdited={false} />
    )
    const label = container.querySelector('[data-testid="source-attribution-label"]')!
    expect(label).toBeInTheDocument()
    expect(label.getAttribute('data-source-type')).toBe('asset-library')
    expect(label.textContent).toContain('\u8d44\u4ea7\u5e93')
  })

  it('@p0 should render no-source label with warning style', () => {
    const noSourceAttr = { ...baseAttribution, sourceType: 'no-source' as const }
    const { container } = render(
      <SourceAttributionLabel attribution={noSourceAttr} isEdited={false} />
    )
    const label = container.querySelector('[data-testid="source-attribution-label"]')!
    expect(label.getAttribute('data-source-type')).toBe('no-source')
    expect(label.textContent).toContain('\u65e0\u6765\u6e90')
  })

  it('@p0 should render user-edited as gray disabled state', () => {
    const { container } = render(
      <SourceAttributionLabel attribution={baseAttribution} isEdited={true} />
    )
    const label = container.querySelector('[data-testid="source-attribution-label"]')!
    expect(label.getAttribute('data-source-type')).toBe('user-edited')
    expect(label.textContent).toContain('\u5df2\u7f16\u8f91')
  })

  it('@p1 should render knowledge-base label', () => {
    const kbAttr = { ...baseAttribution, sourceType: 'knowledge-base' as const }
    const { container } = render(<SourceAttributionLabel attribution={kbAttr} isEdited={false} />)
    const label = container.querySelector('[data-testid="source-attribution-label"]')!
    expect(label.getAttribute('data-source-type')).toBe('knowledge-base')
  })

  it('@p1 should render ai-inference label', () => {
    const aiAttr = { ...baseAttribution, sourceType: 'ai-inference' as const }
    const { container } = render(<SourceAttributionLabel attribution={aiAttr} isEdited={false} />)
    const label = container.querySelector('[data-testid="source-attribution-label"]')!
    expect(label.getAttribute('data-source-type')).toBe('ai-inference')
  })
})
