import { useState, useEffect, useCallback, useRef } from 'react'

const TODO_PANEL_BREAKPOINT = 1280
const RESIZE_THROTTLE_MS = 200
const TODO_PANEL_STORAGE_KEY = 'bidwise.todo-panel'

export interface TodoPanelState {
  collapsed: boolean
  isCompact: boolean
  togglePanel: () => void
}

interface PersistedTodoPanelState {
  collapsed: boolean
  isCompact: boolean
}

function getIsCompact(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < TODO_PANEL_BREAKPOINT
}

function readPersistedTodoPanelState(): PersistedTodoPanelState | null {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.sessionStorage.getItem(TODO_PANEL_STORAGE_KEY)
    if (!rawValue) return null

    const parsedValue = JSON.parse(rawValue) as Partial<PersistedTodoPanelState>
    if (typeof parsedValue.collapsed !== 'boolean' || typeof parsedValue.isCompact !== 'boolean') {
      return null
    }

    return {
      collapsed: parsedValue.collapsed,
      isCompact: parsedValue.isCompact,
    }
  } catch {
    return null
  }
}

function persistTodoPanelState(state: PersistedTodoPanelState): void {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(TODO_PANEL_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and keep panel state in memory only.
  }
}

export function useTodoPanel(): TodoPanelState {
  const isInitialCompact = getIsCompact()
  const persistedState = readPersistedTodoPanelState()
  const initialCollapsed =
    persistedState && persistedState.isCompact === isInitialCompact
      ? persistedState.collapsed
      : isInitialCompact

  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [isCompact, setIsCompact] = useState(isInitialCompact)

  const prevCompactRef = useRef(isInitialCompact)

  const togglePanel = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  useEffect(() => {
    persistTodoPanelState({ collapsed, isCompact })
  }, [collapsed, isCompact])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleResize = (): void => {
      if (timeoutId !== null) return
      timeoutId = setTimeout(() => {
        timeoutId = null
        const nowCompact = getIsCompact()

        setIsCompact(nowCompact)

        if (nowCompact !== prevCompactRef.current) {
          prevCompactRef.current = nowCompact
          setCollapsed(nowCompact)
        }
      }, RESIZE_THROTTLE_MS)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [])

  return { collapsed, isCompact, togglePanel }
}
