import { useEffect } from 'react'
import { Input, message } from 'antd'
import { ASSET_TYPES, ASSET_TYPE_LABELS } from '@shared/asset-types'
import { useAssetSearch } from '../hooks/useAssetSearch'
import { AssetResultList } from './AssetResultList'
import { AssetDetailCard } from './AssetDetailCard'

export function AssetSearchPage(): React.JSX.Element {
  const {
    rawQuery,
    assetTypes,
    results,
    total,
    loading,
    error,
    selectedAssetId,
    selectedAsset,
    selectedMatchScore,
    debouncedSearch,
    loadInitialAssets,
    toggleAssetType,
    resetAssetTypes,
    selectAsset,
    updateAssetTags,
    clearError,
  } = useAssetSearch()

  useEffect(() => {
    loadInitialAssets()
  }, [loadInitialAssets])

  useEffect(() => {
    if (error) {
      message.error(error)
      clearError()
    }
  }, [error, clearError])

  const isAllActive = assetTypes.length === 0

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F5F5',
        padding: 32,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1F1F1F', margin: 0 }}>资产库</h1>
        <p style={{ fontSize: 13, color: '#8C8C8C', margin: '4px 0 0' }}>
          通过关键词和标签快速检索可复用的历史素材
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="输入关键词或 #标签 搜索资产..."
          allowClear
          loading={loading}
          defaultValue={rawQuery}
          onChange={(e) => debouncedSearch(e.target.value)}
          onSearch={(value) => debouncedSearch(value)}
          style={{ maxWidth: 600 }}
          size="large"
        />
      </div>

      {/* Type Filter Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#595959' }}>资产类型：</span>
        <FilterChip label="全部" active={isAllActive} onClick={resetAssetTypes} />
        {ASSET_TYPES.map((type) => (
          <FilterChip
            key={type}
            label={ASSET_TYPE_LABELS[type]}
            active={assetTypes.includes(type)}
            onClick={() => toggleAssetType(type)}
          />
        ))}
      </div>

      {/* Content Area */}
      {selectedAsset ? (
        <AssetDetailCard
          asset={selectedAsset}
          matchScore={selectedMatchScore}
          onBack={() => selectAsset(null)}
          onUpdateTags={updateAssetTags}
        />
      ) : (
        <AssetResultList
          results={results}
          total={total}
          selectedAssetId={selectedAssetId}
          onSelect={(id) => selectAsset(id)}
        />
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontSize: 13,
        borderRadius: 4,
        border: `1px solid ${active ? '#1677FF' : '#D9D9D9'}`,
        background: active ? '#E6F4FF' : '#FFFFFF',
        color: active ? '#1677FF' : '#595959',
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  )
}
