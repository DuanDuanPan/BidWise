import { useEffect } from 'react'

/**
 * 面板折叠快捷键。
 * - Cmd/Ctrl+B → 切换右侧批注面板
 * - Cmd/Ctrl+\ → 切换左侧大纲面板
 */
export function useWorkspaceKeyboard(toggleSidebar: () => void, toggleOutline: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        toggleSidebar()
      } else if (e.key === '\\') {
        e.preventDefault()
        toggleOutline()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar, toggleOutline])
}
