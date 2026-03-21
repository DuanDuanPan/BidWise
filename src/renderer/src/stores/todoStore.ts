import { create } from 'zustand'
import type { ProjectWithPriority } from '@shared/ipc-types'

export interface TodoState {
  todoItems: ProjectWithPriority[]
  loading: boolean
  error: string | null
}

export interface TodoActions {
  loadTodos: () => Promise<void>
  clearError: () => void
}

export type TodoStore = TodoState & TodoActions

export const useTodoStore = create<TodoStore>((set) => ({
  todoItems: [],
  loading: false,
  error: null,

  loadTodos: async () => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectListWithPriority()
      if (res.success) {
        set({ todoItems: res.data, loading: false })
      } else {
        set({ error: res.error.message, loading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
