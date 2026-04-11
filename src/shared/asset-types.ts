export type AssetType = 'text' | 'diagram' | 'table' | 'case'

export const ASSET_TYPES: AssetType[] = ['text', 'diagram', 'table', 'case']

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  text: '文字片段',
  diagram: '架构图',
  table: '表格',
  case: '案例',
}

export interface Asset {
  id: string
  projectId: string | null
  title: string
  summary: string
  content: string
  assetType: AssetType
  sourceProject: string | null
  sourceSection: string | null
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  name: string
  normalizedName: string
  createdAt: string
}

export interface AssetDetail extends Asset {
  tags: Tag[]
}

export interface AssetSearchQuery {
  rawQuery: string
  assetTypes: AssetType[]
}

export interface AssetListFilter {
  assetTypes?: AssetType[]
}

export interface AssetSearchResult {
  id: string
  title: string
  summary: string
  assetType: AssetType
  sourceProject: string | null
  tags: Tag[]
  matchScore: number
}

export interface AssetQueryResult {
  items: AssetSearchResult[]
  total: number
}

export interface UpdateAssetTagsInput {
  assetId: string
  tagNames: string[]
}
