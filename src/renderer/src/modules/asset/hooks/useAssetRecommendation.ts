import { useEffect, useRef } from 'react'
import { useCurrentSection } from '@modules/annotation/hooks/useCurrentSection'
import { useDocumentStore, useRecommendationStore } from '@renderer/stores'
import { extractMarkdownSectionContent } from '@shared/chapter-markdown'
import type { CurrentSectionInfo } from '@modules/annotation/hooks/useCurrentSection'
import type { AssetRecommendation } from '@shared/recommendation-types'

const DEBOUNCE_MS = 2000

interface UseAssetRecommendationResult {
  currentSection: CurrentSectionInfo | null
  recommendations: AssetRecommendation[]
  loading: boolean
  acceptedAssetIds: Set<string>
  ignore: (assetId: string) => void
  accept: (assetId: string) => void
  clearError: () => void
}

export function useAssetRecommendation(projectId: string): UseAssetRecommendationResult {
  const currentSection = useCurrentSection({ minLevel: 1, maxLevel: 4 })
  const content = useDocumentStore((s) => s.content)

  const recommendations = useRecommendationStore((s) => s.recommendations)
  const loading = useRecommendationStore((s) => s.loading)
  const acceptedAssetIds = useRecommendationStore((s) => s.acceptedAssetIds)
  const fetchRecommendations = useRecommendationStore((s) => s.fetchRecommendations)
  const ignoreRecommendation = useRecommendationStore((s) => s.ignoreRecommendation)
  const acceptRecommendation = useRecommendationStore((s) => s.acceptRecommendation)
  const clearForSection = useRecommendationStore((s) => s.clearForSection)
  const clearError = useRecommendationStore((s) => s.clearError)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSectionKeyRef = useRef<string | null>(null)

  // Section change: clear + fetch immediately
  useEffect(() => {
    const sectionKey = currentSection?.sectionKey ?? null

    if (sectionKey !== lastSectionKeyRef.current) {
      lastSectionKeyRef.current = sectionKey

      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }

      if (!sectionKey || !currentSection) return

      clearForSection(sectionKey)

      const sectionContent = extractMarkdownSectionContent(content, currentSection.locator)

      fetchRecommendations({
        sectionKey,
        sectionTitle: currentSection.label,
        sectionContent,
        projectId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection?.sectionKey])

  // Content change within same section: debounced refresh
  useEffect(() => {
    const sectionKey = currentSection?.sectionKey ?? null
    if (!sectionKey || !currentSection) return

    // Only debounce if we're in the same section that was already initialized
    if (sectionKey !== lastSectionKeyRef.current) return

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      const sectionContent = extractMarkdownSectionContent(content, currentSection.locator)

      fetchRecommendations({
        sectionKey,
        sectionTitle: currentSection.label,
        sectionContent,
        projectId,
      })
    }, DEBOUNCE_MS)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return {
    currentSection,
    recommendations,
    loading,
    acceptedAssetIds,
    ignore: ignoreRecommendation,
    accept: acceptRecommendation,
    clearError,
  }
}
