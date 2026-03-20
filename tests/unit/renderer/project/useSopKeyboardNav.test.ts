import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useSopKeyboardNav } from '@modules/project/hooks/useSopKeyboardNav'

describe('@story-1-6 useSopKeyboardNav', () => {
  afterEach(cleanup)

  it('@p0 Alt+2 triggers navigateToStage with solution-design', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '2', altKey: true })
    expect(navigateToStage).toHaveBeenCalledWith('solution-design')
  })

  it('@p0 Alt+3 triggers navigateToStage with proposal-writing', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '3', altKey: true })
    expect(navigateToStage).toHaveBeenCalledWith('proposal-writing')
  })

  it('@p0 Alt+4 triggers navigateToStage with cost-estimation', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '4', altKey: true })
    expect(navigateToStage).toHaveBeenCalledWith('cost-estimation')
  })

  it('@p0 Alt+5 triggers navigateToStage with compliance-review', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '5', altKey: true })
    expect(navigateToStage).toHaveBeenCalledWith('compliance-review')
  })

  it('@p0 Alt+6 triggers navigateToStage with delivery', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '6', altKey: true })
    expect(navigateToStage).toHaveBeenCalledWith('delivery')
  })

  it('@p1 ignores non-Alt key combos', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '2' }) // no Alt
    expect(navigateToStage).not.toHaveBeenCalled()
  })

  it('@p1 ignores Alt+1 (no shortcut for stage 1)', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '1', altKey: true })
    expect(navigateToStage).not.toHaveBeenCalled()
  })

  it('@p1 ignores Alt+7 and beyond', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '7', altKey: true })
    expect(navigateToStage).not.toHaveBeenCalled()
  })

  it('@p1 ignores Ctrl+Alt combos', () => {
    const navigateToStage = vi.fn()
    renderHook(() => useSopKeyboardNav(navigateToStage))
    fireEvent.keyDown(window, { key: '2', altKey: true, ctrlKey: true })
    expect(navigateToStage).not.toHaveBeenCalled()
  })

  it('@p1 cleans up listener on unmount', () => {
    const navigateToStage = vi.fn()
    const { unmount } = renderHook(() => useSopKeyboardNav(navigateToStage))
    unmount()
    fireEvent.keyDown(window, { key: '2', altKey: true })
    expect(navigateToStage).not.toHaveBeenCalled()
  })
})
