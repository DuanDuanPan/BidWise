export const isMac = navigator.platform.toUpperCase().includes('MAC')
export const modKey = isMac ? 'Cmd' : 'Ctrl'

/**
 * 格式化快捷键显示文本，自动 Ctrl↔Cmd 适配
 * 输入 'Ctrl+K' → macOS 输出 '⌘K'，Windows 输出 'Ctrl+K'
 */
export function formatShortcut(shortcut: string): string {
  if (isMac) {
    return shortcut
      .replace(/Ctrl\+/gi, '⌘')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Shift\+/gi, '⇧')
  }
  return shortcut
}
