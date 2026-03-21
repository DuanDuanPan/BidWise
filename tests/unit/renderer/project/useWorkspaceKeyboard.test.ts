import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkspaceKeyboard } from '@modules/project/hooks/useWorkspaceKeyboard'

describe('@story-1-7 useWorkspaceKeyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function fireKeydown(key: string, opts: Partial<KeyboardEventInit> = {}): void {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
    )
  }

  it('@p0 Cmd+B triggers toggleSidebar on macOS', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    fireKeydown('b', { metaKey: true })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
    expect(toggleOutline).not.toHaveBeenCalled()
  })

  it('@p0 Ctrl+B triggers toggleSidebar on Windows', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    fireKeydown('b', { ctrlKey: true })
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('@p0 Cmd+\\ triggers toggleOutline', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    fireKeydown('\\', { metaKey: true })
    expect(toggleOutline).toHaveBeenCalledTimes(1)
    expect(toggleSidebar).not.toHaveBeenCalled()
  })

  it('@p0 Ctrl+\\ triggers toggleOutline', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    fireKeydown('\\', { ctrlKey: true })
    expect(toggleOutline).toHaveBeenCalledTimes(1)
  })

  it('@p1 plain B key does not trigger toggleSidebar', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    fireKeydown('b')
    expect(toggleSidebar).not.toHaveBeenCalled()
  })

  it('@p1 cleans up listener on unmount', () => {
    const toggleSidebar = vi.fn()
    const toggleOutline = vi.fn()
    const { unmount } = renderHook(() => useWorkspaceKeyboard(toggleSidebar, toggleOutline))

    unmount()
    fireKeydown('b', { metaKey: true })
    expect(toggleSidebar).not.toHaveBeenCalled()
  })
})
