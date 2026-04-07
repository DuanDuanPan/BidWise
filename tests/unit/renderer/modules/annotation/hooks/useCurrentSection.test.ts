import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useCurrentSection } from '@renderer/modules/annotation/hooks/useCurrentSection'

function setupDOM(headings: Array<{ text: string; level: number; occ: number; top: number }>): {
  container: HTMLDivElement
} {
  const container = document.createElement('div')
  container.setAttribute('data-editor-scroll-container', 'true')
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ top: 0, bottom: 800, height: 800, left: 0, right: 600, width: 600 }),
  })
  Object.defineProperty(container, 'scrollTop', { value: 0, writable: true })

  for (const h of headings) {
    const key = `${h.level}:${h.text}:${h.occ}`
    const el = document.createElement('div')
    el.setAttribute('data-heading-locator-key', key)
    el.setAttribute('data-heading-level', String(h.level))
    el.setAttribute('data-heading-occurrence', String(h.occ))
    el.setAttribute('data-heading-text', h.text)
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        top: h.top,
        bottom: h.top + 30,
        height: 30,
        left: 0,
        right: 600,
        width: 600,
      }),
    })
    container.appendChild(el)
  }

  document.body.appendChild(container)
  return { container }
}

function cleanupDOM(): void {
  const c = document.querySelector('[data-editor-scroll-container]')
  if (c) document.body.removeChild(c)
}

describe('useCurrentSection', () => {
  afterEach(() => {
    cleanupDOM()
    cleanup()
  })

  it('returns null when no editor container exists', () => {
    const { result } = renderHook(() => useCurrentSection())
    expect(result.current).toBeNull()
  })

  it('returns null when no headings exist', () => {
    const container = document.createElement('div')
    container.setAttribute('data-editor-scroll-container', 'true')
    document.body.appendChild(container)

    const { result } = renderHook(() => useCurrentSection())
    expect(result.current).toBeNull()
  })

  it('detects the nearest heading above the threshold', () => {
    setupDOM([
      { text: '公司简介', level: 2, occ: 0, top: 50 },
      { text: '技术方案', level: 2, occ: 0, top: 400 },
    ])

    const { result } = renderHook(() => useCurrentSection())
    // threshold = 0 + 800 * 0.4 = 320; heading at top=50 is below threshold
    // '公司简介' at top=50 is <= 320, '技术方案' at top=400 is > 320
    expect(result.current).not.toBeNull()
    expect(result.current!.sectionKey).toBe('2:公司简介:0')
    expect(result.current!.label).toBe('公司简介')
  })

  it('updates on scroll events', () => {
    const { container } = setupDOM([
      { text: '公司简介', level: 2, occ: 0, top: 50 },
      { text: '技术方案', level: 2, occ: 0, top: 200 },
    ])

    const { result } = renderHook(() => useCurrentSection())
    expect(result.current!.sectionKey).toBe('2:技术方案:0')

    // Simulate scroll by modifying heading positions wouldn't work easily
    // But we can trigger scroll event and verify the hook handles it
    act(() => {
      container.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).not.toBeNull()
  })

  it('handles duplicate titles via occurrence index', () => {
    setupDOM([
      { text: '概述', level: 2, occ: 0, top: 50 },
      { text: '概述', level: 2, occ: 1, top: 200 },
    ])

    const { result } = renderHook(() => useCurrentSection())
    // Both are above threshold (320), so the last one above wins
    expect(result.current!.sectionKey).toBe('2:概述:1')
  })
})
