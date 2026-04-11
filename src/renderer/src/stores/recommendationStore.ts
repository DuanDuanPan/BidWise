import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { RecommendationContext, AssetRecommendation } from '@shared/recommendation-types'

export interface RecommendationState {
  currentSectionKey: string | null
  recommendations: AssetRecommendation[]
  ignoredAssetIds: Set<string>
  acceptedAssetIds: Set<string>
  loading: boolean
  error: string | null
}

export interface RecommendationActions {
  fetchRecommendations: (context: RecommendationContext) => Promise<void>
  ignoreRecommendation: (assetId: string) => void
  acceptRecommendation: (assetId: string) => void
  clearForSection: (sectionKey: string) => void
  clearError: () => void
}

export type RecommendationStore = RecommendationState & RecommendationActions

let requestNonce = 0

export const useRecommendationStore = create<RecommendationStore>()(
  subscribeWithSelector((set, get) => ({
    currentSectionKey: null,
    recommendations: [],
    ignoredAssetIds: new Set<string>(),
    acceptedAssetIds: new Set<string>(),
    loading: false,
    error: null,

    async fetchRecommendations(context: RecommendationContext): Promise<void> {
      const nonce = ++requestNonce
      const currentKey = get().currentSectionKey

      // If fetching for a different section than current, ignore (stale call)
      if (currentKey !== null && currentKey !== context.sectionKey) return

      set({ loading: true, error: null })

      try {
        const response = await window.api.assetRecommend(context)

        // Discard stale response: check both nonce and sectionKey
        if (requestNonce !== nonce || get().currentSectionKey !== context.sectionKey) return

        if (response.success) {
          const { ignoredAssetIds } = get()

          // Filter out ignored assets; accepted assets stay in list (rendered as "已插入")
          const recs = response.data.recommendations.filter((r) => !ignoredAssetIds.has(r.assetId))

          set({
            recommendations: recs,
            loading: false,
          })
        } else {
          set({ loading: false, error: response.error.message })
        }
      } catch (err) {
        // Only set error if this response is still relevant
        if (requestNonce === nonce && get().currentSectionKey === context.sectionKey) {
          set({ loading: false, error: (err as Error).message })
        }
      }
    },

    ignoreRecommendation(assetId: string): void {
      const { ignoredAssetIds, recommendations } = get()
      const newIgnored = new Set(ignoredAssetIds)
      newIgnored.add(assetId)
      set({
        ignoredAssetIds: newIgnored,
        recommendations: recommendations.filter((r) => r.assetId !== assetId),
      })
    },

    acceptRecommendation(assetId: string): void {
      const newAccepted = new Set(get().acceptedAssetIds)
      newAccepted.add(assetId)
      set({ acceptedAssetIds: newAccepted })
    },

    clearForSection(sectionKey: string): void {
      requestNonce++
      set({
        currentSectionKey: sectionKey,
        recommendations: [],
        ignoredAssetIds: new Set<string>(),
        acceptedAssetIds: new Set<string>(),
        loading: false,
        error: null,
      })
    },

    clearError(): void {
      set({ error: null })
    },
  }))
)
