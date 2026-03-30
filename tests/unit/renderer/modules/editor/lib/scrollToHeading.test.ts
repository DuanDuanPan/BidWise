import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrollToHeading } from '@modules/editor/lib/scrollToHeading'

describe('@story-3-2 scrollToHeading', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('@p0 calls scrollIntoView for the matching heading', () => {
    const container = document.createElement('div')
    const heading = document.createElement('h2')
    heading.setAttribute('data-heading-text', '系统设计')
    const scrollIntoView = vi.fn()
    heading.scrollIntoView = scrollIntoView
    container.appendChild(heading)

    scrollToHeading(container, { title: '系统设计', occurrenceIndex: 0 })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('@p0 uses occurrenceIndex to resolve duplicate heading titles', () => {
    const container = document.createElement('div')
    const first = document.createElement('h2')
    const second = document.createElement('h2')
    first.setAttribute('data-heading-text', '项目概述')
    second.setAttribute('data-heading-text', '项目概述')
    const firstScroll = vi.fn()
    const secondScroll = vi.fn()
    first.scrollIntoView = firstScroll
    second.scrollIntoView = secondScroll
    container.append(first, second)

    scrollToHeading(container, { title: '项目概述', occurrenceIndex: 1 })

    expect(firstScroll).not.toHaveBeenCalled()
    expect(secondScroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('@p1 fails silently when the target heading is missing', () => {
    const container = document.createElement('div')
    expect(() =>
      scrollToHeading(container, { title: '不存在的标题', occurrenceIndex: 0 })
    ).not.toThrow()
  })
})
