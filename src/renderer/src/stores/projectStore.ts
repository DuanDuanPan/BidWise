import { create } from 'zustand'
import type {
  ProjectListItem,
  ProjectRecord,
  CreateProjectInput,
  UpdateProjectInput,
} from '@shared/ipc-types'

export type QuickFilter = 'all' | 'active' | 'due-this-week' | 'has-warning'
export type SortMode = 'smart' | 'updated'

export interface ProjectFilter {
  quick: QuickFilter
  customer: string | null
  industry: string | null
  status: string | null
  deadlineBefore: string | null
}

export interface ProjectState {
  projects: ProjectListItem[]
  currentProject: ProjectRecord | null
  loading: boolean
  error: string | null
  filter: ProjectFilter
  sortMode: SortMode
}

export interface ProjectActions {
  loadProjects: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  createProject: (data: CreateProjectInput) => Promise<ProjectRecord>
  updateProject: (id: string, data: UpdateProjectInput) => Promise<ProjectRecord>
  deleteProject: (id: string) => Promise<void>
  archiveProject: (id: string) => Promise<ProjectRecord>
  setFilter: (filter: Partial<ProjectFilter>) => void
  setSortMode: (mode: SortMode) => void
  clearError: () => void
}

export type ProjectStore = ProjectState & ProjectActions

const defaultFilter: ProjectFilter = {
  quick: 'all',
  customer: null,
  industry: null,
  status: null,
  deadlineBefore: null,
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // State
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
  filter: defaultFilter,
  sortMode: 'smart',

  // Actions
  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectList()
      if (res.success) {
        set({ projects: res.data, loading: false })
      } else {
        set({ error: res.error.message, loading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  loadProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectGet(id)
      if (res.success) {
        set({ currentProject: res.data, loading: false })
      } else {
        set({ error: res.error.message, loading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createProject: async (data: CreateProjectInput) => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectCreate(data)
      if (res.success) {
        // Reload full list to get consistent ProjectListItem shape
        await get().loadProjects()
        return res.data
      } else {
        set({ error: res.error.message, loading: false })
        throw new Error(res.error.message)
      }
    } catch (err) {
      const msg = (err as Error).message
      if (!get().error) set({ error: msg, loading: false })
      throw err
    }
  },

  updateProject: async (id: string, data: UpdateProjectInput) => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectUpdate({ projectId: id, input: data })
      if (res.success) {
        await get().loadProjects()
        return res.data
      } else {
        set({ error: res.error.message, loading: false })
        throw new Error(res.error.message)
      }
    } catch (err) {
      const msg = (err as Error).message
      if (!get().error) set({ error: msg, loading: false })
      throw err
    }
  },

  deleteProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectDelete(id)
      if (res.success) {
        await get().loadProjects()
      } else {
        set({ error: res.error.message, loading: false })
        throw new Error(res.error.message)
      }
    } catch (err) {
      const msg = (err as Error).message
      if (!get().error) set({ error: msg, loading: false })
      throw err
    }
  },

  archiveProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const res = await window.api.projectArchive(id)
      if (res.success) {
        await get().loadProjects()
        return res.data
      } else {
        set({ error: res.error.message, loading: false })
        throw new Error(res.error.message)
      }
    } catch (err) {
      const msg = (err as Error).message
      if (!get().error) set({ error: msg, loading: false })
      throw err
    }
  },

  setFilter: (partial: Partial<ProjectFilter>) => {
    set((state) => ({ filter: { ...state.filter, ...partial } }))
  },

  setSortMode: (mode: SortMode) => {
    set({ sortMode: mode })
  },

  clearError: () => {
    set({ error: null })
  },
}))
