import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  TerminologyEntry,
  CreateTerminologyInput,
  UpdateTerminologyInput,
  BatchCreateTerminologyInput,
  BatchCreateResult,
  TerminologyExportOutput,
} from '@shared/terminology-types'

export interface TerminologyState {
  entries: TerminologyEntry[]
  searchQuery: string
  categoryFilter: string | null
  activeOnly: boolean
  loading: boolean
  error: string | null
}

export interface TerminologyActions {
  loadEntries: () => Promise<void>
  createEntry: (input: CreateTerminologyInput) => Promise<void>
  updateEntry: (input: UpdateTerminologyInput) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  batchCreate: (input: BatchCreateTerminologyInput) => Promise<BatchCreateResult>
  exportJson: () => Promise<TerminologyExportOutput | null>
  setSearchQuery: (query: string) => void
  setCategoryFilter: (category: string | null) => void
  setActiveOnly: (active: boolean) => void
  clearError: () => void
}

export type TerminologyStore = TerminologyState & TerminologyActions

export const useTerminologyStore = create<TerminologyStore>()(
  subscribeWithSelector((set, get) => ({
    entries: [],
    searchQuery: '',
    categoryFilter: null,
    activeOnly: true,
    loading: false,
    error: null,

    async loadEntries(): Promise<void> {
      const { searchQuery, categoryFilter, activeOnly } = get()
      set({ loading: true, error: null })
      try {
        const filter: Record<string, unknown> = {}
        if (searchQuery.trim()) filter.searchQuery = searchQuery.trim()
        if (categoryFilter) filter.category = categoryFilter
        if (activeOnly) filter.isActive = true

        const response = await window.api.terminologyList(
          Object.keys(filter).length > 0 ? filter : undefined
        )
        if (response.success) {
          set({ entries: response.data, loading: false })
        } else {
          set({ loading: false, error: response.error.message })
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    async createEntry(input: CreateTerminologyInput): Promise<void> {
      set({ error: null })
      try {
        const response = await window.api.terminologyCreate(input)
        if (response.success) {
          await get().loadEntries()
        } else {
          set({ error: response.error.message })
          throw new Error(response.error.message)
        }
      } catch (err) {
        if (!get().error) {
          set({ error: (err as Error).message })
        }
        throw err
      }
    },

    async updateEntry(input: UpdateTerminologyInput): Promise<void> {
      set({ error: null })
      try {
        const response = await window.api.terminologyUpdate(input)
        if (response.success) {
          await get().loadEntries()
        } else {
          set({ error: response.error.message })
        }
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    async deleteEntry(id: string): Promise<void> {
      set({ error: null })
      try {
        const response = await window.api.terminologyDelete({ id })
        if (response.success) {
          await get().loadEntries()
        } else {
          set({ error: response.error.message })
        }
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    async batchCreate(input: BatchCreateTerminologyInput): Promise<BatchCreateResult> {
      set({ loading: true, error: null })
      try {
        const response = await window.api.terminologyBatchCreate(input)
        if (response.success) {
          await get().loadEntries()
          return response.data
        } else {
          set({ loading: false, error: response.error.message })
          throw new Error(response.error.message)
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
        throw err
      }
    },

    async exportJson(): Promise<TerminologyExportOutput | null> {
      set({ error: null })
      try {
        const response = await window.api.terminologyExport()
        if (response.success) {
          return response.data
        } else {
          set({ error: response.error.message })
          return null
        }
      } catch (err) {
        set({ error: (err as Error).message })
        return null
      }
    },

    setSearchQuery(query: string): void {
      set({ searchQuery: query })
    },

    setCategoryFilter(category: string | null): void {
      set({ categoryFilter: category })
    },

    setActiveOnly(active: boolean): void {
      set({ activeOnly: active })
    },

    clearError(): void {
      set({ error: null })
    },
  }))
)
