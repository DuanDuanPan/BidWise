import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('platform utilities', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
    vi.resetModules()
  })

  describe('formatShortcut on macOS', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { platform: 'MacIntel' },
        configurable: true,
      })
    })

    it('should replace Ctrl+ with ⌘', async () => {
      const { formatShortcut } = await import('@renderer/shared/lib/platform')
      expect(formatShortcut('Ctrl+S')).toBe('⌘S')
    })

    it('should replace Alt+ with ⌥', async () => {
      const { formatShortcut } = await import('@renderer/shared/lib/platform')
      expect(formatShortcut('Alt+F')).toBe('⌥F')
    })

    it('should replace Shift+ with ⇧', async () => {
      const { formatShortcut } = await import('@renderer/shared/lib/platform')
      expect(formatShortcut('Shift+A')).toBe('⇧A')
    })

    it('should handle combined modifiers', async () => {
      const { formatShortcut } = await import('@renderer/shared/lib/platform')
      expect(formatShortcut('Ctrl+Shift+P')).toBe('⌘⇧P')
    })

    it('should export isMac as true', async () => {
      const { isMac } = await import('@renderer/shared/lib/platform')
      expect(isMac).toBe(true)
    })

    it('should export modKey as Cmd', async () => {
      const { modKey } = await import('@renderer/shared/lib/platform')
      expect(modKey).toBe('Cmd')
    })
  })

  describe('formatShortcut on Windows', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { platform: 'Win32' },
        configurable: true,
      })
    })

    it('should return shortcut unchanged', async () => {
      const { formatShortcut } = await import('@renderer/shared/lib/platform')
      expect(formatShortcut('Ctrl+S')).toBe('Ctrl+S')
    })

    it('should export isMac as false', async () => {
      const { isMac } = await import('@renderer/shared/lib/platform')
      expect(isMac).toBe(false)
    })

    it('should export modKey as Ctrl', async () => {
      const { modKey } = await import('@renderer/shared/lib/platform')
      expect(modKey).toBe('Ctrl')
    })
  })
})
