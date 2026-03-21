import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTodoPanel } from '@modules/project/hooks/useTodoPanel'

function setWindowWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
}

describe('useTodoPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setWindowWidth(1600)
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.sessionStorage.clear()
  })

  it('starts expanded when window >= 1280', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useTodoPanel())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.isCompact).toBe(false)
  })

  it('starts collapsed when window < 1280', () => {
    setWindowWidth(1024)
    const { result } = renderHook(() => useTodoPanel())
    expect(result.current.collapsed).toBe(true)
    expect(result.current.isCompact).toBe(true)
  })

  it('toggles collapsed state on manual toggle', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useTodoPanel())
    expect(result.current.collapsed).toBe(false)

    act(() => {
      result.current.togglePanel()
    })
    expect(result.current.collapsed).toBe(true)

    act(() => {
      result.current.togglePanel()
    })
    expect(result.current.collapsed).toBe(false)
  })

  it('persists manual state across remounts in the same session', () => {
    setWindowWidth(1600)
    const firstRender = renderHook(() => useTodoPanel())

    act(() => {
      firstRender.result.current.togglePanel()
    })
    expect(firstRender.result.current.collapsed).toBe(true)

    firstRender.unmount()

    const secondRender = renderHook(() => useTodoPanel())
    expect(secondRender.result.current.collapsed).toBe(true)
    expect(secondRender.result.current.isCompact).toBe(false)
  })

  it('ignores persisted state after remounting in a different breakpoint mode', () => {
    setWindowWidth(1600)
    const firstRender = renderHook(() => useTodoPanel())
    expect(firstRender.result.current.collapsed).toBe(false)

    firstRender.unmount()
    setWindowWidth(1000)

    const secondRender = renderHook(() => useTodoPanel())
    expect(secondRender.result.current.collapsed).toBe(true)
    expect(secondRender.result.current.isCompact).toBe(true)
  })

  it('auto-collapses when window shrinks below 1280', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useTodoPanel())
    expect(result.current.collapsed).toBe(false)

    act(() => {
      setWindowWidth(1000)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })

    expect(result.current.collapsed).toBe(true)
    expect(result.current.isCompact).toBe(true)
  })

  it('auto-expands when window grows above 1280', () => {
    setWindowWidth(1000)
    const { result } = renderHook(() => useTodoPanel())
    expect(result.current.collapsed).toBe(true)

    act(() => {
      setWindowWidth(1600)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })

    expect(result.current.collapsed).toBe(false)
    expect(result.current.isCompact).toBe(false)
  })

  it('resets manual override when crossing breakpoint', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useTodoPanel())

    // Manual collapse
    act(() => {
      result.current.togglePanel()
    })
    expect(result.current.collapsed).toBe(true)

    // Cross breakpoint — should override manual state
    act(() => {
      setWindowWidth(1000)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.collapsed).toBe(true)

    // Cross back — should reset manual override and auto-expand
    act(() => {
      setWindowWidth(1600)
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.collapsed).toBe(false)
  })
})
