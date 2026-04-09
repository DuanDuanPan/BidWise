import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useGlobalShortcuts } from '@renderer/shared/command-palette/use-global-shortcuts'

// Mock platform detection
vi.mock('@renderer/shared/lib/platform', () => ({
  isMac: true,
}))

function createMockMessageApi(): {
  info: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  warning: ReturnType<typeof vi.fn>
  loading: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
} {
  return {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    open: vi.fn(),
    destroy: vi.fn(),
  }
}

describe('@story-1-9 use-global-shortcuts', () => {
  let setOpen: ReturnType<typeof vi.fn>
  let messageApi: ReturnType<typeof createMockMessageApi>

  beforeEach(() => {
    setOpen = vi.fn()
    messageApi = createMockMessageApi()
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it('@p0 Cmd+K opens command palette (macOS)', () => {
    renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('@p0 Cmd+S shows auto-save toast', () => {
    renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(messageApi.info).toHaveBeenCalledWith('已自动保存', 2)
  })

  it('@story-8-2 @p0 Cmd+E does not trigger any global shortcut action (handled by workspace)', () => {
    renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    fireEvent.keyDown(window, { key: 'e', metaKey: true })
    // Cmd+E is now handled by ProjectWorkspace capture-phase listener, not global shortcuts
    expect(messageApi.info).not.toHaveBeenCalled()
  })

  it('@story-8-2 @p0 Cmd+E skips when already defaultPrevented', () => {
    renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    const event = new KeyboardEvent('keydown', { key: 'e', metaKey: true, cancelable: true })
    event.preventDefault() // Simulate capture-phase handler already handled it
    window.dispatchEvent(event)
    expect(messageApi.info).not.toHaveBeenCalled()
  })

  it('@p1 ignores key without modifier', () => {
    renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    fireEvent.keyDown(window, { key: 'k' })
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('@p1 cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(setOpen, false, messageApi as never))
    unmount()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('@p1 Escape not handled by global shortcuts (handled by CommandPalette)', () => {
    renderHook(() => useGlobalShortcuts(setOpen, true, messageApi as never))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(setOpen).not.toHaveBeenCalled()
  })

  it('@p0 Cmd+K closes palette when already open', () => {
    renderHook(() => useGlobalShortcuts(setOpen, true, messageApi as never))
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('@p0 Cmd+S is suppressed when palette is open', () => {
    renderHook(() => useGlobalShortcuts(setOpen, true, messageApi as never))
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(messageApi.info).not.toHaveBeenCalled()
  })

  it('@p0 Cmd+E is suppressed when palette is open', () => {
    renderHook(() => useGlobalShortcuts(setOpen, true, messageApi as never))
    fireEvent.keyDown(window, { key: 'e', metaKey: true })
    expect(messageApi.info).not.toHaveBeenCalled()
  })
})
