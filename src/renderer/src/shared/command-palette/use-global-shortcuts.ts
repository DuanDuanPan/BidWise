import { useEffect } from 'react'
import type { MessageInstance } from 'antd/es/message/interface'
import { isMac } from '@renderer/shared/lib/platform'

export function useGlobalShortcuts(
  setOpen: (open: boolean) => void,
  isOpen: boolean,
  messageApi: MessageInstance
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return

      // Cmd/Ctrl+K → toggle command palette
      if (e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(!isOpen)
        return
      }

      // When palette is open, suppress other global shortcuts (Task 4.2/8.6)
      if (isOpen) {
        if (e.key === 's' || e.key === 'e') {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      // If event was already handled by a capture-phase listener (e.g., ProjectWorkspace Cmd+E), skip
      if (e.defaultPrevented) return

      // Cmd/Ctrl+S → auto-save intercept (AC2)
      if (e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        messageApi.info('已自动保存', 2)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOpen, isOpen, messageApi])
}
