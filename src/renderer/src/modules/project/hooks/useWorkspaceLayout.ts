import { useState, useEffect, useCallback, useRef } from 'react'

const COMPACT_BREAKPOINT = 1440
const RESIZE_THROTTLE_MS = 200

export interface WorkspaceLayoutState {
  outlineCollapsed: boolean
  sidebarCollapsed: boolean
  isCompact: boolean
  toggleOutline: () => void
  toggleSidebar: () => void
}

/**
 * 管理三栏布局面板折叠状态 + 响应式紧凑模式。
 *
 * - 窗口 <1440px 时自动折叠两侧面板
 * - 用户手动操作后设置 manualOverride，自动策略不再覆盖
 * - 窗口跨越断点时重置 manualOverride
 */
export function useWorkspaceLayout(): WorkspaceLayoutState {
  const isInitialCompact = typeof window !== 'undefined' && window.innerWidth < COMPACT_BREAKPOINT

  const [outlineCollapsed, setOutlineCollapsed] = useState(isInitialCompact)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isInitialCompact)
  const [isCompact, setIsCompact] = useState(isInitialCompact)

  // Track manual overrides per panel
  const outlineManualRef = useRef(false)
  const sidebarManualRef = useRef(false)
  const prevCompactRef = useRef(isInitialCompact)

  const toggleOutline = useCallback(() => {
    outlineManualRef.current = true
    setOutlineCollapsed((prev) => !prev)
  }, [])

  const toggleSidebar = useCallback(() => {
    sidebarManualRef.current = true
    setSidebarCollapsed((prev) => !prev)
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleResize = (): void => {
      if (timeoutId !== null) return
      timeoutId = setTimeout(() => {
        timeoutId = null
        const nowCompact = window.innerWidth < COMPACT_BREAKPOINT
        setIsCompact(nowCompact)

        // Crossing breakpoint resets manual overrides
        if (nowCompact !== prevCompactRef.current) {
          outlineManualRef.current = false
          sidebarManualRef.current = false
          prevCompactRef.current = nowCompact

          setOutlineCollapsed(nowCompact)
          setSidebarCollapsed(nowCompact)
        }
      }, RESIZE_THROTTLE_MS)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [])

  return {
    outlineCollapsed,
    sidebarCollapsed,
    isCompact,
    toggleOutline,
    toggleSidebar,
  }
}
