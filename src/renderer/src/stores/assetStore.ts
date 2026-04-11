import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AssetType,
  AssetSearchResult,
  AssetDetail,
  UpdateAssetTagsInput,
} from '@shared/asset-types'

export interface AssetState {
  rawQuery: string
  assetTypes: AssetType[]
  results: AssetSearchResult[]
  total: number
  loading: boolean
  error: string | null
  selectedAssetId: string | null
  selectedAsset: AssetDetail | null
}

export interface AssetActions {
  loadInitialAssets: () => Promise<void>
  search: (rawQuery?: string) => Promise<void>
  toggleAssetType: (type: AssetType) => void
  resetAssetTypes: () => void
  selectAsset: (id: string | null) => Promise<void>
  updateAssetTags: (input: UpdateAssetTagsInput) => Promise<void>
  clearError: () => void
}

export type AssetStore = AssetState & AssetActions

export const useAssetStore = create<AssetStore>()(
  subscribeWithSelector((set, get) => ({
    rawQuery: '',
    assetTypes: [],
    results: [],
    total: 0,
    loading: false,
    error: null,
    selectedAssetId: null,
    selectedAsset: null,

    async loadInitialAssets(): Promise<void> {
      set({ loading: true, error: null })
      try {
        const response = await window.api.assetList()
        if (response.success) {
          set({
            results: response.data.items,
            total: response.data.total,
            loading: false,
          })
        } else {
          set({ loading: false, error: response.error.message })
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    async search(rawQuery?: string): Promise<void> {
      const state = get()
      const query = rawQuery !== undefined ? rawQuery : state.rawQuery

      set({
        rawQuery: query,
        loading: true,
        error: null,
        selectedAssetId: null,
        selectedAsset: null,
      })

      try {
        const trimmed = query.trim()
        if (!trimmed && state.assetTypes.length === 0) {
          const response = await window.api.assetList()
          if (response.success) {
            set({
              results: response.data.items,
              total: response.data.total,
              loading: false,
            })
          } else {
            set({ loading: false, error: response.error.message })
          }
          return
        }

        const response = await window.api.assetSearch({
          rawQuery: query,
          assetTypes: get().assetTypes,
        })
        if (response.success) {
          set({
            results: response.data.items,
            total: response.data.total,
            loading: false,
          })
        } else {
          set({ loading: false, error: response.error.message })
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    toggleAssetType(type: AssetType): void {
      const current = get().assetTypes
      const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
      set({
        assetTypes: next,
        selectedAssetId: null,
        selectedAsset: null,
      })
    },

    resetAssetTypes(): void {
      set({
        assetTypes: [],
        selectedAssetId: null,
        selectedAsset: null,
      })
    },

    async selectAsset(id: string | null): Promise<void> {
      if (!id) {
        set({ selectedAssetId: null, selectedAsset: null })
        return
      }

      set({ selectedAssetId: id, error: null })
      try {
        const response = await window.api.assetGet({ id })
        if (response.success) {
          set({ selectedAsset: response.data })
        } else {
          set({ error: response.error.message })
        }
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    async updateAssetTags(input: UpdateAssetTagsInput): Promise<void> {
      try {
        const response = await window.api.assetUpdateTags(input)
        if (response.success) {
          const state = get()
          // Refresh selected asset detail
          if (state.selectedAssetId === input.assetId) {
            const detailResp = await window.api.assetGet({ id: input.assetId })
            if (detailResp.success) {
              set({ selectedAsset: detailResp.data })
            }
          }
          // Refresh result list tags
          const newTags = response.data
          set((s) => ({
            results: s.results.map((r) => (r.id === input.assetId ? { ...r, tags: newTags } : r)),
          }))
        } else {
          set({ error: response.error.message })
        }
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    clearError(): void {
      set({ error: null })
    },
  }))
)
