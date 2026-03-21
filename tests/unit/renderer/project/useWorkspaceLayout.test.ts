import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspaceLayout } from '@modules/project/hooks/useWorkspaceLayout'

describe('@story-1-7 useWorkspaceLayout', () => {
  let originalInnerWidth: number

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
    vi.useFakeTimers()
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    vi.useRealTimers()
  })

  function setWindowWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    })
  }

  it('@p0 initializes expanded when window >= 1440px', () => {
    setWindowWidth(1440)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.outlineCollapsed).toBe(false)
    expect(result.current.sidebarCollapsed).toBe(false)
    expect(result.current.isCompact).toBe(false)
  })

  it('@p0 initializes collapsed when window < 1440px', () => {
    setWindowWidth(1200)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.outlineCollapsed).toBe(true)
    expect(result.current.sidebarCollapsed).toBe(true)
    expect(result.current.isCompact).toBe(true)
  })

  it('@p0 toggleOutline toggles outline panel', () => {
    setWindowWidth(1440)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.outlineCollapsed).toBe(false)
    act(() => result.current.toggleOutline())
    expect(result.current.outlineCollapsed).toBe(true)
    act(() => result.current.toggleOutline())
    expect(result.current.outlineCollapsed).toBe(false)
  })

  it('@p0 toggleSidebar toggles sidebar panel', () => {
    setWindowWidth(1440)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.sidebarCollapsed).toBe(false)
    act(() => result.current.toggleSidebar())
    expect(result.current.sidebarCollapsed).toBe(true)
    act(() => result.current.toggleSidebar())
    expect(result.current.sidebarCollapsed).toBe(false)
  })

  it('@p0 auto-collapses panels when window shrinks below 1440', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.outlineCollapsed).toBe(false)

    setWindowWidth(1200)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })

    expect(result.current.outlineCollapsed).toBe(true)
    expect(result.current.sidebarCollapsed).toBe(true)
    expect(result.current.isCompact).toBe(true)
  })

  it('@p0 auto-expands panels when window grows above 1440', () => {
    setWindowWidth(1200)
    const { result } = renderHook(() => useWorkspaceLayout())
    expect(result.current.outlineCollapsed).toBe(true)

    setWindowWidth(1600)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })

    expect(result.current.outlineCollapsed).toBe(false)
    expect(result.current.sidebarCollapsed).toBe(false)
    expect(result.current.isCompact).toBe(false)
  })

  it('@p1 manual override prevents auto-collapse within same breakpoint zone', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useWorkspaceLayout())

    // User manually collapses outline
    act(() => result.current.toggleOutline())
    expect(result.current.outlineCollapsed).toBe(true)

    // Resize within same breakpoint zone should not auto-expand
    setWindowWidth(1500)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.outlineCollapsed).toBe(true) // manual override preserved
  })

  it('@p1 crossing breakpoint resets manual override', () => {
    setWindowWidth(1600)
    const { result } = renderHook(() => useWorkspaceLayout())

    // User manually collapses
    act(() => result.current.toggleOutline())
    expect(result.current.outlineCollapsed).toBe(true)

    // Cross to compact
    setWindowWidth(1200)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.outlineCollapsed).toBe(true) // compact auto-collapse

    // Cross back to standard — override reset, so auto-expand
    setWindowWidth(1600)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.outlineCollapsed).toBe(false) // override was reset
  })
})
