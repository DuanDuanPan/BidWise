import type { AssetType, Tag } from './asset-types'

export interface RecommendationContext {
  sectionKey: string
  sectionTitle: string
  sectionContent: string
  projectId: string
}

export interface AssetRecommendation {
  assetId: string
  title: string
  summary: string
  assetType: AssetType
  tags: Tag[]
  matchScore: number
  sourceProject: string | null
}

export interface RecommendationResult {
  sectionKey: string
  recommendations: AssetRecommendation[]
}
