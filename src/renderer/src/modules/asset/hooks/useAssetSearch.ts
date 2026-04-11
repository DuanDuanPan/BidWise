import { useCallback, useEffect, useRef } from 'react'
import { useAssetStore } from '@renderer/stores/assetStore'
import type {
  AssetType,
  AssetSearchResult,
  AssetDetail,
  UpdateAssetTagsInput,
} from '@shared/asset-types'

interface UseAssetSearchReturn {
  rawQuery: string
  assetTypes: AssetType[]
  results: AssetSearchResult[]
  total: number
  loading: boolean
  error: string | null
  selectedAssetId: string | null
  selectedAsset: AssetDetail | null
  debouncedSearch: (query: string) => void
  loadInitialAssets: () => Promise<void>
  toggleAssetType: (type: AssetType) => void
  resetAssetTypes: () => void
  selectAsset: (id: string | null) => Promise<void>
  updateAssetTags: (input: UpdateAssetTagsInput) => Promise<void>
  clearError: () => void
}

export function useAssetSearch(): UseAssetSearchReturn {
  const {
    rawQuery,
    assetTypes,
    results,
    total,
    loading,
    error,
    selectedAssetId,
    selectedAsset,
    search,
    loadInitialAssets,
    toggleAssetType,
    resetAssetTypes,
    selectAsset,
    updateAssetTags,
    clearError,
  } = useAssetStore()

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSearchRef = useRef<{ query: string; types: AssetType[] }>({ query: '', types: [] })

  const debouncedSearch = useCallback(
    (query: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        search(query)
        timerRef.current = null
      }, 300)
    },
    [search]
  )

  // Trigger search when assetTypes change (if there's an active query or filter)
  useEffect(() => {
    const prev = lastSearchRef.current
    if (prev.query !== rawQuery || JSON.stringify(prev.types) !== JSON.stringify(assetTypes)) {
      lastSearchRef.current = { query: rawQuery, types: assetTypes }
      search()
    }
    // Only re-trigger when assetTypes changes (query changes go through debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTypes])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    rawQuery,
    assetTypes,
    results,
    total,
    loading,
    error,
    selectedAssetId,
    selectedAsset,
    debouncedSearch,
    loadInitialAssets,
    toggleAssetType,
    resetAssetTypes,
    selectAsset,
    updateAssetTags,
    clearError,
  }
}
